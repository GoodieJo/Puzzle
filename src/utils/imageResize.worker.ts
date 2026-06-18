/// <reference lib="webworker" />

export interface ResizeRequest {
  id: number;
  file: Blob;
  maxDimension: number;
}

export interface ResizeResponse {
  id: number;
  blob?: Blob;
  width?: number;
  height?: number;
  error?: string;
}

self.onmessage = async (e: MessageEvent<ResizeRequest>) => {
  const { id, file, maxDimension } = e.data;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const response: ResizeResponse = { id, blob, width, height };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: ResizeResponse = { id, error: err instanceof Error ? err.message : 'Resize failed' };
    (self as unknown as Worker).postMessage(response);
  }
};

export {};
