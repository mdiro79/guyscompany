'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, N8AO, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type BloomEffect, type VignetteEffect } from 'postprocessing';

// High quality (the default, phones included): soft ambient occlusion in corners and under furniture
// for depth, a faint glow only on the brightest lights and screens, and a very light vignette. Neutral
// tone mapping keeps highlights soft and colours calm (easy on the eyes); the renderer uses the same one
// without this pass, so colours stay put when it is turned off. Phones use the cheaper AO setting.
// When the quality controller turns the occlusion or the glow off, they fade out over a couple of
// seconds instead of disappearing at once (and fade back in when they return).
// Loaded on demand; the composer turns the renderer's tone mapping off, so it is applied here.
const FADE_S = 2.5;
const BLOOM = 0.22, VIGNETTE = 0.22;

interface AoPass { configuration: { intensity: number } }

export default function Effects({ phone, ao, glow, msaa }: { phone: boolean; ao: boolean; glow: boolean; msaa: boolean }) {
  const aoMax = phone ? 2.4 : 2.8;
  const aoRef = useRef<AoPass>(null);
  const bloomRef = useRef<BloomEffect>(null);
  const vignetteRef = useRef<VignetteEffect>(null);
  const mix = useRef({ ao: ao ? 1 : 0, glow: glow ? 1 : 0 });
  // The occlusion pass is switched off (no cost) only once it has faded out.
  const [aoOn, setAoOn] = useState(ao);
  useEffect(() => { if (ao) setAoOn(true); }, [ao]);
  useFrame((_, dt) => {
    const m = mix.current, k = Math.min(1, dt / FADE_S);
    const toward = (v: number, to: number) => (v < to ? Math.min(to, v + k) : Math.max(to, v - k));
    m.ao = toward(m.ao, ao ? 1 : 0);
    m.glow = toward(m.glow, glow ? 1 : 0);
    if (aoRef.current) aoRef.current.configuration.intensity = aoMax * m.ao;
    if (bloomRef.current) bloomRef.current.intensity = BLOOM * m.glow;
    if (vignetteRef.current) vignetteRef.current.darkness = VIGNETTE * m.glow;
    if (!ao && m.ao === 0 && aoOn) setAoOn(false);
  });
  return (
    <EffectComposer multisampling={msaa ? (phone ? 2 : 4) : 0} enableNormalPass={false}>
      <N8AO ref={aoRef as never} enabled={aoOn} aoRadius={0.6} distanceFalloff={0.8} intensity={aoMax * mix.current.ao} quality={phone ? 'performance' : 'medium'} halfRes color="#2e2017" />
      <Bloom ref={bloomRef} luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={BLOOM * mix.current.glow} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette ref={vignetteRef} offset={0.4} darkness={VIGNETTE * mix.current.glow} />
    </EffectComposer>
  );
}
