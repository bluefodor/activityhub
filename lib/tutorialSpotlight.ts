/** Shared dim + rounded-rect hole for tutorial spotlight (SVG even-odd path). */

export const TUTORIAL_SPOTLIGHT_DIM = 'rgba(15, 23, 42, 0.52)';
export const TUTORIAL_SPOTLIGHT_HOLE_PAD = 10;
export const TUTORIAL_SPOTLIGHT_CORNER_RADIUS = 18;
/** Extra vertical extent for the clear hole (grows downward from padded top). */
export const TUTORIAL_SPOTLIGHT_EXTRA_HEIGHT = 4;

export type SpotlightHole = { x: number; y: number; width: number; height: number };

/**
 * Full-screen path with a rounded rectangular hole (window coords from measureInWindow).
 * Returns null if hole is unusable (caller should full-dim or skip).
 */
/** Padded spotlight rect in window coordinates (shared by SVG path + Android dim panels). */
export function tutorialSpotlightHoleBounds(
  screenW: number,
  screenH: number,
  hole: SpotlightHole,
  pad: number = TUTORIAL_SPOTLIGHT_HOLE_PAD
): { x: number; y: number; w: number; h: number } | null {
  if (hole.width <= 0 || hole.height <= 0) return null;

  const x = Math.max(0, hole.x - pad);
  const y = Math.max(0, hole.y - pad);
  const w = Math.min(screenW - x, hole.width + pad * 2);
  const h = Math.min(screenH - y, hole.height + pad * 2 + TUTORIAL_SPOTLIGHT_EXTRA_HEIGHT);
  if (w <= 0 || h <= 0) return null;

  return { x, y, w, h };
}

/**
 * Dim wedges for the four corners outside a rounded-rect hole.
 * Used on Android where full-screen SVG masks / even-odd paths are unreliable.
 */
export function tutorialSpotlightCornerDimPaths(
  x: number,
  y: number,
  w: number,
  h: number,
  rr: number
): { tl: string; tr: string; bl: string; br: string } {
  // Arc sweep flags must match tutorialSpotlightHolePath / even-odd inner ring (all sweep 1).
  return {
    tl: `M${x} ${y}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + rr}V${y}Z`,
    tr: `M${x + w} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y}Z`,
    bl: `M${x} ${y + h}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}V${y + h}Z`,
    br: `M${x + w} ${y + h}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + h - rr}V${y + h}Z`,
  };
}

/** Rounded-rect path for the clear hole only (window coords). */
export function tutorialSpotlightHolePath(
  screenW: number,
  screenH: number,
  hole: SpotlightHole,
  pad: number = TUTORIAL_SPOTLIGHT_HOLE_PAD,
  cornerR: number = TUTORIAL_SPOTLIGHT_CORNER_RADIUS
): string | null {
  const bounds = tutorialSpotlightHoleBounds(screenW, screenH, hole, pad);
  if (!bounds) return null;

  const { x, y, w, h } = bounds;
  const rr = Math.min(cornerR, w / 2, h / 2);

  return [
    `M${x + rr} ${y}`,
    `H${x + w - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V${y + h - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H${x + rr}`,
    `A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V${y + rr}`,
    `A${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    'Z',
  ].join('');
}

export function tutorialSpotlightPath(
  screenW: number,
  screenH: number,
  hole: SpotlightHole,
  pad: number = TUTORIAL_SPOTLIGHT_HOLE_PAD,
  cornerR: number = TUTORIAL_SPOTLIGHT_CORNER_RADIUS
): string | null {
  const bounds = tutorialSpotlightHoleBounds(screenW, screenH, hole, pad);
  if (!bounds) return null;

  const { x, y, w, h } = bounds;

  const rr = Math.min(cornerR, w / 2, h / 2);
  const outer = `M0 0H${screenW}V${screenH}H0Z`;
  const inner = [
    `M${x + rr} ${y}`,
    `H${x + w - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V${y + h - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H${x + rr}`,
    `A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V${y + rr}`,
    `A${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    'Z',
  ].join('');

  return `${outer} ${inner}`;
}
