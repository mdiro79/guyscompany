'use client';

// Presentations onto the drawing board (owner request: show PowerPoint on the board). Every slide becomes
// a picture on its own page, so it is shown on the conference screen and the smart screen like any board
// page, can be drawn on, and is turned with the page buttons or the arrow keys.
//
// - PDF (PowerPoint: File › Save as › PDF): drawn exactly by pdf.js, the most faithful way.
// - PowerPoint (.pptx): laid out in the browser (pptx-preview) and photographed (html-to-image). Text,
//   pictures, shapes and tables come through; uncommon effects may look simpler than in PowerPoint.
// Everything happens on the member's device; nothing is sent to an outside service.

export type SlideKind = 'pdf' | 'pptx';
export const SLIDE_ACCEPT = '.pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation';
const OUT_W = 1920, OUT_H = 1080; // slides are drawn this sharp (the screens show them at up to 2048 px)

/** What kind of presentation a file is; 'old' for formats we cannot open (.ppt, .key, .odp). */
export function slideKind(file: { name: string; type: string }): SlideKind | 'old' | null {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.pptx') || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (/\.(ppt|pps|ppsx|key|odp)$/.test(name)) return 'old';
  return null;
}

export interface Slide { file: File; w: number; h: number }

const toFile = async (c: HTMLCanvasElement, name: string) => {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.9));
  const b = blob ?? (await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png')));
  if (!b) throw new Error('encode');
  return new File([b], `${name}.${b.type === 'image/webp' ? 'webp' : 'png'}`, { type: b.type });
};

/**
 * Renders a presentation slide by slide (at most `max`), handing each to `each` before the next is drawn.
 * `total` is told the number of slides that will come.
 */
export async function renderSlides(file: File, max: number, total: (n: number) => void, each: (s: Slide, i: number) => Promise<void>) {
  const kind = slideKind(file);
  const base = file.name.replace(/\.[^.]+$/, '') || 'slide';
  if (kind === 'pdf') return renderPdf(file, base, max, total, each);
  if (kind === 'pptx') return renderPptx(file, base, max, total, each);
  throw new Error('unsupported');
}

async function renderPdf(file: File, base: string, max: number, total: (n: number) => void, each: (s: Slide, i: number) => Promise<void>) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const n = Math.min(max, doc.numPages);
    total(n);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const scale = Math.min(OUT_W / v1.width, OUT_H / v1.height);
      const v = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(v.width); c.height = Math.round(v.height);
      const g = c.getContext('2d')!;
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvas: c, canvasContext: g, viewport: v }).promise;
      page.cleanup();
      await each({ file: await toFile(c, `${base}-${i}`), w: c.width, h: c.height }, i - 1);
    }
  } finally { void task.destroy(); }
}

async function renderPptx(file: File, base: string, max: number, total: (n: number) => void, each: (s: Slide, i: number) => Promise<void>) {
  const [{ init }, { toCanvas }] = await Promise.all([import('pptx-preview'), import('html-to-image')]);
  // Laid out off screen at the board's shape; the slides keep their own proportions inside it.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', left: '-30000px', top: '0', width: `${OUT_W}px`, pointerEvents: 'none' });
  document.body.appendChild(host);
  const viewer = init(host, { width: OUT_W, height: OUT_H, mode: 'list' });
  try {
    await viewer.preview(await file.arrayBuffer());
    // Pictures inside the slides finish loading first.
    await Promise.all([...host.querySelectorAll('img')].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
    await document.fonts?.ready;
    const slides = [...host.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper')].slice(0, max);
    total(slides.length);
    for (let i = 0; i < slides.length; i++) {
      const el = slides[i];
      el.style.margin = '0';
      const c = await toCanvas(el, { pixelRatio: 1, backgroundColor: '#ffffff', cacheBust: false });
      await each({ file: await toFile(c, `${base}-${i + 1}`), w: c.width, h: c.height }, i);
    }
  } finally {
    viewer.destroy();
    host.remove();
  }
}
