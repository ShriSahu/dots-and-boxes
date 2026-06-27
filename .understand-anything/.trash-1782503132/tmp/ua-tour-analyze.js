#!/usr/bin/env node
'use strict';

const fs = require('fs');

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error('Usage: node ua-tour-analyze.js <input.json> <output.json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  // Filter out function-level nodes; keep only file-level node types.
  const FILE_TYPES = new Set([
    'file', 'config', 'document', 'service', 'pipeline',
    'table', 'schema', 'resource', 'endpoint'
  ]);
  const nodes = (raw.nodes || []).filter(n => FILE_TYPES.has(n.type));
  const nodeIds = new Set(nodes.map(n => n.id));

  // Keep edges where both ends are file-level nodes.
  const edges = (raw.edges || []).filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target)
  );
  const layers = raw.layers || [];

  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });

  // A. Fan-in / B. Fan-out
  const fanIn = {};
  const fanOut = {};
  nodes.forEach(n => { fanIn[n.id] = 0; fanOut[n.id] = 0; });
  edges.forEach(e => {
    fanOut[e.source] = (fanOut[e.source] || 0) + 1;
    fanIn[e.target] = (fanIn[e.target] || 0) + 1;
  });

  const fanInRanking = nodes
    .map(n => ({ id: n.id, fanIn: fanIn[n.id], name: n.name }))
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 20);

  const fanOutRanking = nodes
    .map(n => ({ id: n.id, fanOut: fanOut[n.id], name: n.name }))
    .sort((a, b) => b.fanOut - a.fanOut)
    .slice(0, 20);

  // C. Entry point candidates
  const ENTRY_NAMES = new Set([
    'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
    'server.ts', 'server.js', 'mod.rs', 'main.go', 'main.py', 'main.rs',
    'manage.py', 'app.py', 'wsgi.py', 'asgi.py', 'run.py', '__main__.py',
    'Application.java', 'Main.java', 'Program.cs', 'config.ru', 'index.php',
    'App.swift', 'Application.kt', 'main.cpp', 'main.c',
    // RN/Expo extras
    '_layout.tsx', 'index.tsx', 'App.tsx'
  ]);

  const fanOutValues = nodes.map(n => fanOut[n.id]).sort((a, b) => b - a);
  const top10pctIdx = Math.max(0, Math.floor(fanOutValues.length * 0.1) - 1);
  const top10pctThreshold = fanOutValues.length ? fanOutValues[top10pctIdx] : 0;

  const fanInValuesAsc = nodes.map(n => fanIn[n.id]).sort((a, b) => a - b);
  const bottom25Idx = Math.max(0, Math.floor(fanInValuesAsc.length * 0.25) - 1);
  const bottom25Threshold = fanInValuesAsc.length ? fanInValuesAsc[bottom25Idx] : 0;

  function depthOf(fp) {
    return (fp || '').split('/').length - 1;
  }

  const entryScores = nodes.map(n => {
    let score = 0;
    const fp = n.filePath || '';
    const name = n.name || '';
    if (n.type === 'document') {
      if (name === 'README.md' && depthOf(fp) === 0) score += 5;
      else if (name.endsWith('.md') && depthOf(fp) === 0) score += 2;
    } else if (n.type === 'file') {
      if (ENTRY_NAMES.has(name)) score += 3;
      if (depthOf(fp) <= 1) score += 1;
      if (fanOut[n.id] >= top10pctThreshold && fanOut[n.id] > 0) score += 1;
      if (fanIn[n.id] <= bottom25Threshold) score += 1;
    }
    return { id: n.id, score, name: n.name, summary: n.summary, type: n.type };
  });

  const entryPointCandidates = entryScores
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // D. BFS from top CODE entry point
  const adj = {};
  nodes.forEach(n => { adj[n.id] = []; });
  edges.forEach(e => {
    if (e.type === 'imports' || e.type === 'calls') {
      adj[e.source].push(e.target);
    }
  });

  const codeEntry = entryScores
    .filter(e => e.type !== 'document' && e.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  let bfsTraversal = { startNode: null, order: [], depthMap: {}, byDepth: {} };
  if (codeEntry) {
    const start = codeEntry.id;
    const visited = new Set([start]);
    const depthMap = { [start]: 0 };
    const order = [start];
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      (adj[cur] || []).forEach(nb => {
        if (!visited.has(nb)) {
          visited.add(nb);
          depthMap[nb] = depthMap[cur] + 1;
          order.push(nb);
          queue.push(nb);
        }
      });
    }
    const byDepth = {};
    order.forEach(id => {
      const d = depthMap[id];
      (byDepth[d] = byDepth[d] || []).push(id);
    });
    bfsTraversal = { startNode: start, order, depthMap, byDepth };
  }

  // E. Non-code inventory
  const nonCodeFiles = { documentation: [], infrastructure: [], data: [], config: [] };
  nodes.forEach(n => {
    const entry = { id: n.id, name: n.name, type: n.type, summary: n.summary };
    if (n.type === 'document') nonCodeFiles.documentation.push(entry);
    else if (['service', 'pipeline', 'resource'].includes(n.type)) nonCodeFiles.infrastructure.push(entry);
    else if (['table', 'schema', 'endpoint'].includes(n.type)) nonCodeFiles.data.push(entry);
    else if (n.type === 'config') nonCodeFiles.config.push(entry);
  });

  // F. Clusters via bidirectional edges
  const pairKey = (a, b) => [a, b].sort().join('||');
  const edgeSet = new Set();
  edges.forEach(e => {
    if (e.type === 'imports' || e.type === 'calls') edgeSet.add(e.source + '>>' + e.target);
  });
  const biPairs = [];
  const seenPair = new Set();
  edges.forEach(e => {
    if (!(e.type === 'imports' || e.type === 'calls')) return;
    if (edgeSet.has(e.target + '>>' + e.source)) {
      const k = pairKey(e.source, e.target);
      if (!seenPair.has(k)) { seenPair.add(k); biPairs.push([e.source, e.target]); }
    }
  });

  // Build undirected neighbor map (import/calls) for cluster expansion
  const undAdj = {};
  nodes.forEach(n => { undAdj[n.id] = new Set(); });
  edges.forEach(e => {
    if (e.type === 'imports' || e.type === 'calls') {
      undAdj[e.source].add(e.target);
      undAdj[e.target].add(e.source);
    }
  });

  const clusters = [];
  const clusterSeen = new Set();
  biPairs.forEach(([a, b]) => {
    const members = new Set([a, b]);
    // expand: add nodes connected to 2+ members
    let changed = true;
    while (changed && members.size < 5) {
      changed = false;
      const candidates = {};
      members.forEach(m => {
        undAdj[m].forEach(nb => {
          if (!members.has(nb)) candidates[nb] = (candidates[nb] || 0) + 1;
        });
      });
      let best = null;
      Object.keys(candidates).forEach(c => {
        if (candidates[c] >= 2 && (!best || candidates[c] > candidates[best])) best = c;
      });
      if (best) { members.add(best); changed = true; }
    }
    const arr = Array.from(members).sort();
    const key = arr.join('||');
    if (!clusterSeen.has(key)) {
      clusterSeen.add(key);
      // count edges among members
      let ec = 0;
      arr.forEach(m => {
        undAdj[m].forEach(nb => { if (members.has(nb)) ec++; });
      });
      clusters.push({ nodes: arr, edgeCount: ec });
    }
  });
  clusters.sort((a, b) => b.edgeCount - a.edgeCount);
  const topClusters = clusters.slice(0, 10);

  // G. Layers
  const layerList = layers.map(l => ({ id: l.id, name: l.name, description: l.description }));

  // H. Node summary index
  const nodeSummaryIndex = {};
  nodes.forEach(n => {
    nodeSummaryIndex[n.id] = { name: n.name, type: n.type, summary: n.summary };
  });

  const result = {
    scriptCompleted: true,
    entryPointCandidates: entryPointCandidates.map(e => ({
      id: e.id, score: e.score, name: e.name, summary: e.summary
    })),
    fanInRanking,
    fanOutRanking,
    bfsTraversal,
    nonCodeFiles,
    clusters: topClusters,
    layers: { count: layerList.length, list: layerList },
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error('Fatal error:', err && err.stack ? err.stack : err);
  process.exit(1);
}
