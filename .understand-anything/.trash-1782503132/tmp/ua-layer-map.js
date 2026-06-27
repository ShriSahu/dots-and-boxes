'use strict';
const fs = require('fs');
const inp = require('C:/Shri_Development/dots-and-boxes/.understand-anything/tmp/ua-arch-input.json');
const norm = p => (p || '').replace(/\\/g, '/');

function layerOf(n) {
  const t = n.type, p = norm(n.filePath);
  if (/^src\/components\//.test(p)) return 'ui-navigation';
  if (/^app\//.test(p)) return 'ui-navigation';
  if (/^src\/hooks\//.test(p)) return 'state-logic';
  if (/^src\/services\//.test(p)) return 'backend-services';
  if (p === 'firestore.rules') return 'backend-services';
  if (/^src\/ai\//.test(p) || /^src\/utils\//.test(p)) return 'domain-logic';
  if (/^src\/types\//.test(p) || /^src\/constants\//.test(p)) return 'shared-types';
  if (p === 'index.html' || p === 'sw.js' || p === 'manifest.json') return 'web-pwa';
  if (t === 'document') return 'documentation';
  if (t === 'config') return 'config-build';
  return 'UNASSIGNED';
}

const layers = {};
for (const n of inp.fileNodes) {
  const L = layerOf(n);
  (layers[L] = layers[L] || []).push(n.id);
}
let total = 0;
for (const L in layers) { console.log(L, layers[L].length); total += layers[L].length; }
console.log('TOTAL', total, 'expected', inp.fileNodes.length);
if (layers.UNASSIGNED) console.log('UNASSIGNED', layers.UNASSIGNED);
fs.writeFileSync('C:/Shri_Development/dots-and-boxes/.understand-anything/tmp/layer-map.json', JSON.stringify(layers, null, 2));
