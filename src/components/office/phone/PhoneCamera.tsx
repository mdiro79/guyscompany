'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CharacterModel, type Motion } from '@/components/three/CharacterModel';
import { allSeats } from '../layout';
import { gestures, me, nextShot, phone, phoneCam, phoneLook, viewfinder, type Shot } from './phone';
import type { GestureId } from './gestures';

// The phone's camera in the 3D office. A second camera that sees what the phone sees:
// - rear lens: from the eyes, where one looks; 0.5× ultra-wide up to 5× zoom;
// - selfie lens: in front of one's own character, from 45° above (the classic selfie) or at eye level, at
//   arm's length or on a selfie stick, with one's own character (otherwise never drawn on this device).
// Everyone in the picture turns their head to the lens (CharacterModel's lookAt). The viewfinder on the
// phone's screen is painted from a small picture every other frame; a photo is drawn once at full size.
// Pictures drawn into a texture skip the screen's tone mapping, so it is applied here (the same neutral
// curve as the office view) before the colours are turned into sRGB.

const PREVIEW_W = 300;
const SIZES = { tall: [1080, 1440], wide: [1920, 1080] } as const;
export const hideInPhoto = new Set<THREE.Object3D>(); // e.g. the first-person arms

// Linear → sRGB, as a table (inputs are 0…1 after tone mapping).
const SRGB = new Uint8ClampedArray(4096);
for (let i = 0; i < 4096; i++) { const v = i / 4095; SRGB[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
// Khronos PBR Neutral tone mapping (what three.js's NeutralToneMapping does), then sRGB, row order flipped.
function develop(src: Uint8Array, w: number, h: number, out: ImageData, toneMap: boolean) {
  const o = out.data, start = 0.76, d = 0.24, desat = 0.15;
  for (let y = 0; y < h; y++) {
    const si = (h - 1 - y) * w * 4, di = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      let r = src[si + x] / 255, g = src[si + x + 1] / 255, b = src[si + x + 2] / 255;
      if (toneMap) {
        const lo = Math.min(r, g, b), off = lo < 0.08 ? lo - 6.25 * lo * lo : 0.04;
        r -= off; g -= off; b -= off;
        const peak = Math.max(r, g, b);
        if (peak >= start) {
          const np = 1 - (d * d) / (peak + d - start), k = np / peak;
          r *= k; g *= k; b *= k;
          const f = 1 - 1 / (desat * (peak - np) + 1);
          r += (np - r) * f; g += (np - g) * f; b += (np - b) * f;
        }
      }
      o[di + x] = SRGB[Math.max(0, Math.min(4095, (r * 4095) | 0))];
      o[di + x + 1] = SRGB[Math.max(0, Math.min(4095, (g * 4095) | 0))];
      o[di + x + 2] = SRGB[Math.max(0, Math.min(4095, (b * 4095) | 0))];
      o[di + x + 3] = 255;
    }
  }
}

const encode = (c: HTMLCanvasElement) => new Promise<Blob | null>((res) => c.toBlob((b) => {
  // Browsers that cannot write WebP hand back PNG (large): JPEG then.
  if (b && b.type === 'image/webp') res(b); else c.toBlob(res, 'image/jpeg', 0.86);
}, 'image/webp', 0.82));

/** One's own character, drawn only into the selfie camera's pictures. */
function SelfCharacter({ characterId, group }: { characterId: string; group: React.RefObject<THREE.Group | null> }) {
  const [motion, setMotion] = useState<Motion>('idle');
  const [gesture, setGesture] = useState<GestureId | null>(null);
  const seats = useMemo(() => allSeats(), []);
  const head = useRef<THREE.Object3D | null>(null);
  const headAt = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const seat = me.seatId ? seats.find((s) => s.id === me.seatId) : null;
    g.position.set(seat ? seat.pos[0] : me.x, seat ? -0.05 : 0, seat ? seat.pos[1] : me.z);
    g.rotation.y = (seat ? seat.facing : me.yaw) + Math.PI;
    const m: Motion = seat ? 'sit' : me.moving === 2 ? 'run' : me.moving ? 'walk' : 'idle';
    if (m !== motion) setMotion(m);
    const gs = gestures.mine();
    if (gs !== gesture) setGesture(gs);
  });
  const lookAt = useCallback(() => (head.current ? phoneLook(head.current.getWorldPosition(headAt)) : null), [headAt]);
  return <CharacterModel characterId={characterId} motion={motion} gesture={gesture} lookAt={lookAt} onHead={(h) => { head.current = h; }} />;
}

