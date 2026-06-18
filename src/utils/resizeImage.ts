export interface ResizedImage {
  url: string;
  width: number;
  height: number;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (res: ResizedImage | null) => void>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./imageResize.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; width?: number; height?: number; error?: string }>) => {
        const { id, blob, width, height } = e.data;
        const resolve = pending.get(id);
        pending.delete(id);
        if (resolve && blob && width && height) {
          resolve({ url: URL.createObjectURL(blob), width, height });
        } else if (resolve) {
          resolve(null);
        }
      };
    } catch {
      worker = null;
    }
  }
  return worker;
}

async function resizeOnMainThread(file: Blob, maxDimension: number): Promise<ResizedImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('toBlob failed'));
        resolve({ url: URL.createObjectURL(blob), width, height });
      },
      'image/jpeg',
      0.9
    );
  });
}

/** Resizes an image so its longest edge is at most maxDimension, keeping the UI thread free. */
export async function resizeImage(file: Blob, maxDimension = 1600): Promise<ResizedImage> {
  const w = getWorker();
  if (w) {
    try {
      const result = await new Promise<ResizedImage | null>((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        w.postMessage({ id, file, maxDimension });
      });
      if (result) return result;
    } catch {
      // fall through to main-thread path
    }
  }
  return resizeOnMainThread(file, maxDimension);
}
