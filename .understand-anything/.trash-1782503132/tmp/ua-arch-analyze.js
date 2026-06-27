#!/usr/bin/env node
'use strict';
const fs = require('fs');

function main() {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  if (!inPath || !outPath) {
    console.error('Usage: node ua-arch-analyze.js <input.json> <output.json>');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const fileNodes = data.fileNodes || [];
  const importEdges = data.importEdges || [];
  const allEdges = data.allEdges || [];

  const idToNode = new Map();
  fileNodes.forEach(n => idToNode.set(n.id, n));

  // ---- Common prefix detection ----
  const paths = fileNodes.map(n => (n.filePath || '').replace(/\\/g, '/'));
  function commonPrefix(arr) {
    if (arr.length === 0) return '';
    const dirArrays = arr.map(p => {
      const idx = p.lastIndexOf('/');
      return idx === -1 ? [] : p.slice(0, idx).split('/');
    });
    let prefix = [];
    const first = dirArrays[0];
    for (let i = 0; i < first.length; i++) {
      const seg = first[i];
      if (dirArrays.every(d => d[i] === seg)) prefix.push(seg);
      else break;
    }
    return prefix.length ? prefix.join('/') + '/' : '';
  }
  const prefix = commonPrefix(paths);

  function groupOf(filePath) {
    let p = (filePath || '').replace(/\\/g, '/');
    if (prefix && p.startsWith(prefix)) p = p.slice(prefix.length);
    const idx = p.indexOf('/');
    if (idx === -1) return '(root)';
    return p.slice(0, idx);
  }

  // ---- A. Directory grouping ----
  const directoryGroups = {};
  const idToGroup = new Map();
  fileNodes.forEach(n => {
    const grp = groupOf(n.filePath);
    (directoryGroups[grp] = directoryGroups[grp] || []).push(n.id);
    idToGroup.set(n.id, grp);
  });

  // ---- B. Node type grouping ----
  const nodeTypeGroups = {};
  fileNodes.forEach(n => {
    (nodeTypeGroups[n.type] = nodeTypeGroups[n.type] || []).push(n.id);
  });

  // ---- C. Import adjacency, fan-in/out ----
  const fanOut = {}, fanIn = {};
  fileNodes.forEach(n => { fanOut[n.id] = 0; fanIn[n.id] = 0; });
  importEdges.forEach(e => {
    if (fanOut[e.source] !== undefined) fanOut[e.source]++;
    if (fanIn[e.target] !== undefined) fanIn[e.target]++;
  });

  // ---- D. Cross-category edges ----
  const crossMap = {};
  allEdges.forEach(e => {
    const s = idToNode.get(e.source), t = idToNode.get(e.target);
    if (!s || !t) return;
    if (s.type === t.type && s.type === 'file') return; // skip pure file->file here
    const key = s.type + '|' + t.type + '|' + e.type;
    crossMap[key] = (crossMap[key] || 0) + 1;
  });
  const crossCategoryEdges = Object.entries(crossMap).map(([k, count]) => {
    const [fromType, toType, edgeType] = k.split('|');
    return { fromType, toType, edgeType, count };
  });

  // ---- E. Inter-group import frequency ----
  const interMap = {};
  importEdges.forEach(e => {
    const fg = idToGroup.get(e.source), tg = idToGroup.get(e.target);
    if (fg === undefined || tg === undefined || fg === tg) return;
    const key = fg + '|' + tg;
    interMap[key] = (interMap[key] || 0) + 1;
  });
  const interGroupImports = Object.entries(interMap).map(([k, count]) => {
    const [from, to] = k.split('|');
    return { from, to, count };
  }).sort((a, b) => b.count - a.count);

  // ---- F. Intra-group density ----
  const intraGroupDensity = {};
  Object.keys(directoryGroups).forEach(g => {
    intraGroupDensity[g] = { internalEdges: 0, totalEdges: 0, density: 0 };
  });
  importEdges.forEach(e => {
    const fg = idToGroup.get(e.source), tg = idToGroup.get(e.target);
    if (fg !== undefined) intraGroupDensity[fg].totalEdges++;
    if (tg !== undefined && tg !== fg) intraGroupDensity[tg].totalEdges++;
    if (fg !== undefined && fg === tg) intraGroupDensity[fg].internalEdges++;
  });
  Object.keys(intraGroupDensity).forEach(g => {
    const d = intraGroupDensity[g];
    d.density = d.totalEdges ? +(d.internalEdges / d.totalEdges).toFixed(3) : 0;
  });

  // ---- G. Pattern matching ----
  const dirPatterns = [
    [/^(routes|api|controllers|endpoints|handlers|controller|routers|blueprints|serializers)$/, 'api'],
    [/^(services|core|lib|domain|logic|composables|signals|mailers|jobs|channels|internal)$/, 'service'],
    [/^(models|db|data|persistence|repository|entities|migrations|entity|sql|database)$/, 'data'],
    [/^(components|views|pages|ui|layouts|screens)$/, 'ui'],
    [/^(middleware|plugins|interceptors|guards)$/, 'middleware'],
    [/^(utils|helpers|common|shared|tools|pkg|templatetags)$/, 'utility'],
    [/^(config|constants|env|settings|management|commands)$/, 'config'],
    [/^(__tests__|test|tests|spec|specs)$/, 'test'],
    [/^(types|interfaces|schemas|contracts|dtos|dto|request|response)$/, 'types'],
    [/^hooks$/, 'hooks'],
    [/^(store|state|reducers|actions|slices)$/, 'state'],
    [/^(assets|static|public)$/, 'assets'],
    [/^(cmd|bin)$/, 'entry'],
    [/^(docs|documentation|wiki)$/, 'documentation'],
    [/^(deploy|deployment|infra|infrastructure|k8s|kubernetes|helm|charts|terraform|tf|docker)$/, 'infrastructure'],
    [/^(\.github|\.gitlab|\.circleci)$/, 'ci-cd'],
  ];
  function fileLevelPattern(n) {
    const p = (n.filePath || '').replace(/\\/g, '/');
    const base = p.split('/').pop();
    if (/\.(test|spec)\.[^.]+$/.test(base) || /^test_.*\.py$/.test(base) ||
        /_test\.go$/.test(base) || /Test\.java$/.test(base) || /_spec\.rb$/.test(base) ||
        /Test\.php$/.test(base) || /Tests\.cs$/.test(base)) return 'test';
    if (/\.d\.ts$/.test(base)) return 'types';
    if (/\.(graphql|gql|proto)$/.test(base)) return 'types';
    if (/\.sql$/.test(base)) return 'data';
    if (/\.(md|rst)$/.test(base)) return 'documentation';
    if (base === 'Dockerfile' || /^docker-compose\..*/.test(base)) return 'infrastructure';
    if (/\.(tf|tfvars)$/.test(base)) return 'infrastructure';
    if (base === 'Jenkinsfile' || base === '.gitlab-ci.yml') return 'ci-cd';
    if (base === 'Makefile') return 'infrastructure';
    if (/^(Cargo\.toml|go\.mod|Gemfile|pom\.xml|build\.gradle|composer\.json)$/.test(base)) return 'config';
    return null;
  }
  const patternMatches = {};
  Object.keys(directoryGroups).forEach(g => {
    for (const [re, label] of dirPatterns) {
      if (re.test(g)) { patternMatches[g] = label; break; }
    }
  });

  // ---- H. Deployment topology ----
  const allPaths = fileNodes.map(n => (n.filePath || '').replace(/\\/g, '/'));
  const infraFiles = [];
  let hasDockerfile = false, hasCompose = false, hasK8s = false, hasTerraform = false, hasCI = false;
  allPaths.forEach(p => {
    const b = p.split('/').pop();
    if (b === 'Dockerfile' || /^Dockerfile\./.test(b)) { hasDockerfile = true; infraFiles.push(p); }
    if (/^docker-compose\..*/.test(b)) { hasCompose = true; infraFiles.push(p); }
    if (/\.(tf|tfvars)$/.test(b)) { hasTerraform = true; infraFiles.push(p); }
    if (/(k8s|kubernetes|helm|charts)/.test(p)) { hasK8s = true; infraFiles.push(p); }
    if (/\.github\/workflows\//.test(p) || b === '.gitlab-ci.yml' || b === 'Jenkinsfile') { hasCI = true; infraFiles.push(p); }
    if (b === 'netlify.toml' || b === 'eas.json') infraFiles.push(p);
  });
  const deploymentTopology = { hasDockerfile, hasCompose, hasK8s, hasTerraform, hasCI, infraFiles: [...new Set(infraFiles)] };

  // ---- I. Data pipeline ----
  const dataPipeline = { schemaFiles: [], migrationFiles: [], dataModelFiles: [], apiHandlerFiles: [] };
  fileNodes.forEach(n => {
    const p = (n.filePath || '').replace(/\\/g, '/');
    const b = p.split('/').pop();
    const tags = (n.tags || []).join(' ');
    if (/\.(sql|graphql|gql|proto|prisma)$/.test(b) || /rules$/.test(b)) dataPipeline.schemaFiles.push(p);
    if (/migrations?\//.test(p)) dataPipeline.migrationFiles.push(p);
    if (/model|entity/i.test(p) || /model/.test(tags)) dataPipeline.dataModelFiles.push(p);
    if ((n.tags || []).some(t => /api|handler|route|endpoint/.test(t))) dataPipeline.apiHandlerFiles.push(p);
  });

  // ---- J. Documentation coverage ----
  const docGroups = new Set();
  fileNodes.forEach(n => {
    if (n.type === 'document') docGroups.add(idToGroup.get(n.id));
  });
  const totalGroups = Object.keys(directoryGroups).length;
  const undocumentedGroups = Object.keys(directoryGroups).filter(g => !docGroups.has(g));
  const docCoverage = {
    groupsWithDocs: docGroups.size,
    totalGroups,
    coverageRatio: totalGroups ? +(docGroups.size / totalGroups).toFixed(2) : 0,
    undocumentedGroups,
  };

  // ---- K. Dependency direction ----
  const pairCount = {};
  interGroupImports.forEach(({ from, to, count }) => { pairCount[from + '|' + to] = count; });
  const seen = new Set();
  const dependencyDirection = [];
  interGroupImports.forEach(({ from, to }) => {
    const key = [from, to].sort().join('::');
    if (seen.has(key)) return;
    seen.add(key);
    const ab = pairCount[from + '|' + to] || 0;
    const ba = pairCount[to + '|' + from] || 0;
    if (ab >= ba) dependencyDirection.push({ dependent: from, dependsOn: to });
    else dependencyDirection.push({ dependent: to, dependsOn: from });
  });

  // ---- fileStats ----
  const filesPerGroup = {};
  Object.keys(directoryGroups).forEach(g => filesPerGroup[g] = directoryGroups[g].length);
  const nodeTypeCounts = {};
  Object.keys(nodeTypeGroups).forEach(t => nodeTypeCounts[t] = nodeTypeGroups[t].length);

  const result = {
    scriptCompleted: true,
    commonPrefix: prefix,
    directoryGroups,
    nodeTypeGroups,
    crossCategoryEdges,
    interGroupImports,
    intraGroupDensity,
    patternMatches,
    deploymentTopology,
    dataPipeline,
    docCoverage,
    dependencyDirection,
    fileStats: {
      totalFileNodes: fileNodes.length,
      filesPerGroup,
      nodeTypeCounts,
    },
    fileFanIn: fanIn,
    fileFanOut: fanOut,
  };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('OK: wrote', outPath);
}

try { main(); } catch (e) { console.error(e && e.stack || e); process.exit(1); }
