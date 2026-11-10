'use client';
import type { CSSProperties, ReactNode } from 'react';
import type { EmoteId } from './emotes';

// Emotes as stickers around the head (owner reference image): small drawings with a white sticker rim
// that pop in around the character (anger marks, steam and lightning for angry, hearts for love, Zzz
// for sleepy…) and never over the face. Sizes and places are in head heights (--head, set by the label
// layer), so they grow and shrink with the character like everything else above the head.

const W = '#ffffff';
const rim = { stroke: W, strokeWidth: 8, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const, paintOrder: 'stroke' as const };
// A line drawn as a sticker: a wide white line under the coloured one.
const Line = ({ d, color, width = 6 }: { d: string; color: string; width?: number }) => (
  <>
    <path d={d} fill="none" stroke={W} strokeWidth={width + 8} strokeLinecap="round" strokeLinejoin="round" />
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

const CLOUD = 'M17 47 C8 47 6 36 13 33 C11 24 21 19 28 24 C31 15 45 15 47 25 C55 24 59 33 54 39 C57 45 50 50 44 47 C40 52 31 52 28 48 C24 51 19 50 17 47 Z';

type Kind = 'anger' | 'puff' | 'bolt' | 'heart' | 'drop' | 'exclaim' | 'question' | 'z' | 'star' | 'sparkle' | 'note' | 'flower' | 'blush' | 'rain' | 'shades' | 'popper' | 'confetti' | 'lines' | 'dots';

const SHAPES: Record<Kind, ReactNode> = {
  anger: [0, 90, 180, 270].map((r) => (
    <g key={r} transform={`rotate(${r} 32 32)`}><Line d="M27 6 Q25 25 6 27" color="#e8372b" width={7} /></g>
  )),
  puff: (
    <>
      <path d={CLOUD} fill={W} stroke={W} strokeWidth={10} strokeLinejoin="round" />
      <path d={CLOUD} fill={W} stroke="#b3261e" strokeWidth={3} strokeLinejoin="round" />
      <Line d="M2 30 H9" color="#b3261e" width={3} />
      <Line d="M1 40 H7" color="#b3261e" width={3} />
    </>
  ),
  bolt: <path d="M38 3 L13 35 H29 L22 61 L51 25 H34 Z" fill="#ff6a1f" {...rim} />,
  heart: (
    <>
      <path d="M32 55 C12 42 5 31 9 21 C13 11 26 10 32 20 C38 10 51 11 55 21 C59 31 52 42 32 55 Z" fill="#ff4f79" {...rim} />
      <path d="M17 22 C18 18 22 16 25 17" fill="none" stroke={W} strokeWidth={4} strokeLinecap="round" opacity={0.8} />
    </>
  ),
  drop: (
    <>
      <path d="M32 5 C24 19 14 29 14 40 A18 18 0 0 0 50 40 C50 29 40 19 32 5 Z" fill="#47b5ff" {...rim} />
      <ellipse cx="25" cy="40" rx="3.5" ry="6" fill={W} opacity={0.75} />
    </>
  ),
  exclaim: (
    <>
      <path d="M24 5 H40 L36 41 H28 Z" fill="#ff5a36" {...rim} />
      <circle cx="32" cy="52" r="6.5" fill="#ff5a36" {...rim} />
    </>
  ),
  question: (
    <>
      <Line d="M19 22 C19 8 46 7 46 22 C46 32 32 31 32 42" color="#7a5cff" width={8} />
      <circle cx="32" cy="54" r="5.5" fill="#7a5cff" {...rim} />
    </>
  ),
  z: <Line d="M16 16 H44 L16 48 H44" color="#5b72ff" width={7} />,
  star: <path d="M32 4 L39 23 L60 24 L43 37 L49 58 L32 46 L15 58 L21 37 L4 24 L25 23 Z" fill="#ffcf33" {...rim} />,
  sparkle: <path d="M32 2 C34.7 21 43 29.3 62 32 C43 34.7 34.7 43 32 62 C29.3 43 21 34.7 2 32 C21 29.3 29.3 21 32 2 Z" fill="#ffd23f" {...rim} />,
  note: (
    <>
      <Line d="M40 10 V44 M40 10 C49 14 52 20 49 29" color="#1f9e8f" width={6} />
      <ellipse cx="31" cy="46" rx="10" ry="7.5" transform="rotate(-20 31 46)" fill="#1f9e8f" {...rim} />
    </>
  ),
  flower: (
    <>
      {[0, 72, 144, 216, 288].map((r) => <circle key={r} cx="32" cy="17" r="11" transform={`rotate(${r} 32 32)`} fill="#ff9ec7" {...rim} />)}
      {[0, 72, 144, 216, 288].map((r) => <circle key={`f${r}`} cx="32" cy="17" r="11" transform={`rotate(${r} 32 32)`} fill="#ff9ec7" />)}
      <circle cx="32" cy="32" r="8" fill="#ffcf33" />
    </>
  ),
  blush: (
    <>
      <ellipse cx="32" cy="38" rx="22" ry="13" fill="#ff9bb0" opacity={0.85} {...rim} />
      {['M18 44 L25 31', 'M29 46 L36 33', 'M40 44 L47 31'].map((d) => <path key={d} d={d} stroke="#e94b6f" strokeWidth={4} strokeLinecap="round" />)}
    </>
  ),
  rain: (
    <>
      <path d={CLOUD} transform="translate(0 -8)" fill="#9db4cc" {...rim} />
      {[[20, 50], [32, 55], [44, 50]].map(([x, y]) => <path key={x} d={`M${x} ${y} l-3 7`} stroke="#3d9bff" strokeWidth={4} strokeLinecap="round" />)}
    </>
  ),
  shades: (
    <>
      <Line d="M4 25 H60" color="#1f2a24" width={5} />
      <path d="M8 24 H29 V31 C29 41 10 41 8 31 Z M35 24 H56 V31 C56 41 37 41 35 31 Z" fill="#1f2a24" {...rim} />
      <path d="M13 29 L19 27 M40 29 L46 27" stroke={W} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  popper: (
    <>
      <path d="M8 58 L22 22 L44 44 Z" fill="#ffb300" {...rim} />
      <path d="M13 45 L33 37 M17 34 L28 29" stroke="#ff5a7a" strokeWidth={4} strokeLinecap="round" />
      {[['M40 8 l4 8', '#4fc3f7'], ['M52 18 l8 -3', '#ff5a7a'], ['M47 30 l9 4', '#7c4dff'], ['M30 6 l-2 8', '#66bb6a']].map(([d, c]) => (
        <path key={d} d={d} stroke={c} strokeWidth={5} strokeLinecap="round" />
      ))}
    </>
  ),
  confetti: (
    <>
      <rect x="8" y="10" width="12" height="7" rx="2" transform="rotate(25 14 13)" fill="#ff5a7a" {...rim} />
      <rect x="38" y="16" width="12" height="7" rx="2" transform="rotate(-30 44 19)" fill="#4fc3f7" {...rim} />
      <circle cx="24" cy="44" r="5.5" fill="#ffcf33" {...rim} />
      <rect x="40" y="42" width="11" height="6" rx="2" transform="rotate(60 45 45)" fill="#7c4dff" {...rim} />
    </>
  ),
  lines: <>{['M10 18 L24 26', 'M6 34 H22', 'M10 50 L24 42'].map((d) => <Line key={d} d={d} color="#1f2a24" width={5} />)}</>,
  dots: <>{[[12, 50, 5], [26, 38, 7], [44, 22, 10]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill={W} stroke="#9aa5b1" strokeWidth={3} />)}</>,
};

type Motion = 'pop' | 'bob' | 'rise' | 'shake' | 'spin';
// [shape, x, y, size] in head heights from the head's centre (−y is up), plus rotation, motion,
// delay (ms) and a mirror flag for shapes that point at the head from the left.
type Sticker = [Kind, number, number, number, number?, Motion?, number?, boolean?];

const LAYOUT: Record<EmoteId, Sticker[]> = {
  angry: [['anger', 0.82, -0.55, 0.55, 0, 'shake'], ['bolt', -0.72, -0.66, 0.28, -20, 'pop', 120, true], ['bolt', -0.98, -0.32, 0.22, -40, 'pop', 220, true],
    ['puff', -1.0, 0.12, 0.5, 0, 'bob', 300, true], ['bolt', 1.02, -0.02, 0.3, 25, 'pop', 180], ['puff', 1.02, 0.42, 0.44, 0, 'bob', 360], ['bolt', 0.84, 0.74, 0.2, 40, 'pop', 420]],
  love: [['heart', 0.82, -0.5, 0.5, 10, 'rise'], ['heart', -0.85, -0.35, 0.36, -12, 'rise', 350], ['heart', 0.98, 0.3, 0.3, 15, 'rise', 700], ['sparkle', -0.98, 0.3, 0.26, 0, 'spin', 200]],
  sleepy: [['z', 0.72, -0.45, 0.3, -8, 'rise'], ['z', 0.98, -0.78, 0.4, 6, 'rise', 450], ['z', 1.22, -1.15, 0.5, -6, 'rise', 900]],
  surprise: [['exclaim', 0.82, -0.58, 0.52, 12, 'shake'], ['exclaim', -0.82, -0.5, 0.38, -12, 'shake', 150], ['lines', -1.02, 0.08, 0.36, 0, 'pop', 250, true], ['lines', 1.02, 0.12, 0.36, 0, 'pop', 300]],
  thinking: [['question', 0.82, -0.62, 0.5, 10, 'bob'], ['dots', 0.62, -0.1, 0.3, 0, 'pop', 150, true], ['question', -0.86, -0.42, 0.32, -14, 'bob', 350]],
  sad: [['rain', 0.8, -0.72, 0.58, 0, 'bob'], ['drop', -0.82, 0.02, 0.28, 0, 'rise', 250], ['drop', 0.9, 0.22, 0.24, 0, 'rise', 600]],
  laugh: [['drop', -0.86, -0.15, 0.3, -35, 'shake', 0, true], ['drop', 0.86, -0.15, 0.3, 35, 'shake', 80], ['lines', -1.04, -0.52, 0.34, 15, 'pop', 160, true], ['lines', 1.04, -0.52, 0.34, -15, 'pop', 200], ['star', 0.78, -0.82, 0.28, 0, 'spin', 260]],
  smile: [['flower', 0.82, -0.55, 0.46, 0, 'spin'], ['sparkle', -0.82, -0.5, 0.3, 0, 'pop', 150], ['note', 0.98, 0.18, 0.36, 10, 'rise', 300], ['sparkle', -0.98, 0.22, 0.22, 0, 'pop', 400]],
  wink: [['star', 0.82, -0.55, 0.46, 0, 'spin'], ['heart', -0.84, -0.45, 0.3, -12, 'pop', 150], ['sparkle', 0.98, 0.22, 0.26, 0, 'pop', 300]],
  cool: [['shades', 0.86, -0.56, 0.56, -8, 'pop'], ['sparkle', -0.82, -0.52, 0.32, 0, 'spin', 150], ['sparkle', 0.98, 0.2, 0.22, 0, 'spin', 300], ['star', -0.96, 0.22, 0.22, 0, 'pop', 400]],
  shy: [['blush', -0.9, 0.08, 0.42, 0, 'pop', 0, true], ['blush', 0.9, 0.08, 0.42, 0, 'pop', 100], ['drop', 0.8, -0.62, 0.3, 20, 'bob', 200], ['heart', -0.8, -0.56, 0.26, -12, 'rise', 300]],
  coffee: [['puff', 0.78, -0.72, 0.42, 0, 'rise'], ['puff', 1.0, -0.36, 0.3, 0, 'rise', 400], ['heart', -0.82, -0.5, 0.3, -12, 'pop', 200], ['sparkle', -0.98, 0.16, 0.24, 0, 'spin', 350]],
  dance: [['note', 0.82, -0.6, 0.46, 10, 'bob'], ['note', -0.84, -0.48, 0.36, -14, 'bob', 200], ['star', 1.0, 0.1, 0.28, 0, 'spin', 300], ['sparkle', -1.0, 0.2, 0.26, 0, 'spin', 150]],
  party: [['popper', 0.84, -0.52, 0.56, 0, 'shake'], ['confetti', -0.84, -0.55, 0.42, 0, 'rise', 150], ['confetti', 1.04, 0.16, 0.36, 40, 'rise', 300], ['sparkle', -1.0, 0.2, 0.24, 0, 'spin', 250]],
};

export function EmoteStickers({ id }: { id: EmoteId }) {
  return (
    <div className="absolute top-[calc(var(--head,160px)*0.5)] left-0" aria-hidden>
      {LAYOUT[id].map(([kind, x, y, size, rot = 0, motion = 'pop', delay = 0, flip = false], i) => (
        <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `calc(var(--head, 160px) * ${x})`, top: `calc(var(--head, 160px) * ${y})`, width: `calc(var(--head, 160px) * ${size})`, height: `calc(var(--head, 160px) * ${size})` }}>
          <svg viewBox="0 0 64 64" className={`gc-sticker gc-sticker-${motion} size-full overflow-visible`}
            style={{ '--d': `${delay}ms`, '--r': `${rot}deg`, '--flip': flip ? -1 : 1 } as CSSProperties}>
            {SHAPES[kind]}
          </svg>
        </span>
      ))}
    </div>
  );
}
