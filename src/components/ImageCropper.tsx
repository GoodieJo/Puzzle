import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CROP_ASPECTS, getOriginalAspectOption, type CropAspectOption } from '../utils/cropAspects';
import './ImageCropper.css';

interface Pos {
  x: number;
  y: number;
}

interface ImageCropperProps {
  image: HTMLImageElement;
  onConfirm: (result: { url: string; width: number; height: number; aspect: number }) => void;
  onCancel: () => void;
}

function dist(a: Pos, b: Pos) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const OUTPUT_LONG_EDGE = 1800;

export function ImageCropper({ image, onConfirm, onCancel }: ImageCropperProps) {
  const originalAspect = useMemo(
    () => getOriginalAspectOption(image.naturalWidth, image.naturalHeight),
    [image]
  );
  const aspectOptions = useMemo(() => [originalAspect, ...CROP_ASPECTS], [originalAspect]);
  const [aspect, setAspect] = useState<CropAspectOption>(originalAspect);
  const [rotationSteps, setRotationSteps] = useState(0);
  const [frameBox, setFrameBox] = useState({ width: 0, height: 0 });

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Crop selection state, stored resolution-independently so it means the
  // same thing whether rendered into a small preview canvas or a large
  // export canvas: zoom is a multiplier over "just barely covers the frame",
  // and pan is a fraction of the frame's own width/height (not raw pixels).
  const zoomRef = useRef(1);
  const panRef = useRef<Pos>({ x: 0, y: 0 });

  const pointers = useRef<Map<number, Pos>>(new Map());
  const panPointerRef = useRef<{ id: number; last: Pos } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  // Effective (post-rotation) natural pixel dimensions of the source image.
  const effDims = useCallback(() => {
    const swapped = rotationSteps % 2 === 1;
    return {
      w: swapped ? image.naturalHeight : image.naturalWidth,
      h: swapped ? image.naturalWidth : image.naturalHeight,
    };
  }, [image, rotationSteps]);

  const frameAspectRatio = useMemo(() => {
    if (aspect.id !== 'original') return aspect.ratio;
    const { w, h } = effDims();
    return w / h;
  }, [aspect, effDims]);

  // How far (as a fraction of frame width/height) the image can be panned
  // before its edge would reveal empty space, for the current zoom level.
  const maxPanFrac = useCallback(() => {
    const { w, h } = effDims();
    const imageAspect = w / h;
    const ratioX = Math.max(1, imageAspect / frameAspectRatio);
    const ratioY = Math.max(1, frameAspectRatio / imageAspect);
    return {
      x: Math.max(0, (ratioX * zoomRef.current - 1) / 2),
      y: Math.max(0, (ratioY * zoomRef.current - 1) / 2),
    };
  }, [effDims, frameAspectRatio]);

  const clampPan = useCallback(() => {
    const limit = maxPanFrac();
    panRef.current = {
      x: clamp(panRef.current.x, -limit.x, limit.x),
      y: clamp(panRef.current.y, -limit.y, limit.y),
    };
  }, [maxPanFrac]);

  // Reset framing whenever the chosen aspect or rotation changes.
  useEffect(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
  }, [aspect, rotationSteps]);

  // Compute the frame's pixel box explicitly in JS rather than via CSS
  // aspect-ratio + max-height (which fight each other on wide/short
  // viewports, e.g. laptops, and silently produce the wrong box shape).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const recompute = () => {
      const rect = wrap.getBoundingClientRect();
      const availW = rect.width;
      const availH = Math.min(rect.height, window.innerHeight * 0.6);
      if (availW <= 0 || availH <= 0) return;
      let w = availW;
      let h = w / frameAspectRatio;
      if (h > availH) {
        h = availH;
        w = h * frameAspectRatio;
      }
      setFrameBox({ width: Math.round(w), height: Math.round(h) });
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [frameAspectRatio]);

  // Draws the current crop selection into any canvas/size that shares the
  // frame's aspect ratio - used for both the live preview and final export.
  const renderInto = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
      const { w: iw, h: ih } = effDims();
      ctx.fillStyle = '#11161f';
      ctx.fillRect(0, 0, cw, ch);
      const baseScale = Math.max(cw / iw, ch / ih);
      const scale = baseScale * zoomRef.current;
      const panPxX = panRef.current.x * cw;
      const panPxY = panRef.current.y * ch;
      ctx.save();
      ctx.translate(cw / 2 + panPxX, ch / 2 + panPxY);
      ctx.rotate((rotationSteps * 90 * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      ctx.restore();
    },
    [image, rotationSteps, effDims]
  );

  // Live preview render loop.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const { width, height } = frameBox;
      if (canvas && ctx && width > 0 && height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderInto(ctx, width, height);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [frameBox, renderInto]);

  const getRelative = (e: React.PointerEvent): Pos => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const pos = getRelative(e);
    pointers.current.set(e.pointerId, pos);
    if (pointers.current.size === 1) {
      panPointerRef.current = { id: e.pointerId, last: pos };
    } else if (pointers.current.size === 2) {
      panPointerRef.current = null;
      const pts = [...pointers.current.values()];
      pinchRef.current = { startDist: Math.max(1, dist(pts[0], pts[1])), startZoom: zoomRef.current };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pos = getRelative(e);
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, pos);
    const { width, height } = frameBox;
    if (width === 0 || height === 0) return;

    if (pinchRef.current && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()].slice(0, 2);
      const d = Math.max(1, dist(pts[0], pts[1]));
      const pinch = pinchRef.current;
      zoomRef.current = clamp(pinch.startZoom * (d / pinch.startDist), MIN_ZOOM, MAX_ZOOM);
      clampPan();
      return;
    }

    const pan = panPointerRef.current;
    if (pan && pan.id === e.pointerId) {
      const dx = pos.x - prev.x;
      const dy = pos.y - prev.y;
      panRef.current = {
        x: panRef.current.x + dx / width,
        y: panRef.current.y + dy / height,
      };
      clampPan();
    }
  };

  const onPointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (panPointerRef.current?.id === e.pointerId) panPointerRef.current = null;
    if (pinchRef.current && pointers.current.size < 2) {
      pinchRef.current = null;
      if (pointers.current.size === 1) {
        const [id, pos] = [...pointers.current.entries()][0];
        panPointerRef.current = { id, last: pos };
      }
    }
  };

  const adjustZoom = (factor: number) => {
    zoomRef.current = clamp(zoomRef.current * factor, MIN_ZOOM, MAX_ZOOM);
    clampPan();
  };

  const handleConfirm = () => {
    let outW: number;
    let outH: number;
    if (frameAspectRatio >= 1) {
      outW = OUTPUT_LONG_EDGE;
      outH = Math.round(OUTPUT_LONG_EDGE / frameAspectRatio);
    } else {
      outH = OUTPUT_LONG_EDGE;
      outW = Math.round(OUTPUT_LONG_EDGE * frameAspectRatio);
    }
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    renderInto(ctx, outW, outH);
    out.toBlob(
      (blob) => {
        if (!blob) return;
        onConfirm({ url: URL.createObjectURL(blob), width: outW, height: outH, aspect: outW / outH });
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <div className="cropper">
      <div className="cropper__frame-wrap" ref={wrapRef}>
        <div
          className="cropper__frame"
          ref={frameRef}
          style={{ width: frameBox.width || undefined, height: frameBox.height || undefined }}
        >
          <canvas
            ref={canvasRef}
            className="cropper__canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUpOrCancel}
            onPointerCancel={onPointerUpOrCancel}
            role="img"
            aria-label="Drag to reposition, pinch to zoom the crop area"
          />
        </div>
      </div>

      <div className="cropper__controls">
        <div className="chip-row cropper__aspects" role="radiogroup" aria-label="Crop aspect ratio">
          {aspectOptions.map((opt) => (
            <button
              key={opt.id}
              role="radio"
              aria-checked={aspect.id === opt.id}
              className={aspect.id === opt.id ? 'chip is-active' : 'chip'}
              onClick={() => setAspect(opt)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="cropper__row">
          <button className="btn btn-ghost btn-icon" aria-label="Zoom out" onClick={() => adjustZoom(0.85)}>
            −
          </button>
          <button className="btn btn-ghost btn-icon" aria-label="Zoom in" onClick={() => adjustZoom(1.18)}>
            +
          </button>
          <button
            className="btn btn-ghost btn-icon"
            aria-label="Rotate 90 degrees"
            onClick={() => setRotationSteps((r) => (r + 1) % 4)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 9a8 8 0 1114.93 4.5M4 9V4M4 9h5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="cropper__row cropper__row--actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleConfirm}>
            Use this photo
          </button>
        </div>
      </div>
    </div>
  );
}
