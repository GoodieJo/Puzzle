import { useEffect, useState } from 'react';

export function useImageElement(src: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState(1);
  const [loading, setLoading] = useState(!!src);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    setLoading(true);
    setError(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      setImage(img);
      setAspect(img.naturalWidth / img.naturalHeight || 1);
      setLoading(false);
    };
    img.onerror = () => {
      setError('Could not load image');
      setLoading(false);
    };
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return { image, aspect, loading, error };
}
