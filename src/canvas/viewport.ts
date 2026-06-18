import type { Viewport } from '../types/puzzle';

export function worldToScreen(v: Viewport, x: number, y: number) {
  return { x: x * v.scale + v.offsetX, y: y * v.scale + v.offsetY };
}

export function screenToWorld(v: Viewport, x: number, y: number) {
  return { x: (x - v.offsetX) / v.scale, y: (y - v.offsetY) / v.scale };
}

/** Returns a new viewport with `scale` applied while keeping the world point under (px,py) fixed. */
export function zoomViewportAt(v: Viewport, px: number, py: number, newScale: number): Viewport {
  const worldX = (px - v.offsetX) / v.scale;
  const worldY = (py - v.offsetY) / v.scale;
  return {
    scale: newScale,
    offsetX: px - worldX * newScale,
    offsetY: py - worldY * newScale,
  };
}

export function fitViewport(
  bounds: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  padding = 0.92
): Viewport {
  const scale = Math.min(canvasWidth / bounds.width, canvasHeight / bounds.height) * padding;
  const offsetX = (canvasWidth - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = (canvasHeight - bounds.height * scale) / 2 - bounds.y * scale;
  return { scale, offsetX, offsetY };
}
