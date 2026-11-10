'use client';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Static scenery is merged into a few big meshes: every piece is baked (position, rotation, colour as a
// vertex colour) into one geometry per layer, so a whole room costs a handful of draw calls instead of
// one per box. That is what keeps the office light on phones and in the browser.
//   matte – lit surfaces (one shared material, the colour comes from the vertices)
//   glow  – unlit, brighter than white allowed (lamps, neon, screens' frames); blooms in high quality
//   glass – clear tinted glass
export type Layer = 'matte' | 'glow' | 'glass';
type V3 = [number, number, number];

const tmpColor = new THREE.Color();
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const cylinders = new Map<string, THREE.BufferGeometry>();
const spheres = new Map<number, THREE.BufferGeometry>();

export class Batch {
  private parts = new Map<Layer, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** uv: keep texture coordinates (for batches drawn with a texture map). */
  constructor(private uv = false) {}

  /** Everything added until pop() is placed relative to this point, turned by rotY. */
  push(pos: V3, rotY = 0, scale = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(scale, scale, scale));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }

  /** Adds any geometry with its own matrix (already in the space of the current push). `gain` > 1 makes glow parts bloom. */
  addMatrix(layer: Layer, geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix: THREE.Matrix4, gain = 1) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(this.uv && name === 'uv')) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (this.uv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(this.stack[this.stack.length - 1].clone().multiply(matrix));
    tmpColor.set(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = tmpColor.r * gain; colors[i * 3 + 1] = tmpColor.g * gain; colors[i * 3 + 2] = tmpColor.b * gain; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Morph targets and groups do not survive merging.
    g.morphAttributes = {};
    g.clearGroups();
    if (!this.parts.has(layer)) this.parts.set(layer, []);
    this.parts.get(layer)!.push(g);
    return this;
  }

  add(layer: Layer, geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], gain = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
    return this.addMatrix(layer, geometry, color, m, gain);
  }

  box(size: V3, pos: V3, color: THREE.ColorRepresentation, rotY = 0, layer: Layer = 'matte', gain = 1) {
    return this.add(layer, UNIT_BOX, color, pos, [0, rotY, 0], size, gain);
  }
  /** A box given by its rotation on all axes (tilted screens, backrests). */
  slab(size: V3, pos: V3, rot: V3, color: THREE.ColorRepresentation, layer: Layer = 'matte', gain = 1) {
    return this.add(layer, UNIT_BOX, color, pos, rot, size, gain);
  }
  cyl(rTop: number, rBottom: number, h: number, pos: V3, color: THREE.ColorRepresentation, segments = 14, layer: Layer = 'matte', gain = 1, rot: V3 = [0, 0, 0]) {
    const key = `${rBottom ? rTop / rBottom : 'cone'}:${segments}`;
    let g = cylinders.get(key);
    // Unit cylinder with the right taper; scaled to size below.
    if (!g) { g = new THREE.CylinderGeometry(rBottom ? rTop / rBottom : 1, rBottom ? 1 : 0, 1, segments); cylinders.set(key, g); }
    const r = rBottom || rTop;
    return this.add(layer, g, color, pos, rot, [r, h, r], gain);
  }
  sphere(r: number, pos: V3, color: THREE.ColorRepresentation, segments = 12, layer: Layer = 'matte', gain = 1, scale: V3 = [1, 1, 1]) {
    let g = spheres.get(segments);
    if (!g) { g = new THREE.SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.7))); spheres.set(segments, g); }
    return this.add(layer, g, color, pos, [0, 0, 0], [r * scale[0], r * scale[1], r * scale[2]], gain);
  }

  /** One merged geometry per layer that got parts. */
  build(): Partial<Record<Layer, THREE.BufferGeometry>> {
    const out: Partial<Record<Layer, THREE.BufferGeometry>> = {};
    for (const [layer, list] of this.parts) {
      const merged = list.length ? mergeGeometries(list, false) : null;
      if (merged) { merged.computeBoundingSphere(); out[layer] = merged; }
      list.forEach((g) => g.dispose());
    }
    this.parts.clear();
    return out;
  }
}

// Shared materials of the batches (one program each for the whole office).
export const batchMaterials = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: new THREE.MeshStandardMaterial({ color: '#c9e6e3', transparent: true, opacity: 0.3, roughness: 0.04, metalness: 0.15, envMapIntensity: 2, depthWrite: false }),
};
