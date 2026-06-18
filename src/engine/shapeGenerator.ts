import type { EdgeShape, PieceEdges } from '../types/puzzle';
import { mulberry32 } from './rng';

/**
 * Builds the edge-shape grid for a rows x cols puzzle.
 *
 * Internal (shared) edges are decided once and mirrored between the two
 * pieces that share them: if piece A's right edge is a "tab" (protrudes),
 * piece B (to its right) must have a "blank" (recessed) left edge, and vice
 * versa. Border edges touching the outside of the board are always flat.
 */
export function generateEdgeGrid(
  rows: number,
  cols: number,
  seed: number,
  style: 'classic' | 'square'
): PieceEdges[][] {
  const rand = mulberry32(seed);
  const grid: PieceEdges[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      top: 'flat',
      right: 'flat',
      bottom: 'flat',
      left: 'flat',
    }))
  );

  if (style === 'square') {
    return grid;
  }

  // Decide vertical internal edges (between col c and c+1) for every row.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const shape: EdgeShape = rand() > 0.5 ? 'tab' : 'blank';
      grid[r][c].right = shape;
      grid[r][c + 1].left = shape === 'tab' ? 'blank' : 'tab';
    }
  }

  // Decide horizontal internal edges (between row r and r+1) for every col.
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      const shape: EdgeShape = rand() > 0.5 ? 'tab' : 'blank';
      grid[r][c].bottom = shape;
      grid[r + 1][c].top = shape === 'tab' ? 'blank' : 'tab';
    }
  }

  return grid;
}
