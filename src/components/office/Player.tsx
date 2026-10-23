'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Office } from '@/lib/data/types';
import { buildWalls, doorSegments, propColliders, allSeats, officeAt, inConference, EYE_HEIGHT, PLAYER_RADIUS, SPAWN, type Seat, type Vec2 } from './layout';
import { resolveCollisions } from './collision';
import { input, officeUi } from './store';
import { syncedNow } from '@/lib/realtime/room';

export interface Pose { x: number; z: number; yaw: number; pitch: number; moving: number; seatId: string | null; t: number }

const WALK = 2.6, RUN = 4.6, LOOK = 0.0024, TOUCH_LOOK = 0.006;
const SIT_EYE = 1.18;

// Door rules for visitors (owners always pass): a locked door or frosted glass closes the office;
// a private office opens only for members with an accepted invite; a public one is open (view only).
export function isDoorClosed(o: Office | undefined, viewerId: string, invitedSlots: number[]) {
  if (!o || !o.ownerId || o.ownerId === viewerId) return false;
  if (o.locked || o.glass === 'frosted') return true;
  return !o.isPublic && !invitedSlots.includes(o.slot);
}

export function blockingDoors(offices: Office[], viewerId: string, invitedSlots: number[] = []) {
  return doorSegments().filter((d) => isDoorClosed(offices.find((x) => x.slot === d.slot), viewerId, invitedSlots));
}

export function canSit(seat: Seat, offices: Office[], viewerId: string) {
  if (seat.area !== 'office') return true;
  return offices.find((o) => o.slot === seat.slot)?.ownerId === viewerId;
}

