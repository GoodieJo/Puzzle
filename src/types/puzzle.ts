// Core domain types shared across engine, canvas, hooks and UI.

export type EdgeShape = 'flat' | 'tab' | 'blank';

export interface PieceEdges {
  top: EdgeShape;
  right: EdgeShape;
  bottom: EdgeShape;
  left: EdgeShape;
}

export type PieceStyle = 'classic' | 'square';

export interface Piece {
  id: number;
  row: number;
  col: number;
  /** Top-left corner of the piece's base cell in board/world coordinates when solved. */
  homeX: number;
  homeY: number;
  /** Current top-left position of the piece's base cell in world coordinates. */
  x: number;
  y: number;
  /** Rotation in degrees, multiple of 90. Always 0 unless rotation is enabled. */
  rotation: number;
  edges: PieceEdges;
  placed: boolean;
  zIndex: number;
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

export interface DifficultyOption {
  rows: number;
  cols: number;
  label: Difficulty;
}

export type PuzzleCategory = 'Nature' | 'Animals' | 'Love' | 'Cities' | 'Abstract';

export interface PuzzleImageMeta {
  id: string;
  title: string;
  category: PuzzleCategory;
  src: string;
  thumb: string;
  /** width / height */
  aspect: number;
  builtIn: boolean;
}

export interface PuzzleConfig {
  imageId: string;
  imageSrc: string;
  rows: number;
  cols: number;
  pieceStyle: PieceStyle;
  allowRotation: boolean;
  /** width / height of the board, derived from the source image */
  aspect: number;
  /** deterministic seed so the same config always yields the same piece shapes */
  seed: number;
}

export interface GameStats {
  elapsedMs: number;
  moves: number;
}

export interface SavedGame {
  config: PuzzleConfig;
  pieces: Piece[];
  stats: GameStats;
  pausedAt?: number;
  savedAt: number;
  completed: boolean;
}

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}
