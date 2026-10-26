'use client';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_HEIGHT } from '@/components/three/CharacterModel';
import { guide } from './tour';

const v = new THREE.Vector3();
const TOP_SAFE = 84; // keeps the bubble (and its name tab) below the top bar
const EDGE = 8;

// Places the receptionist's tour bubble (a DOM panel, kept readable at any distance) right above her
// head every frame, its tail on her head. It never slides down over her: when there is no room above
// her head, or she is out of view, it waits at the bottom of the screen without a tail.
export function TourBubbleAnchor() {
  const { camera, size } = useThree();
  useFrame(() => {
    const el = document.getElementById('gc-tour-bubble');
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    v.set(guide.pos[0], CHARACTER_HEIGHT + 0.12, guide.pos[1]).project(camera);
    const hx = (v.x * 0.5 + 0.5) * size.width, hy = (-v.y * 0.5 + 0.5) * size.height;
    const onScreen = v.z < 1 && hx > 0 && hx < size.width && hy > 0 && hy < size.height;
    const above = onScreen && hy - h >= TOP_SAFE;
    const x = above ? Math.min(size.width - w / 2 - EDGE, Math.max(w / 2 + EDGE, hx)) : size.width / 2;
    el.style.left = `${x}px`;
    el.style.top = `${above ? hy : size.height - 16}px`;
    // Near a screen edge the card stays on screen and its tail leans towards her head.
    el.style.setProperty('--tail', `${Math.min(w / 2 - 34, Math.max(-w / 2 + 34, hx - x))}px`);
    el.dataset.tail = above ? '1' : '0';
  });
  return null;
}
