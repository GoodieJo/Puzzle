import type { Piece, PieceEdges, PuzzleConfig, SavedGame } from '../types/puzzle';
import { generateEdgeGrid } from './shapeGenerator';
import { buildPiecePath, getKnobDepth } from './piecePath';
import { mulberry32 } from './rng';

export const WORLD_BOARD_WIDTH = 1000;

export interface BoardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let hitTestCanvas: HTMLCanvasElement | null = null;
function getHitTestCtx(): CanvasRenderingContext2D {
  if (!hitTestCanvas) {
    hitTestCanvas = document.createElement('canvas');
    hitTestCanvas.width = 1;
    hitTestCanvas.height = 1;
  }
  const ctx = hitTestCanvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

export class PuzzleEngine {
  readonly config: PuzzleConfig;
  readonly cellW: number;
  readonly cellH: number;
  readonly knobDepth: number;
  readonly board: BoardRect;
  readonly edgeGrid: PieceEdges[][];
  readonly paths: Map<number, Path2D> = new Map();

  pieces: Piece[] = [];
  private zCounter = 1;
  private dragOffsets: Map<number, { dx: number; dy: number }> = new Map();

  constructor(config: PuzzleConfig, savedPieces?: Piece[]) {
    this.config = config;
    const boardW = WORLD_BOARD_WIDTH;
    const boardH = WORLD_BOARD_WIDTH / config.aspect;
    this.board = { x: 0, y: 0, width: boardW, height: boardH };
    this.cellW = boardW / config.cols;
    this.cellH = boardH / config.rows;
    this.knobDepth = getKnobDepth(this.cellW, this.cellH);
    this.edgeGrid = generateEdgeGrid(config.rows, config.cols, config.seed, config.pieceStyle);

    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const id = r * config.cols + c;
        this.paths.set(id, buildPiecePath(this.edgeGrid[r][c], this.cellW, this.cellH));
      }
    }

    if (savedPieces && savedPieces.length === config.rows * config.cols) {
      this.pieces = savedPieces.map((p) => ({ ...p }));
      this.zCounter = Math.max(1, ...this.pieces.map((p) => p.zIndex)) + 1;
    } else {
      this.pieces = this.createFreshPieces();
      this.scatter();
    }
  }

  private createFreshPieces(): Piece[] {
    const { rows, cols } = this.config;
    const pieces: Piece[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        const homeX = c * this.cellW;
        const homeY = r * this.cellH;
        pieces.push({
          id,
          row: r,
          col: c,
          homeX,
          homeY,
          x: homeX,
          y: homeY,
          rotation: 0,
          edges: this.edgeGrid[r][c],
          placed: false,
          zIndex: 0,
        });
      }
    }
    return pieces;
  }

  /** World-space rectangle that comfortably fits the scattered pieces. */
  getScatterBounds(): BoardRect {
    const count = this.config.rows * this.config.cols;
    const cellMax = Math.max(this.cellW, this.cellH);
    const margin = cellMax * Math.ceil(Math.sqrt(count)) * 0.62;
    return {
      x: this.board.x - margin,
      y: this.board.y - margin * 0.6,
      width: this.board.width + margin * 2,
      height: this.board.height + margin * 1.6,
    };
  }

  scatter(seedOffset = 0): void {
    const bounds = this.getScatterBounds();
    const rand = mulberry32(this.config.seed + 7919 + seedOffset);
    for (const piece of this.pieces) {
      if (piece.placed) continue;
      let x: number;
      let y: number;
      let attempts = 0;
      do {
        x = bounds.x + rand() * (bounds.width - this.cellW);
        y = bounds.y + rand() * (bounds.height - this.cellH);
        attempts++;
      } while (
        attempts < 6 &&
        x + this.cellW > this.board.x &&
        x < this.board.x + this.board.width &&
        y + this.cellH > this.board.y &&
        y < this.board.y + this.board.height
      );
      piece.x = x;
      piece.y = y;
      piece.rotation = this.config.allowRotation ? Math.floor(rand() * 4) * 90 : 0;
      piece.zIndex = this.zCounter++;
    }
  }

  autoArrange(): void {
    const loose = this.pieces.filter((p) => !p.placed);
    const bounds = this.getScatterBounds();
    const spacingX = this.cellW * 1.18;
    const spacingY = this.cellH * 1.18;
    const cols = Math.max(1, Math.floor(bounds.width / spacingX));
    const startY = this.board.y + this.board.height + this.cellH * 0.7;
    loose.forEach((piece, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      piece.x = bounds.x + col * spacingX;
      piece.y = startY + row * spacingY;
      piece.rotation = 0;
      piece.zIndex = this.zCounter++;
    });
  }

  /** Returns the topmost piece whose path contains the given world point. */
  getPieceAt(worldX: number, worldY: number): Piece | null {
    const ctx = getHitTestCtx();
    let best: Piece | null = null;
    for (const piece of this.pieces) {
      const path = this.paths.get(piece.id);
      if (!path) continue;
      const local = this.toLocalPoint(piece, worldX, worldY);
      if (ctx.isPointInPath(path, local.x, local.y)) {
        if (!best || piece.zIndex > best.zIndex) best = piece;
      }
    }
    return best;
  }

  private toLocalPoint(piece: Piece, worldX: number, worldY: number) {
    const dx = worldX - piece.x;
    const dy = worldY - piece.y;
    if (piece.rotation === 0) return { x: dx, y: dy };
    const rad = (-piece.rotation * Math.PI) / 180;
    const cx = this.cellW / 2;
    const cy = this.cellH / 2;
    const rx = dx - cx;
    const ry = dy - cy;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: rx * cos - ry * sin + cx,
      y: rx * sin + ry * cos + cy,
    };
  }

  beginDrag(pieceId: number, worldX: number, worldY: number): void {
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (!piece || piece.placed) return;
    piece.zIndex = this.zCounter++;
    this.dragOffsets.set(pieceId, { dx: worldX - piece.x, dy: worldY - piece.y });
  }

  updateDrag(pieceId: number, worldX: number, worldY: number): void {
    const piece = this.pieces.find((p) => p.id === pieceId);
    const offset = this.dragOffsets.get(pieceId);
    if (!piece || !offset) return;
    piece.x = worldX - offset.dx;
    piece.y = worldY - offset.dy;
  }

  /** Returns true if the piece snapped into its home slot. */
  endDrag(pieceId: number): boolean {
    this.dragOffsets.delete(pieceId);
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;
    const dist = Math.hypot(piece.x - piece.homeX, piece.y - piece.homeY);
    const snapDist = Math.min(this.cellW, this.cellH) * 0.38;
    const rotationOk = !this.config.allowRotation || piece.rotation % 360 === 0;
    if (dist < snapDist && rotationOk) {
      piece.x = piece.homeX;
      piece.y = piece.homeY;
      piece.rotation = 0;
      piece.placed = true;
      piece.zIndex = 0;
      return true;
    }
    return false;
  }

  rotatePiece(pieceId: number): void {
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (!piece || piece.placed || !this.config.allowRotation) return;
    piece.rotation = (piece.rotation + 90) % 360;
  }

  getProgress(): number {
    const placed = this.pieces.filter((p) => p.placed).length;
    return placed / this.pieces.length;
  }

  isComplete(): boolean {
    return this.pieces.every((p) => p.placed);
  }

  getWorldBounds(): BoardRect {
    const scatter = this.getScatterBounds();
    let minX = scatter.x;
    let minY = scatter.y;
    let maxX = scatter.x + scatter.width;
    let maxY = scatter.y + scatter.height;
    for (const piece of this.pieces) {
      minX = Math.min(minX, piece.x - this.knobDepth);
      minY = Math.min(minY, piece.y - this.knobDepth);
      maxX = Math.max(maxX, piece.x + this.cellW + this.knobDepth);
      maxY = Math.max(maxY, piece.y + this.cellH + this.knobDepth);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  serialize(stats: { elapsedMs: number; moves: number }): SavedGame {
    return {
      config: this.config,
      pieces: this.pieces.map((p) => ({ ...p })),
      stats,
      savedAt: Date.now(),
      completed: this.isComplete(),
    };
  }
}
