import { useCallback, useEffect, useRef, useState } from 'react';
import type { PuzzleEngine } from '../engine/PuzzleEngine';
import type { Viewport } from '../types/puzzle';
import type { RemoteLock } from '../multiplayer/sync';
import { drawScene } from './drawScene';
import { fitViewport, zoomViewportAt, screenToWorld } from './viewport';

interface PointerPos { x: number; y: number; }
interface PinchState {
  startDist: number; startMid: PointerPos;
  startScale: number; startOffset: { x: number; y: number };
}

export interface UsePuzzleCanvasArgs {
  engine: PuzzleEngine | null;
  image: HTMLImageElement | null;
  showGhost: boolean;
  highContrast: boolean;
  backgroundColor: string;
  paused: boolean;
  /** Map of pieceId → RemoteLock (pieces being moved by other players). */
  remoteLocks: Map<number, RemoteLock>;
  onSnap: () => void;
  onMove: () => void;
  onComplete: () => void;
  /** Called when local user picks up a piece (for multiplayer grab broadcast). */
  onPieceGrab?: (pieceId: number) => void;
  /** Called each frame while dragging (throttled externally by MultiplayerClient). */
  onPieceMove?: (pieceId: number, x: number, y: number) => void;
  /** Called when local user drops a piece (for multiplayer drop broadcast). */
  onPieceDrop?: (pieceId: number, x: number, y: number) => void;
}

