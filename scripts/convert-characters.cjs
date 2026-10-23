// Converts the characters listed in assets/characters.json to compact GLBs in public/models/characters/.
// KayKit characters have no animations of their own, so the shared Rig_Medium animation files are copied too.
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, prune, resample, quantize, meshopt, textureCompress } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');
const sharp = require('sharp');

const RAW = 'assets/raw';
const OUT = 'public/models/characters';
const KAYKIT = 'kaykit/KayKit_Adventurers_2.0_FREE';
const RAW_DIRS = { humans: 'pack1', 'monsters-a': 'pack2', 'monsters-b': 'pack3', 'monsters-c': 'pack4', kaykit: 'kaykit' };

async function convert(io, src, dst) {
  const doc = await io.read(src);
  await doc.transform(
    dedup(),
    prune(),
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(dst, doc);
  return [fs.statSync(src).size, fs.statSync(dst).size];
}

(async () => {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  fs.mkdirSync(OUT, { recursive: true });
  const characters = JSON.parse(fs.readFileSync('assets/characters.json', 'utf8'));
  const jobs = characters.map((c) => {
    const rel = c.source.split(':')[1];
    return [path.join(RAW, RAW_DIRS[c.group], rel), path.join('public', c.model)];
  });
  if (characters.some((c) => c.group === 'kaykit')) {
    fs.mkdirSync('public/models/animations', { recursive: true });
    for (const f of ['Rig_Medium_General', 'Rig_Medium_MovementBasic']) {
      jobs.push([path.join(RAW, KAYKIT, 'Animations/gltf/Rig_Medium', `${f}.glb`), `public/models/animations/${f}.glb`]);
    }
  }
  let total = 0;
  for (const [src, dst] of jobs) {
    const [before, after] = await convert(io, src, dst);
    total += after;
    console.log(`${path.basename(dst)}: ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`);
  }
  console.log(`total: ${(total / 1024 / 1024).toFixed(2)}MB`);
})();
