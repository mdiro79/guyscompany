'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Office } from '@/lib/data/types';
import { buildWalls, doorSegments, propColliders, allSeats, officeAt, inConference, doorCenter, CONF_WALL_PANEL, EYE_HEIGHT, PLAYER_RADIUS, AVATAR_RADIUS, SPAWN, type Seat, type Vec2, type DoorDef, type Circle } from './layout';
import { resolveCollisions } from './collision';
import { input, officeUi, type Interact } from './store';
import { DOORS, doorLeaves, isDoorOpen, toggleDoor, setDoor } from './doors';
import { tour, guide, me, pointAt, startTourFor, GUIDE_SPEED, PLAYER_DELAY } from './tour';
import type { RemoteAvatar } from './useOfficeNet';
import { syncedNow } from '@/lib/realtime/room';

export interface Pose { x: number; z: number; yaw: number; pitch: number; moving: number; seatId: string | null; t: number }

const WALK = 2.6, RUN = 4.6, LOOK = 0.0024, TOUCH_LOOK = 0.006;
const SIT_EYE = 1.18;
const REMOTE_FRESH_MS = 5000;

// Office access for visitors (owners always pass): a locked door or frosted glass closes the office;
// a private office opens only for members with an accepted invite; a public one is open (view only).
export function isDoorClosed(o: Office | undefined, viewerId: string, invitedSlots: number[]) {
  if (!o || !o.ownerId || o.ownerId === viewerId) return false;
  if (o.locked || o.glass === 'frosted') return true;
  return !o.isPublic && !invitedSlots.includes(o.slot);
}

// Whether this viewer may open a door with E (only office doors have access rules).
export function doorAllowed(d: DoorDef, offices: Office[], viewerId: string, invitedSlots: number[]) {
  return d.kind !== 'office' || !isDoorClosed(offices.find((o) => o.slot === d.slot), viewerId, invitedSlots);
}

export function blockingDoors(offices: Office[], viewerId: string, invitedSlots: number[] = []) {
  return doorSegments().filter((d) => isDoorClosed(offices.find((x) => x.slot === d.slot), viewerId, invitedSlots));
}

export function canSit(seat: Seat, offices: Office[], viewerId: string) {
  if (seat.area !== 'office') return true;
  return offices.find((o) => o.slot === seat.slot)?.ownerId === viewerId;
}

const interactKey = (i: Interact | null) => (i ? JSON.stringify(i) : '');

