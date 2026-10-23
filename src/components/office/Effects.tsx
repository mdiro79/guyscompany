'use client';
import { EffectComposer, N8AO, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

// High quality only (computers by default): soft ambient occlusion in corners and under furniture,
// a gentle glow on the lights and screens, and a light vignette. Loaded on demand, so phones in
// low quality never download it. The composer turns the renderer's tone mapping off, so it is applied here.
export default function Effects() {
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <N8AO aoRadius={0.55} distanceFalloff={0.9} intensity={2.2} quality="medium" halfRes color="#3a2618" />
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.25} intensity={0.35} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.35} darkness={0.35} />
    </EffectComposer>
  );
}