export function PhoneCamera({ characterId }: { characterId: string }) {
  const { gl, scene, camera } = useThree();
  const cam = useMemo(() => new THREE.PerspectiveCamera(60, 3 / 4, 0.05, 120), []);
  const self = useRef<THREE.Group>(null);
  const preview = useRef<{ rt: THREE.WebGLRenderTarget; buf: Uint8Array; img: ImageData; w: number; h: number } | null>(null);
  const frame = useRef(0);
  const look = useMemo(() => ({ head: new THREE.Vector3(), f: new THREE.Vector3() }), []);
  useEffect(() => () => { preview.current?.rt.dispose(); phoneCam.active = false; }, []);

  // Where the phone's camera is and how it is set, this frame.
  const place = (aspect: number) => {
    const s = phone.get();
    if (s.lens === 'rear') {
      cam.position.copy(camera.position); cam.quaternion.copy(camera.quaternion);
      cam.fov = s.zoom < 1 ? 98 : 62 / s.zoom;
    } else {
      const seated = !!me.seatId, seat = seated ? allSeats().find((x) => x.id === me.seatId) : null;
      const yaw = seat ? seat.facing : me.yaw, px = seat ? seat.pos[0] : me.x, pz = seat ? seat.pos[1] : me.z;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      look.head.set(px, seated ? 1.1 : 1.38, pz);
      const elev = s.angle === 'high' ? Math.PI / 4 : 0.06, d = s.stick;
      cam.position.set(px + fx * d * Math.cos(elev), look.head.y + d * Math.sin(elev), pz + fz * d * Math.cos(elev));
      cam.lookAt(look.head.x, look.head.y - 0.08, look.head.z);
      cam.fov = s.zoom < 1 ? 80 : 56;
    }
    cam.aspect = aspect; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    phoneCam.pos.copy(cam.position);
    cam.getWorldDirection(phoneCam.dir);
    phoneCam.fov = cam.fov * Math.max(1, aspect);
    phoneCam.selfie = s.lens === 'selfie';
  };
  // Draws the scene as the phone sees it into `rt` (one's own character only in selfies, no first-person arms).
  const shoot = (rt: THREE.WebGLRenderTarget) => {
    const hidden: THREE.Object3D[] = [];
    for (const o of hideInPhoto) if (o.visible) { o.visible = false; hidden.push(o); }
    if (self.current) self.current.visible = phoneCam.selfie;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(rt); gl.clear(); gl.render(scene, cam); gl.setRenderTarget(prev);
    if (self.current) self.current.visible = false;
    for (const o of hidden) o.visible = true;
  };

  useFrame(() => {
    const s = phone.get();
    const active = s.open && s.app === 'camera';
    phoneCam.active = active;
    if (!active) return;
    const [W, H] = SIZES[s.aspect];
    const aspect = W / H;
    place(aspect);
    const toneMap = true;
    // A photo waiting to be taken: drawn at full size, developed and encoded.
    const req = nextShot();
    if (req) {
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.UnsignedByteType });
      shoot(rt);
      const buf = new Uint8Array(W * H * 4);
      gl.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      rt.dispose();
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d')!, img = g.createImageData(W, H);
      develop(buf, W, H, img, toneMap);
      g.putImageData(img, 0, 0);
      void encode(c).then((blob) => req.resolve(blob ? ({ blob, width: W, height: H } satisfies Shot) : null));
    }
    // The viewfinder, every other frame.
    frame.current = (frame.current + 1) % 2;
    const canvas = viewfinder.canvas;
    if (!canvas || frame.current) return;
    const pw = PREVIEW_W, ph = Math.round(PREVIEW_W / aspect);
    let p = preview.current;
    if (!p || p.w !== pw || p.h !== ph) {
      p?.rt.dispose();
      p = preview.current = { rt: new THREE.WebGLRenderTarget(pw, ph), buf: new Uint8Array(pw * ph * 4), img: new ImageData(pw, ph), w: pw, h: ph };
    }
    shoot(p.rt);
    gl.readRenderTargetPixels(p.rt, 0, 0, pw, ph, p.buf);
    develop(p.buf, pw, ph, p.img, toneMap);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    canvas.getContext('2d')!.putImageData(p.img, 0, 0);
  });

  return (
    <group ref={self} visible={false}>
      <Suspense fallback={null}><SelfCharacter characterId={characterId} group={self} /></Suspense>
    </group>
  );
}