export function Player({ offices, viewerId, invitedSlots, onPose, external, remotes, isPhone }: {
  offices: Office[]; viewerId: string; invitedSlots: number[]; onPose: (p: Pose) => void;
  // Latest pose of this user commanded from another device (last command wins).
  external: React.RefObject<Pose | null>; remotes: React.RefObject<Map<string, RemoteAvatar>>; isPhone: boolean;
}) {
  const { camera, gl } = useThree();
  const walls = useMemo(() => buildWalls(), []);
  const props = useMemo(() => propColliders(), []);
  const seats = useMemo(() => allSeats(), []);
  const noAccess = useMemo(() => blockingDoors(offices, viewerId, invitedSlots), [offices, viewerId, invitedSlots]);
  const pos = useRef<Vec2>([...SPAWN.pos]);
  const yaw = useRef(SPAWN.yaw), pitch = useRef(-0.05);
  const bob = useRef(0);
  const lastLocalInput = useRef(0);
  const lastSent = useRef(0);
  const sitT = useRef(0);
  const camTarget = useRef(new THREE.Vector3(SPAWN.pos[0], EYE_HEIGHT, SPAWN.pos[1]));
  const keys = useRef(new Set<string>());
  const lastInteract = useRef('');
  const tourWas = useRef(false);
  const offRef = useRef({ offices, viewerId });
  offRef.current = { offices, viewerId };

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const el = gl.domElement;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (officeUi.get().board !== 'none') return;
      keys.current.add(e.code);
      if (e.code === 'KeyE' && !e.repeat) input.action = true;
      if (e.code === 'KeyF' && !e.repeat) {
        const ui = officeUi.get();
        if (ui.seatId && ui.panel !== 'none') officeUi.set({ panel: ui.panel === 'fullscreen' ? 'monitor' : 'fullscreen' });
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      yaw.current -= e.movementX * LOOK;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - e.movementY * LOOK));
      lastLocalInput.current = syncedNow();
    };
    const click = () => { if (!isPhone && canLook()) el.requestPointerLock?.(); };
    const lock = () => officeUi.set({ locked: document.pointerLockElement === el });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lock);
    el.addEventListener('click', click);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
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
    const t = tour.get();
    const touring = t.step !== null;

    // Everyone else as obstacles (characters do not walk through each other), plus the receptionist.
    const fresh = [...(remotes.current?.values() ?? [])].filter((r) => performance.now() - r.receivedAt < REMOTE_FRESH_MS);
    const bodies: Circle[] = fresh.filter((r) => !r.pose.seatId).map((r) => ({ pos: [r.pose.x, r.pose.z], r: AVATAR_RADIUS }));
    bodies.push({ pos: guide.pos, r: AVATAR_RADIUS });
    const circles = [...props, ...bodies];
    const solid = [...walls, ...noAccess, ...doorLeaves()];
    const taken = new Set(fresh.map((r) => r.pose.seatId).filter(Boolean));

    // Touch look (joystick overlay writes deltas).
    if (input.lookDX || input.lookDY) {
      yaw.current -= input.lookDX * TOUCH_LOOK;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - input.lookDY * TOUCH_LOOK));
      input.lookDX = input.lookDY = 0;
      lastLocalInput.current = now;
    }

    // Guided tour: the camera follows the receptionist along the step's path.
    if (touring) {
      if (!tourWas.current) {
        tourWas.current = true;
        if (ui.seatId) officeUi.set({ seatId: null, panel: 'none' });
        document.exitPointerLock?.();
        const step = t.steps[t.step!];
        if (step.openDoor) setDoor(step.openDoor, true);
      }
      input.action = false;
      const elapsed = (performance.now() - t.startedAt) / 1000;
      const p = pointAt(t.playerPath, Math.max(0, elapsed - PLAYER_DELAY) * GUIDE_SPEED);
      const before = pos.current;
      pos.current = resolveCollisions(p.pos, PLAYER_RADIUS, solid, props);
      const moving = Math.hypot(pos.current[0] - before[0], pos.current[1] - before[1]) > 0.001;
      if (moving) bob.current += dt * 9;
      const step = t.steps[t.step!];
      const look = p.done && step.look !== 'guide' ? step.look : [guide.pos[0], 1.0, guide.pos[1]];
      const dx = look[0] - pos.current[0], dz = look[2] - pos.current[1];
      const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(look[1] - EYE_HEIGHT, Math.hypot(dx, dz) || 1);
      const kk = 1 - Math.exp(-dt * 4);
      yaw.current += Math.atan2(Math.sin(wantYaw - yaw.current), Math.cos(wantYaw - yaw.current)) * kk;
      pitch.current += (wantPitch - pitch.current) * kk;
      camTarget.current.set(pos.current[0], EYE_HEIGHT + (moving ? Math.sin(bob.current) * 0.03 : 0), pos.current[1]);
      camera.position.copy(camTarget.current);
      camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
      lastLocalInput.current = now;
      finish(moving ? 1 : 0, ui.seatId, now);
      return;
    }
    tourWas.current = false;

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

    // What E would do: the closest seat, door or the receptionist in front of the player.
    let interact: Interact | null = null;
    if (!ui.seatId) {
      const fx = -Math.sin(yaw.current), fz = -Math.cos(yaw.current);
      const ahead = (p: Vec2, d: number) => d < 0.9 || ((p[0] - pos.current[0]) * fx + (p[1] - pos.current[1]) * fz) / (d || 1) > 0.35;
      const cand: { i: Interact; d: number }[] = [];
      for (const s of seats) {
        const d = Math.hypot(s.pos[0] - pos.current[0], s.pos[1] - pos.current[1]);
        if (d < 1.3 && canSit(s, offices, viewerId) && !taken.has(s.id)) cand.push({ i: { kind: 'seat', id: s.id }, d });
      }
      for (const door of DOORS) {
        const c = doorCenter(door);
        const d = Math.hypot(c[0] - pos.current[0], c[1] - pos.current[1]);
        if (d < 1.7 && ahead(c, d)) cand.push({ i: { kind: 'door', id: door.id, open: isDoorOpen(door.id), allowed: doorAllowed(door, offices, viewerId, invitedSlots) }, d: d + 0.2 });
      }
      const pd = Math.hypot(CONF_WALL_PANEL.pos[0] - pos.current[0], CONF_WALL_PANEL.pos[1] - pos.current[1]);
      if (pd < 1.5 && ahead(CONF_WALL_PANEL.pos, pd) && inConference(pos.current[0], pos.current[1])) {
        // Looking straight at the panel wins over a nearby chair.
        const facing = ((CONF_WALL_PANEL.pos[0] - pos.current[0]) * fx + (CONF_WALL_PANEL.pos[1] - pos.current[1]) * fz) / (pd || 1);
        cand.push({ i: { kind: 'panel' }, d: facing > 0.8 ? pd * 0.4 : pd + 0.1 });
      }
      const gd = Math.hypot(guide.pos[0] - pos.current[0], guide.pos[1] - pos.current[1]);
      if (guide.seated && gd < 2.4 && ahead(guide.pos, gd)) cand.push({ i: { kind: 'guide' }, d: gd });
      interact = cand.sort((a, b) => a.d - b.d)[0]?.i ?? null;
    }
    const key = interactKey(interact);
    if (key !== lastInteract.current) { lastInteract.current = key; officeUi.set({ interact }); }

    if (input.action) {
      input.action = false;
      lastLocalInput.current = now;
      if (ui.seatId) {
        const seat = seats.find((s) => s.id === ui.seatId);
        if (seat) {
          // Stand up a step behind the chair.
          const back: Vec2 = [seat.pos[0] + Math.sin(seat.facing) * 0.75, seat.pos[1] + Math.cos(seat.facing) * 0.75];
          pos.current = resolveCollisions(back, PLAYER_RADIUS, solid, circles);
        }
        officeUi.set({ seatId: null, panel: 'none' });
      } else if (interact?.kind === 'seat') {
        const seat = seats.find((s) => s.id === interact.id)!;
        if (seat.monitor) document.exitPointerLock?.();
        sitT.current = 0;
        officeUi.set({ seatId: seat.id, panel: 'none', interact: null });
        lastInteract.current = '';
      } else if (interact?.kind === 'door' && interact.allowed) {
        toggleDoor(interact.id);
      } else if (interact?.kind === 'panel') {
        document.exitPointerLock?.();
        officeUi.set({ roomPanel: true });
      } else if (interact?.kind === 'guide') {
        startTourFor(offRef.current.offices, offRef.current.viewerId);
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
        // Chairs without a monitor (conference, lounge): look around freely while seated.
        target = new THREE.Vector3(seat.pos[0], SIT_EYE, seat.pos[1]);
        if (sitT.current - dt <= 0) { yaw.current = seat.facing; pitch.current = -0.12; }
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
        pos.current = resolveCollisions([pos.current[0] + dx, pos.current[1] + dz], PLAYER_RADIUS, solid, circles);
        moving = run ? 2 : 1;
        bob.current += dt * (run ? 13 : 9);
      } else {
        // A door swinging or someone walking into us still pushes us out.
        pos.current = resolveCollisions(pos.current, PLAYER_RADIUS, solid, circles);
      }
      const eye = EYE_HEIGHT + Math.sin(bob.current) * (moving ? 0.035 : 0);
      camTarget.current.set(pos.current[0], eye, pos.current[1]);
      camera.position.copy(camTarget.current);
      camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    }
    finish(moving, ui.seatId, now);
  });

  function finish(moving: number, seatId: string | null, now: number) {
    input.moving = moving > 0;
    me.pos = [...pos.current];
    (window as unknown as { __gcPos?: unknown }).__gcPos = { x: pos.current[0], z: pos.current[1], yaw: yaw.current, seat: seatId };
    const slot = officeAt(pos.current[0], pos.current[1])?.slot ?? null;
    officeUi.set({ currentSlot: slot, inConference: inConference(pos.current[0], pos.current[1]) });
    if (now - lastSent.current > 66) {
      lastSent.current = now;
      onPose({ x: pos.current[0], z: pos.current[1], yaw: yaw.current, pitch: pitch.current, moving, seatId, t: lastLocalInput.current });
    }
  }
  return null;
}

// Mouse look is available while walking and on chairs without a monitor (not at a desk or during the tour).
export function canLook() {
  const ui = officeUi.get();
  if (tour.get().step !== null || ui.board !== 'none') return false;
  if (!ui.seatId) return true;
  return !allSeats().find((s) => s.id === ui.seatId)?.monitor;
}
