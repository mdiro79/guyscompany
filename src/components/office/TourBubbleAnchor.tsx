'use client';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_HEIGHT } from '@/components/three/CharacterModel';
import { guide } from './tour';

const v = new THREE.Vector3();
const TOP_SAFE = 84; // keeps the bubble (and its corner badge) below the top bar

// Places the receptionist's speech bubble (a DOM element) above her head every frame.
// Off screen or behind the camera it falls back to the bottom centre; the tail keeps pointing at her.
export function TourBubbleAnchor() {
  const { camera, size } = useThree();
  useFrame(() => {
    const el = document.getElementById('gc-tour-bubble');
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    v.set(guide.pos[0], CHARACTER_HEIGHT + 0.25, guide.pos[1]).project(camera);
    const visible = v.z < 1 && Math.abs(v.x) < 1.35 && v.y > -1.1;
    const hx = (v.x * 0.5 + 0.5) * size.width, hy = (-v.y * 0.5 + 0.5) * size.height;
    const x = visible ? Math.min(size.width - w / 2 - 8, Math.max(w / 2 + 8, hx)) : size.width / 2;
    const y = visible ? Math.min(size.height - 8, Math.max(TOP_SAFE + h, hy - 10)) : size.height - 16;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // The tail leaves the card 36 px to the right of the head (see SpeechBubble), so it stays under the card.
    el.style.setProperty('--tail', `${Math.min(w / 2 - 52, Math.max(-w / 2 + 18, hx - x))}px`);
    el.dataset.tail = visible && hy - 10 >= TOP_SAFE + h * 0.6 ? '1' : '0';
  });
  return null;
}
