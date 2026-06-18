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
function mid(a: Pos, b: Pos): Pos {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function ImageCropper({ image, onConfirm, onCancel }: ImageCropperProps) {
  const originalAspect = useMemo(
    () => getOriginalAspectOption(image.naturalWidth, image.naturalHeight),
    [image]
  );
  const aspectOptions = useMemo(() => [originalAspect, ...CROP_ASPECTS], [originalAspect]);
  const [aspect, setAspect] = useState<CropAspectOption>(originalAspect);
  const [rotationSteps, setRotationSteps] = useState(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameSize = useRef({ width: 0, height: 0 });
  const baseScale = useRef(1);
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef<Map<number, Pos>>(new Map());
  const panRef = useRef<{ id: number; last: Pos } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number; startX: number; startY: number; mid: Pos } | null>(null);

  const effDims = useCallback(() => {
    const swapped = rotationSteps % 2 === 1;
    return {
      w: swapped ? image.naturalHeight : image.naturalWidth,
      h: swapped ? image.naturalWidth : image.naturalHeight,
    };
  }, [image, rotationSteps]);

  const fitToFrame = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    frameSize.current = { width: rect.width, height: rect.height };
    const { w, h } = effDims();
    const scale = Math.max(rect.width / w, rect.height / h);
    baseScale.current = scale;
    transform.current = { scale, x: 0, y: 0 };
  }, [effDims]);

  useEffect(() => {
    fitToFrame();
  }, [aspect, rotationSteps, fitToFrame]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(fitToFrame);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [fitToFrame]);

  // Render loop (redraw on any transform change; cheap single-image draw).
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const { width, height } = frameSize.current;
      if (canvas && ctx && width > 0 && height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#11161f';
        ctx.fillRect(0, 0, width, height);
        const t = transform.current;
        ctx.save();
        ctx.translate(width / 2 + t.x, height / 2 + t.y);
        ctx.rotate((rotationSteps * 90 * Math.PI) / 180);
        ctx.scale(t.scale, t.scale);
        ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [image, rotationSteps]);

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
      panRef.current = { id: e.pointerId, last: pos };
    } else if (pointers.current.size === 2) {
      panRef.current = null;
      const pts = [...pointers.current.values()];
      pinchRef.current = {
        startDist: Math.max(1, dist(pts[0], pts[1])),
        startScale: transform.current.scale,
        startX: transform.current.x,
        startY: transform.current.y,
        mid: mid(pts[0], pts[1]),
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pos = getRelative(e);
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, pos);

    if (pinchRef.current && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()].slice(0, 2);
      const d = Math.max(1, dist(pts[0], pts[1]));
      const pinch = pinchRef.current;
      const minScale = baseScale.current * 1;
      const maxScale = baseScale.current * 4;
      const newScale = Math.min(maxScale, Math.max(minScale, pinch.startScale * (d / pinch.startDist)));
      transform.current = { scale: newScale, x: pinch.startX, y: pinch.startY };
      return;
    }

    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      const dx = pos.x - prev.x;
      const dy = pos.y - prev.y;
      transform.current = { ...transform.current, x: transform.current.x + dx, y: transform.current.y + dy };
    }
  };

  const onPointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (panRef.current?.id === e.pointerId) panRef.current = null;
    if (pinchRef.current && pointers.current.size < 2) {
      pinchRef.current = null;
      if (pointers.current.size === 1) {
        const [id, pos] = [...pointers.current.entries()][0];
        panRef.current = { id, last: pos };
      }
    }
  };

  const adjustZoom = (factor: number) => {
    const minScale = baseScale.current * 1;
    const maxScale = baseScale.current * 4;
    transform.current = {
      ...transform.current,
      scale: Math.min(maxScale, Math.max(minScale, transform.current.scale * factor)),
    };
  };

  const handleConfirm = () => {
    const { width, height } = frameSize.current;
    const outScale = Math.min(1600 / width, 3);
    const outW = Math.round(width * outScale);
    const outH = Math.round(height * outScale);
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    const t = transform.current;
    ctx.save();
    ctx.translate(outW / 2 + t.x * outScale, outH / 2 + t.y * outScale);
    ctx.rotate((rotationSteps * 90 * Math.PI) / 180);
    ctx.scale(t.scale * outScale, t.scale * outScale);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    ctx.restore();
    out.toBlob(
      (blob) => {
        if (!blob) return;
        onConfirm({ url: URL.createObjectURL(blob), width: outW, height: outH, aspect: outW / outH });
      },
      'image/jpeg',
      0.92
    );
  };

  const eff = effDims();
  const frameAspectRatio = aspect.id === 'original' ? eff.w / eff.h : aspect.ratio;

  return (
    <div className="cropper">
      <div className="cropper__frame-wrap">
        <div
          className="cropper__frame"
          ref={frameRef}
          style={{ aspectRatio: frameAspectRatio }}
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
