// Picks 4 characters per source group, evenly spaced over the name-sorted list, and writes assets/characters.json.
// Names already picked from an earlier group are skipped (packs overlap), moving to the next unused entry.
// A group's `include` names (owner request) replace the evenly spaced pick closest to them in the sorted list.
const fs = require('fs');
const path = require('path');

const PER_GROUP = 4;
const RAW = 'assets/raw';
const groups = [
  { id: 'humans', source: 'glTF-20261023T123741Z-1-001.zip', dir: 'pack1/glTF', ext: '.gltf' },
  { id: 'monsters-a', source: 'glTF-20261023T123847Z-1-001.zip', dir: 'pack2/glTF', ext: '.gltf' },
  { id: 'monsters-b', source: 'glTF-20261023T123901Z-1-001.zip', dir: 'pack3/glTF', ext: '.gltf', include: ['Cat'] },
  // Demon in this pack ships with a single animation (Flying_Idle) on a different rig, so it is excluded.
  { id: 'monsters-c', source: 'glTF-20261023T123909Z-1-001.zip', dir: 'pack4/glTF', ext: '.gltf', exclude: ['Demon'] },
  { id: 'kaykit', source: 'KayKit_Adventurers_2.0_FREE.zip', dir: 'kaykit/KayKit_Adventurers_2.0_FREE/Characters/gltf', ext: '.glb' },
];

const used = new Set();
const characters = [];
for (const g of groups) {
  const names = fs.readdirSync(path.join(RAW, g.dir))
    .filter((f) => f.endsWith(g.ext))
    .map((f) => path.basename(f, g.ext))
    .filter((n) => !(g.exclude || []).includes(n))
    .sort((a, b) => a.localeCompare(b, 'en'));
  const picked = [];
  for (let i = 0; i < PER_GROUP; i++) {
    let idx = Math.floor(((i + 0.5) * names.length) / PER_GROUP);
    while (used.has(names[idx % names.length])) idx++;
    picked.push(idx % names.length);
    used.add(names[idx % names.length]);
  }
  for (const name of g.include || []) {
    const want = names.indexOf(name);
    if (want < 0 || picked.includes(want)) continue;
    const closest = picked.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    used.delete(names[closest]);
    used.add(name);
    picked[picked.indexOf(closest)] = want;
  }
  for (const name of picked.sort((a, b) => a - b).map((i) => names[i])) {
    characters.push({
      id: `${g.id}-${name.toLowerCase().replace(/_/g, '-')}`,
      name,
      group: g.id,
      source: `${g.source}:${g.dir.split('/').slice(1).join('/')}/${name}${g.ext}`,
      model: `/models/characters/${name}.glb`,
    });
  }
  console.log(`${g.id}: ${names.length} candidates -> ${characters.slice(-PER_GROUP).map((c) => c.name).join(', ')}`);
}
fs.writeFileSync('assets/characters.json', JSON.stringify(characters, null, 2) + '\n');
