'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShell } from '@/components/shell/ShellContext';
import { getMesh, type PeerInfo } from '@/lib/realtime/mesh';
import { useDevice, isEmbedded } from '@/lib/device';
import { VoiceCtx, type MicDevice, type VoiceState } from './VoiceContext';

interface RemoteAudio { el: HTMLAudioElement; source: MediaStreamAudioSourceNode; gain: GainNode; analyser: AnalyserNode; userId: string }

const levelOf = (analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / buf.length) * 6);
};

// Voice-only WebRTC mesh. One active microphone per person across phone and computer;
// remote voices play on the device that holds the microphone (or this tab if none does).
export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user } = useShell();
  const thisDevice: MicDevice = useDevice();
  const mesh = useMemo(() => (isEmbedded() ? null : getMesh(user.id, thisDevice)), [user.id, thisDevice]);
  const [micOn, setMicOn] = useState(false);
  const [allMuted, setAllMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [otherDeviceMic, setOtherDeviceMic] = useState<MicDevice | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const localAnalyser = useRef<AnalyserNode | null>(null);
  const remotes = useRef(new Map<string, RemoteAudio>());
  const levels = useRef<Record<string, number>>({});
  const volumes = useRef<Record<string, number>>({});
  const focus = user.status === 'focus';

  const audio = () => {
    ctx.current ??= new AudioContext();
    if (ctx.current.state === 'suspended') void ctx.current.resume();
    return ctx.current;
  };

  // Browsers keep the audio engine suspended until the page is touched; without this remote voices stay silent.
  useEffect(() => {
    const wake = () => { if (ctx.current && ctx.current.state === 'suspended') void ctx.current.resume(); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => { window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); };
  }, []);

  const stopMic = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    localAnalyser.current = null;
    mesh?.setLocalTrack(null);
    setMicOn(false);
  }, [mesh]);

  const startMic = useCallback(async () => {
    if (!mesh) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      const a = audio();
      const an = a.createAnalyser(); an.fftSize = 512;
      a.createMediaStreamSource(s).connect(an);
      localAnalyser.current = an;
      mesh.setLocalTrack(s.getAudioTracks()[0]);
      mesh.sendEvent({ type: 'mic-claim', userId: user.id, device: thisDevice });
      setError(null);
      setMicOn(true);
    } catch {
      setError('permission');
    }
  }, [mesh, user.id, thisDevice]);

  // Presence + mic ownership across the user's own devices.
  useEffect(() => {
    if (!mesh) return;
    mesh.room.track({ userId: user.id, device: thisDevice, micActive: micOn });
    const offPeers = mesh.onPeers(setPeers);
    const offPresence = mesh.room.onPresence((list) => {
      const other = list.find((m) => m.userId === user.id && m.tabId !== mesh.self.tabId && m.micActive);
      setOtherDeviceMic(other ? other.device : null);
    });
    const offEvent = mesh.onEvent((from, msg) => {
      if (msg.type === 'mic-claim' && msg.userId === user.id && from.tabId !== mesh.self.tabId) stopMic();
    });
    return () => { offPeers(); offPresence(); offEvent(); };
  }, [mesh, user.id, thisDevice, micOn, stopMic]);

  // Focus mode: microphone off.
  useEffect(() => { if (focus && micOn) stopMic(); }, [focus, micOn, stopMic]);

  // Remote audio graph.
  useEffect(() => {
    if (!mesh) return;
    return mesh.onTrack((peer, s) => {
      const old = remotes.current.get(peer.tabId);
      if (old) { old.source.disconnect(); old.gain.disconnect(); old.el.srcObject = null; remotes.current.delete(peer.tabId); }
      if (!s || peer.userId === user.id) return;
      const a = audio();
      const el = new Audio(); el.srcObject = s; el.muted = true; void el.play().catch(() => {});
      const source = a.createMediaStreamSource(s);
      const gain = a.createGain();
      const analyser = a.createAnalyser(); analyser.fftSize = 512;
      source.connect(analyser); source.connect(gain); gain.connect(a.destination);
      remotes.current.set(peer.tabId, { el, source, gain, analyser, userId: peer.userId });
    });
  }, [mesh, user.id]);

  // Levels and gains at ~20 Hz.
  useEffect(() => {
    const buf = new Uint8Array(512);
    const id = setInterval(() => {
      const next: Record<string, number> = {};
      if (localAnalyser.current && micOn) next[user.id] = levelOf(localAnalyser.current, buf);
      const playHere = !otherDeviceMic || micOn;
      for (const r of remotes.current.values()) {
        next[r.userId] = Math.max(next[r.userId] ?? 0, levelOf(r.analyser, buf));
        const target = allMuted || focus || !playHere ? 0 : volumes.current[r.userId] ?? 1;
        r.gain.gain.setTargetAtTime(target, r.gain.context.currentTime, 0.08);
      }
      levels.current = next;
    }, 50);
    return () => clearInterval(id);
  }, [micOn, allMuted, focus, otherDeviceMic, user.id]);

  useEffect(() => () => stopMic(), [stopMic]);

  const activeDevice: MicDevice | null = micOn ? thisDevice : otherDeviceMic;
  const value = useMemo<VoiceState>(() => ({
    activeDevice, thisDevice, micOn, allMuted, error,
    peerCount: new Set(peers.filter((p) => p.userId !== user.id).map((p) => p.userId)).size,
    getLevel: (id) => levels.current[id] ?? 0,
    setVolume: (id, v) => { volumes.current[id] = v; },
    toggleMic: () => { if (micOn) stopMic(); else if (!focus) void startMic(); },
    useMicHere: () => { if (!focus) void startMic(); },
    toggleMuteAll: () => { audio(); setAllMuted((x) => !x); },
  }), [activeDevice, thisDevice, micOn, allMuted, error, peers, user.id, stopMic, startMic, focus]);

  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
