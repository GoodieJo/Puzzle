import type { PuzzleEngine } from '../engine/PuzzleEngine';
import type { Viewport } from '../types/puzzle';
import type { RemoteLock } from '../multiplayer/sync';

export interface DrawOptions {
  showGhost: boolean;
  draggingId: number | null;
  selectedId: number | null;
  highContrast: boolean;
  backgroundColor: string;
  remoteLocks: Map<number, RemoteLock>;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  engine: PuzzleEngine,
  image: HTMLImageElement | ImageBitmap,
  viewport: Viewport,
  cssWidth: number,
  cssHeight: number,
  opts: DrawOptions
): void {
  ctx.save();
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = opts.highContrast ? '#000000' : opts.backgroundColor;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  const { board } = engine;

  // Board frame
  ctx.save();
  ctx.fillStyle = opts.highContrast ? '#1a1a1a' : 'rgba(0,0,0,0.18)';
  ctx.fillRect(board.x, board.y, board.width, board.height);

  if (opts.showGhost) {
    ctx.globalAlpha = opts.highContrast ? 0.35 : 0.22;
    ctx.drawImage(image as CanvasImageSource, board.x, board.y, board.width, board.height);
    ctx.globalAlpha = 1;
  }

  // Grid guide lines
  ctx.strokeStyle = opts.highContrast ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1 / viewport.scale;
  for (let r = 1; r < engine.config.rows; r++) {
    const y = board.y + r * engine.cellH;
    ctx.beginPath(); ctx.moveTo(board.x, y); ctx.lineTo(board.x + board.width, y); ctx.stroke();
  }
  for (let c = 1; c < engine.config.cols; c++) {
    const x = board.x + c * engine.cellW;
    ctx.beginPath(); ctx.moveTo(x, board.y); ctx.lineTo(x, board.y + board.height); ctx.stroke();
  }
  ctx.strokeStyle = opts.highContrast ? '#ffffff' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2 / viewport.scale;
  ctx.strokeRect(board.x, board.y, board.width, board.height);
  ctx.restore();

  const natW = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const natH = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

  const ordered = [...engine.pieces].sort((a, b) => a.zIndex - b.zIndex);

  for (const piece of ordered) {
    const path = engine.paths.get(piece.id);
    if (!path) continue;
    const isDragging = piece.id === opts.draggingId;
    const isSelected = piece.id === opts.selectedId;
    const remoteLock = opts.remoteLocks.get(piece.id);
    const isRemoteLocked = !!remoteLock;

    ctx.save();
    ctx.translate(piece.x, piece.y);
    if (piece.rotation !== 0) {
      ctx.translate(engine.cellW / 2, engine.cellH / 2);
      ctx.rotate((piece.rotation * Math.PI) / 180);
      ctx.translate(-engine.cellW / 2, -engine.cellH / 2);
    }

    if (isDragging) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 14 / viewport.scale;
      ctx.shadowOffsetX = 3 / viewport.scale;
      ctx.shadowOffsetY = 6 / viewport.scale;
    }

    ctx.save();
    ctx.clip(path);
    ctx.drawImage(
      image as CanvasImageSource,
      0, 0, natW, natH,
      board.x - piece.homeX, board.y - piece.homeY, board.width, board.height
    );
    // Remote-locked tint overlay
    if (isRemoteLocked && !opts.highContrast) {
      ctx.fillStyle = remoteLock.playerColor + '33'; // ~20% opacity
      ctx.fillRect(0, 0, engine.cellW, engine.cellH);
    }
    ctx.restore();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    if (opts.highContrast) {
      ctx.lineWidth = 2.5 / viewport.scale;
      ctx.strokeStyle = '#ffffff';
    } else if (isRemoteLocked) {
      ctx.lineWidth = 2.5 / viewport.scale;
      ctx.strokeStyle = remoteLock.playerColor;
    } else {
      ctx.lineWidth = (isDragging || isSelected ? 2 : 1.1) / viewport.scale;
      ctx.strokeStyle = isSelected ? 'rgba(232,105,58,0.95)'
        : piece.placed ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.32)';
    }
    ctx.stroke(path);
    ctx.restore();

    // Draw player name badge above remote-locked pieces
    if (isRemoteLocked) {
      const sx = piece.x * viewport.scale + viewport.offsetX;
      const sy = piece.y * viewport.scale + viewport.offsetY;
      const sw = engine.cellW * viewport.scale;
      ctx.save();
      const label = remoteLock.playerName;
      const fontSize = Math.max(10, Math.min(13, sw * 0.18));
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      const pad = 4;
      const tw = ctx.measureText(label).width;
      const bw = tw + pad * 2;
      const bh = fontSize + pad * 2;
      const bx = sx + (sw - bw) / 2;
      const by = sy - bh - 4;
      ctx.fillStyle = remoteLock.playerColor;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + pad, by + bh / 2);
      ctx.restore();
    }
  }

  ctx.restore();
}
