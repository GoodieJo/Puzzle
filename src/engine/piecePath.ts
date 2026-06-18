import type { PieceEdges } from '../types/puzzle';

interface Vec {
  x: number;
  y: number;
}

const add = (a: Vec, b: Vec, s = 1): Vec => ({ x: a.x + b.x * s, y: a.y + b.y * s });
const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** How far (in px) a knob protrudes beyond the piece's base rectangle. */
export function getKnobDepth(cellW: number, cellH: number): number {
  return 0.32 * Math.min(cellW, cellH);
}

function addEdge(
  path: Path2D,
  p0: Vec,
  p1: Vec,
  dir: Vec,
  normal: Vec,
  type: 'flat' | 'tab' | 'blank',
  knobDepth: number
) {
  if (type === 'flat') {
    path.lineTo(p1.x, p1.y);
    return;
  }
  const sign = type === 'tab' ? 1 : -1;
  const R = 0.6 * knobDepth;
  const h = 0.4 * knobDepth;
  const m = mid(p0, p1);
  const neckA = add(m, dir, -R);
  const neckB = add(m, dir, R);
  const bulgeTip = add(m, normal, sign * (h + R));
  const c1a = add(neckA, normal, sign * (h + R) * 0.55);
  const c2a = add(bulgeTip, dir, -R * 0.55);
  const c1b = add(bulgeTip, dir, R * 0.55);
  const c2b = add(neckB, normal, sign * (h + R) * 0.55);

  path.lineTo(neckA.x, neckA.y);
  path.bezierCurveTo(c1a.x, c1a.y, c2a.x, c2a.y, bulgeTip.x, bulgeTip.y);
  path.bezierCurveTo(c1b.x, c1b.y, c2b.x, c2b.y, neckB.x, neckB.y);
  path.lineTo(p1.x, p1.y);
}

/**
 * Builds a Path2D for a piece in piece-local coordinates, where (0,0) is the
 * top-left of the piece's base cell and (w,h) is the bottom-right. Knobs
 * protrude outside this rectangle by up to `getKnobDepth(w,h)` px, so callers
 * must reserve that much margin when sizing offscreen buffers.
 */
export function buildPiecePath(edges: PieceEdges, w: number, h: number): Path2D {
  const knobDepth = getKnobDepth(w, h);
  const path = new Path2D();

  const topLeft = { x: 0, y: 0 };
  const topRight = { x: w, y: 0 };
  const bottomRight = { x: w, y: h };
  const bottomLeft = { x: 0, y: h };

  path.moveTo(topLeft.x, topLeft.y);
  addEdge(path, topLeft, topRight, { x: 1, y: 0 }, { x: 0, y: -1 }, edges.top, knobDepth);
  addEdge(path, topRight, bottomRight, { x: 0, y: 1 }, { x: 1, y: 0 }, edges.right, knobDepth);
  addEdge(path, bottomRight, bottomLeft, { x: -1, y: 0 }, { x: 0, y: 1 }, edges.bottom, knobDepth);
  addEdge(path, bottomLeft, topLeft, { x: 0, y: -1 }, { x: -1, y: 0 }, edges.left, knobDepth);
  path.closePath();

  return path;
}