export function Player({ offices, viewerId, invitedSlots, onPose, external, isPhone }: {
  offices: Office[]; viewerId: string; invitedSlots: number[]; onPose: (p: Pose) => void;
  // Latest pose of this user commanded from another device (last command wins).
  external: React.RefObject<Pose | null>; isPhone: boolean;
}) {
  const { camera, gl } = useThree();
  const walls = useMemo(() => buildWalls(), []);
  const circles = useMemo(() => propColliders(), []);
  const seats = useMemo(() => allSeats(), []);
  const doors = useMemo(() => blockingDoors(offices, viewerId, invitedSlots), [offices, viewerId, invitedSlots]);
  const pos = useRef<Vec2>([...SPAWN.pos]);
  const yaw = useRef(SPAWN.yaw), pitch = useRef(-0.05);
  const bob = useRef(0);
  const lastLocalInput = useRef(0);
  const lastSent = useRef(0);
  const sitT = useRef(0);
  const camTarget = useRef(new THREE.Vector3());
  const keys = useRef(new Set<string>());

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const el = gl.domElement;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      keys.current.add(e.code);
      if (e.code === 'KeyE' && !e.repeat) input.action = true;
      if (e.code === 'KeyF' && !e.repeat) {
        const ui = officeUi.get();
        if (ui.seatId) officeUi.set({ panel: ui.panel === 'fullscreen' ? 'monitor' : 'fullscreen' });
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      yaw.current -= e.movementX * LOOK;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - e.movementY * LOOK));
      lastLocalInput.current = syncedNow();
    };
    const click = () => { if (!isPhone && !officeUi.get().seatId) el.requestPointerLock?.(); };
    const lock = () => officeUi.set({ locked: document.pointerLockElement === el });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => keys.current.clear());
    document.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lock);
    el.addEventListener('click', click);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lock);
      el.removeEventListener('click', click);
    };
  }, [camera, gl, isPhone]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const ui = officeUi.get();
    const k = keys.current;
    const now = syncedNow();

    // Touch look (joystick overlay writes deltas).
    if (input.lookDX || input.lookDY) {
      yaw.current -= input.lookDX * TOUCH_LOOK;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - input.lookDY * TOUCH_LOOK));
      input.lookDX = input.lookDY = 0;
      lastLocalInput.current = now;
    }
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + input.forward;
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.right;
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || input.run;
    if (fwd || strafe) lastLocalInput.current = now;

    // Another device of the same user moved more recently: follow it.
    const ext = external.current;
    if (ext && ext.t > lastLocalInput.current + 50) {
      pos.current = [ext.x, ext.z];
      yaw.current = ext.yaw;
      if (ext.seatId !== ui.seatId) officeUi.set({ seatId: ext.seatId, panel: ext.seatId ? officeUi.get().panel : 'none' });
      external.current = null;
    }

    // Sit / stand.
    const nearest = seats
      .map((s) => ({ s, d: Math.hypot(s.pos[0] - pos.current[0], s.pos[1] - pos.current[1]) }))
      .filter(({ s, d }) => d < 1.3 && canSit(s, offices, viewerId))
      .sort((a, b) => a.d - b.d)[0]?.s ?? null;
    if (!ui.seatId) officeUi.set({ nearSeatId: nearest?.id ?? null });
    if (input.action) {
      input.action = false;
      lastLocalInput.current = now;
      if (ui.seatId) {
        const seat = seats.find((s) => s.id === ui.seatId);
        if (seat) {
          // Stand up a step behind the chair.
          const back: Vec2 = [seat.pos[0] + Math.sin(seat.facing) * 0.7, seat.pos[1] + Math.cos(seat.facing) * 0.7];
          pos.current = resolveCollisions(back, PLAYER_RADIUS, [...walls, ...doors], circles);
        }
        officeUi.set({ seatId: null, panel: 'none' });
      } else if (nearest) {
        document.exitPointerLock?.();
        sitT.current = 0;
        officeUi.set({ seatId: nearest.id, panel: 'none', nearSeatId: null });
      }
    }

    const seat = ui.seatId ? seats.find((s) => s.id === ui.seatId) ?? null : null;
    let moving = 0;
    if (seat) {
      sitT.current += dt;
      pos.current = [...seat.pos];
      let target: THREE.Vector3;
      let lookAt: THREE.Vector3 | null = null;
      if (seat.monitor && sitT.current > 0.5) {
        const [mx, my, mz] = seat.monitor.pos;
        const dir = Math.sign(seat.pos[1] - mz) || 1;
        target = new THREE.Vector3(mx, my + 0.02, mz + dir * 0.62);
        lookAt = new THREE.Vector3(mx, my, mz);
        if (sitT.current > 1.1 && ui.panel === 'none') officeUi.set({ panel: isPhone ? 'fullscreen' : 'monitor' });
      } else {
        target = new THREE.Vector3(seat.pos[0], SIT_EYE, seat.pos[1]);
        if (sitT.current < 0.05) { yaw.current = seat.facing; pitch.current = -0.12; }
      }
      camTarget.current.lerp(target, 1 - Math.exp(-dt * 6));
      camera.position.copy(camTarget.current);
      if (lookAt) {
        const m = new THREE.Matrix4().lookAt(camera.position, lookAt, camera.up);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        camera.quaternion.slerp(q, 1 - Math.exp(-dt * 6));
        const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        yaw.current = e.y; pitch.current = e.x;
      } else {
        camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
      }
    } else {
      const len = Math.hypot(fwd, strafe);
      if (len > 0.01) {
        const speed = (run ? RUN : WALK) * Math.min(1, len);
        const f = fwd / Math.max(1, len), r = strafe / Math.max(1, len);
        const sin = Math.sin(yaw.current), cos = Math.cos(yaw.current);
        const dx = (-sin * f + cos * r) * speed * dt;
        const dz = (-cos * f - sin * r) * speed * dt;
        pos.current = resolveCollisions([pos.current[0] + dx, pos.current[1] + dz], PLAYER_RADIUS, [...walls, ...doors], circles);
        moving = run ? 2 : 1;
        bob.current += dt * (run ? 13 : 9);
      }
      const eye = EYE_HEIGHT + Math.sin(bob.current) * (moving ? 0.035 : 0);
      camTarget.current.set(pos.current[0], eye, pos.current[1]);
      camera.position.copy(camTarget.current);
      camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    }

    input.moving = moving > 0;
    (window as unknown as { __gcPos?: unknown }).__gcPos = { x: pos.current[0], z: pos.current[1], yaw: yaw.current, seat: ui.seatId };
    const slot = officeAt(pos.current[0], pos.current[1])?.slot ?? null;
    officeUi.set({ currentSlot: slot, inConference: inConference(pos.current[0], pos.current[1]) });

    if (now - lastSent.current > 66) {
      lastSent.current = now;
      onPose({ x: pos.current[0], z: pos.current[1], yaw: yaw.current, pitch: pitch.current, moving, seatId: ui.seatId, t: lastLocalInput.current });
    }
  });
  return null;
}
