'use client';
import { EffectComposer, N8AO, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

// High quality (the default, phones included): soft ambient occlusion in corners and under furniture
// for depth, a faint glow only on the brightest lights and screens, and a very light vignette. AgX tone
// mapping keeps highlights soft and colours calm (easy on the eyes). Phones use the cheaper AO setting.
// Loaded on demand; the composer turns the renderer's tone mapping off, so it is applied here.
export default function Effects({ phone }: { phone: boolean }) {
  return (
    <EffectComposer multisampling={phone ? 2 : 4} enableNormalPass={false}>
      <N8AO aoRadius={0.6} distanceFalloff={0.8} intensity={phone ? 2.4 : 2.8} quality={phone ? 'performance' : 'medium'} halfRes color="#2e2017" />
      <Bloom luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.22} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.4} darkness={0.22} />
    </EffectComposer>
  );
}
