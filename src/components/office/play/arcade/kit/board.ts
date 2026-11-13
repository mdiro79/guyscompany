'use client';
import { useMemo, useRef } from 'react';
import type { GameApi } from './types';
import type { BoardProps } from '../rules/types';

/**
 * A board is drawn by the same stage as the solo games. This gives it the stage's `api` (always running)
 * and a getter for the newest match state, which the board's drawing code reads every frame.
 */
export function useBoard<S, M>(props: BoardProps<S, M>) {
  const ref = useRef(props);
  ref.current = props;
  return useMemo(() => {
    const get = () => ref.current;
    const api: GameApi = { seed: 1, phone: props.phone, rtl: props.rtl, score() {}, hud() {}, end() {}, running: () => true, t: (k, v) => ref.current.t(k, v) };
    return { api, get };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
