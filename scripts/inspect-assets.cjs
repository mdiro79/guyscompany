// Inspects every glTF/GLB under a directory and prints meshes, materials, bones, animations and morph targets.
// Usage: node scripts/inspect-assets.cjs <dir> [--json out.json]
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

const root = process.argv[2];
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(gltf|glb)$/i.test(e.name) ? [p] : [];
  });
}

(async () => {
  const results = [];
  for (const file of walk(root).sort()) {
    try {
      const doc = await io.read(file);
      const r = doc.getRoot();
      const meshes = r.listMeshes().map((m) => ({
        name: m.getName(),
        morphTargets: m.listPrimitives()[0]?.listTargets().length ?? 0,
        targetNames: m.getExtras()?.targetNames ?? [],
      }));
      const bones = r.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName()));
      results.push({
        file: path.relative(root, file),
        sizeKB: Math.round(fs.statSync(file).size / 1024),
        meshes,
        materials: r.listMaterials().map((m) => m.getName()),
        textures: r.listTextures().length,
        boneCount: bones.length,
        bones,
        animations: r.listAnimations().map((a) => a.getName()),
      });
    } catch (err) {
      results.push({ file: path.relative(root, file), error: String(err.message || err) });
    }
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
  for (const x of results) {
    if (x.error) { console.log(`${x.file}: ERROR ${x.error}`); continue; }
    const morph = x.meshes.reduce((n, m) => n + m.morphTargets, 0);
    console.log(`${x.file} | ${x.sizeKB}KB | meshes ${x.meshes.length} | mats ${x.materials.length} | tex ${x.textures} | bones ${x.boneCount} | morph ${morph} | anims ${x.animations.length}`);
  }
})();
