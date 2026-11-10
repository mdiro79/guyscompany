'use client';
import { useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import { Batch, batchMaterials, type Layer } from './batch';

const ORDER: Layer[] = ['matte', 'glow', 'glass'];

/** Builds a batch once and draws its merged layers (see batch.ts). `deps` rebuild it. */
export function BatchMeshes({ build, deps = [], materials }: {
  build: (b: Batch) => void; deps?: unknown[]; materials?: Partial<Record<Layer, THREE.Material>>;
}) {
  const geometries = useMemo(() => {
    const b = new Batch();
    build(b);
    return b.build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => { Object.values(geometries).forEach((g) => g.dispose()); }, [geometries]);
  return (
    <>
      {ORDER.map((layer) => geometries[layer] && (
        <mesh key={layer} geometry={geometries[layer]} material={materials?.[layer] ?? batchMaterials[layer]} renderOrder={layer === 'glass' ? 2 : 0} />
      ))}
    </>
  );
}
