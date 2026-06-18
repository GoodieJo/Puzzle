import type { DifficultyOption } from '../types/puzzle';

export const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  { rows: 3, cols: 3, label: 'Easy' },
  { rows: 4, cols: 4, label: 'Easy' },
  { rows: 5, cols: 5, label: 'Medium' },
  { rows: 6, cols: 6, label: 'Medium' },
  { rows: 8, cols: 8, label: 'Hard' },
  { rows: 10, cols: 10, label: 'Hard' },
  { rows: 12, cols: 12, label: 'Expert' },
];

export function pieceCount(opt: DifficultyOption): number {
  return opt.rows * opt.cols;
}
