// Icon outlines from Lucide (ISC license, https://lucide.dev), 24×24 stroke paths, for drawing on canvas textures.
export const ICON_PATHS = {
  raiseHand: ["M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2", "M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2", "M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8", "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"],
  shareIdea: ["M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5", "M9 18h6", "M10 22h4"],
  shareImage: ["M5.0 3.0h14.0a2.0 2.0 0 0 1 2.0 2.0v14.0a2.0 2.0 0 0 1 -2.0 2.0h-14.0a2.0 2.0 0 0 1 -2.0 -2.0v-14.0a2.0 2.0 0 0 1 2.0 -2.0z", "M7.0 9.0a2.0 2.0 0 1 0 4.0 0a2.0 2.0 0 1 0 -4.0 0", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"],
  shareScreen: ["M4.0 3.0h16.0a2.0 2.0 0 0 1 2.0 2.0v10.0a2.0 2.0 0 0 1 -2.0 2.0h-16.0a2.0 2.0 0 0 1 -2.0 -2.0v-10.0a2.0 2.0 0 0 1 2.0 -2.0z", "M8 21L16 21", "M12 17L12 21"],
  more: ["M11.0 12.0a1.0 1.0 0 1 0 2.0 0a1.0 1.0 0 1 0 -2.0 0", "M18.0 12.0a1.0 1.0 0 1 0 2.0 0a1.0 1.0 0 1 0 -2.0 0", "M4.0 12.0a1.0 1.0 0 1 0 2.0 0a1.0 1.0 0 1 0 -2.0 0"],
  mic: ["M12 19v3", "M19 10v2a7 7 0 0 1-14 0v-2", "M12.0 2.0h0.0a3.0 3.0 0 0 1 3.0 3.0v7.0a3.0 3.0 0 0 1 -3.0 3.0h-0.0a3.0 3.0 0 0 1 -3.0 -3.0v-7.0a3.0 3.0 0 0 1 3.0 -3.0z"],
  video: ["m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5", "M4.0 6.0h10.0a2.0 2.0 0 0 1 2.0 2.0v8.0a2.0 2.0 0 0 1 -2.0 2.0h-10.0a2.0 2.0 0 0 1 -2.0 -2.0v-8.0a2.0 2.0 0 0 1 2.0 -2.0z"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M16 3.128a4 4 0 0 1 0 7.744", "M22 21v-2a4 4 0 0 0-3-3.87", "M5.0 7.0a4.0 4.0 0 1 0 8.0 0a4.0 4.0 0 1 0 -8.0 0"],
  smile: ["M2.0 12.0a10.0 10.0 0 1 0 20.0 0a10.0 10.0 0 1 0 -20.0 0", "M8 14s1.5 2 4 2 4-2 4-2", "M9 9L9.01 9", "M15 9L15.01 9"],
  sun: ["M8.0 12.0a4.0 4.0 0 1 0 8.0 0a4.0 4.0 0 1 0 -8.0 0", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"],
  blinds: ["M3 3h18", "M20 7H8", "M20 11H8", "M10 19h10", "M8 15h12", "M4 3v14", "M2.0 19.0a2.0 2.0 0 1 0 4.0 0a2.0 2.0 0 1 0 -4.0 0"],
} as const;

export type IconName = keyof typeof ICON_PATHS;

// Strokes an icon centred at (x, y), `size` px wide, in the current stroke style.
export function drawIcon(g: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string, width = 2) {
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const d of ICON_PATHS[name]) g.stroke(new Path2D(d));
  g.restore();
}