function dist(a: PointerPos, b: PointerPos) { return Math.hypot(a.x - b.x, a.y - b.y); }
function midpoint(a: PointerPos, b: PointerPos): PointerPos { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

export function usePuzzleCanvas(args: UsePuzzleCanvasArgs) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const argsRef = useRef(args);
  useEffect(() => { argsRef.current = args; });

  const viewportRef = useRef<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 });
  const sizeRef = useRef({ width: 0, height: 0 });
  const fitScaleRef = useRef(1);
  const hasFitRef = useRef(false);
  const lastEngineRef = useRef<PuzzleEngine | null>(null);

  const pointers = useRef<Map<number, PointerPos>>(new Map());
  const dragRef = useRef<{ pointerId: number; pieceId: number } | null>(null);
  const panRef = useRef<{ pointerId: number; last: PointerPos } | null>(null);
  const pinchRef = useRef<PinchState | null>(null);

  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);

  const requestFit = useCallback(() => {
    const engine = argsRef.current.engine;
    const { width, height } = sizeRef.current;
    if (!engine || width === 0 || height === 0) return;
    const bounds = engine.getWorldBounds();
    const vp = fitViewport(bounds, width, height);
    viewportRef.current = vp;
    fitScaleRef.current = vp.scale;
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const apply = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      sizeRef.current = { width, height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (!hasFitRef.current) { requestFit(); hasFitRef.current = true; }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(container);
    return () => ro.disconnect();
  }, [requestFit]);

  // Re-fit on new engine
  useEffect(() => {
    if (args.engine !== lastEngineRef.current) {
      lastEngineRef.current = args.engine;
      hasFitRef.current = false;
      setSelectedPieceId(null);
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        sizeRef.current = { width: Math.round(rect.width), height: Math.round(rect.height) };
      }
      requestFit();
      hasFitRef.current = true;
    }
  }, [args.engine, requestFit]);

  // RAF render loop
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const { engine, image, showGhost, highContrast, backgroundColor, remoteLocks } = argsRef.current;
      if (canvas && engine && image) {
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const { width, height } = sizeRef.current;
        if (ctx && width > 0 && height > 0) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawScene(ctx, engine, image, viewportRef.current, width, height, {
            showGhost,
            draggingId: dragRef.current?.pieceId ?? null,
            selectedId: selectedPieceId,
            highContrast,
            backgroundColor,
            remoteLocks,
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [selectedPieceId]);

  const getRelative = useCallback((e: { clientX: number; clientY: number }): PointerPos => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const finishDrag = useCallback(() => {
    const drag = dragRef.current;
    const engine = argsRef.current.engine;
    if (!drag || !engine) return;
    const piece = engine.pieces.find((p) => p.id === drag.pieceId);
    const dropX = piece?.x ?? 0;
    const dropY = piece?.y ?? 0;
    const snapped = engine.endDrag(drag.pieceId);
    dragRef.current = null;
    argsRef.current.onPieceDrop?.(drag.pieceId, snapped ? engine.pieces.find(p => p.id === drag.pieceId)?.x ?? dropX : dropX, snapped ? engine.pieces.find(p => p.id === drag.pieceId)?.y ?? dropY : dropY);
    argsRef.current.onMove();
    if (snapped) {
      argsRef.current.onSnap();
      if (engine.isComplete()) argsRef.current.onComplete();
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const engine = argsRef.current.engine;
      if (!engine || argsRef.current.paused) return;
      const canvas = canvasRef.current;
      canvas?.setPointerCapture(e.pointerId);
      const pos = getRelative(e);
      pointers.current.set(e.pointerId, pos);

      if (pointers.current.size === 1) {
        const world = screenToWorld(viewportRef.current, pos.x, pos.y);
        const piece = engine.getPieceAt(world.x, world.y);
        if (piece && !piece.placed) {
          // Block grab if locked by another player
          const isRemoteLocked = argsRef.current.remoteLocks.has(piece.id);
          if (isRemoteLocked) {
            panRef.current = { pointerId: e.pointerId, last: pos };
            return;
          }
          dragRef.current = { pointerId: e.pointerId, pieceId: piece.id };
          engine.beginDrag(piece.id, world.x, world.y);
          setSelectedPieceId(piece.id);
          argsRef.current.onPieceGrab?.(piece.id);
        } else {
          panRef.current = { pointerId: e.pointerId, last: pos };
          setSelectedPieceId(null);
        }
      } else if (pointers.current.size === 2) {
        if (dragRef.current) finishDrag();
        panRef.current = null;
        const pts = [...pointers.current.values()];
        pinchRef.current = {
          startDist: Math.max(1, dist(pts[0], pts[1])),
          startMid: midpoint(pts[0], pts[1]),
          startScale: viewportRef.current.scale,
          startOffset: { x: viewportRef.current.offsetX, y: viewportRef.current.offsetY },
        };
      }
    },
    [getRelative, finishDrag]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      const engine = argsRef.current.engine;
      if (!engine) return;
      const pos = getRelative(e);
      const prev = pointers.current.get(e.pointerId)!;
      pointers.current.set(e.pointerId, pos);

      if (pinchRef.current && pointers.current.size >= 2) {
        const pts = [...pointers.current.values()].slice(0, 2);
        const d = Math.max(1, dist(pts[0], pts[1]));
        const m = midpoint(pts[0], pts[1]);
        const pinch = pinchRef.current;
        const targetScale = clamp(pinch.startScale * (d / pinch.startDist), fitScaleRef.current * 0.4, fitScaleRef.current * 5);
        const base = zoomViewportAt(
          { scale: pinch.startScale, offsetX: pinch.startOffset.x, offsetY: pinch.startOffset.y },
          pinch.startMid.x, pinch.startMid.y, targetScale
        );
        viewportRef.current = {
          scale: targetScale,
          offsetX: base.offsetX + (m.x - pinch.startMid.x),
          offsetY: base.offsetY + (m.y - pinch.startMid.y),
        };
        return;
      }

      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId) {
        const world = screenToWorld(viewportRef.current, pos.x, pos.y);
        engine.updateDrag(drag.pieceId, world.x, world.y);
        argsRef.current.onPieceMove?.(drag.pieceId, world.x, world.y);
        return;
      }

      const pan = panRef.current;
      if (pan && pan.pointerId === e.pointerId) {
        const dx = pos.x - prev.x;
        const dy = pos.y - prev.y;
        viewportRef.current = { ...viewportRef.current, offsetX: viewportRef.current.offsetX + dx, offsetY: viewportRef.current.offsetY + dy };
      }
    },
    [getRelative]
  );

  const onPointerUpOrCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      pointers.current.delete(e.pointerId);
      if (dragRef.current?.pointerId === e.pointerId) finishDrag();
      if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
      if (pinchRef.current && pointers.current.size < 2) {
        pinchRef.current = null;
        if (pointers.current.size === 1) {
          const [id, pos] = [...pointers.current.entries()][0];
          panRef.current = { pointerId: id, last: pos };
        }
      }
    },
    [finishDrag]
  );

  const zoomBy = useCallback((factor: number) => {
    const { width, height } = sizeRef.current;
    const target = clamp(viewportRef.current.scale * factor, fitScaleRef.current * 0.4, fitScaleRef.current * 5);
    viewportRef.current = zoomViewportAt(viewportRef.current, width / 2, height / 2, target);
  }, []);

  const zoomIn = useCallback(() => zoomBy(1.25), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(0.8), [zoomBy]);
  const resetView = useCallback(() => requestFit(), [requestFit]);
  const rotateSelected = useCallback(() => {
    const engine = argsRef.current.engine;
    if (!engine || selectedPieceId === null) return;
    engine.rotatePiece(selectedPieceId);
  }, [selectedPieceId]);
  const deselect = useCallback(() => setSelectedPieceId(null), []);

  return {
    containerRef, canvasRef, selectedPieceId,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerUpOrCancel, onPointerCancel: onPointerUpOrCancel },
    controls: { zoomIn, zoomOut, resetView, rotateSelected, deselect },
  };
}
