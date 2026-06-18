import { useRef, useState } from 'react';
import { Header } from '../components/Header';
import { ImageCropper } from '../components/ImageCropper';
import { useApp } from '../store/AppContext';
import { resizeImage } from '../utils/resizeImage';
import { useImageElement } from '../hooks/useImageElement';
import './UploadScreen.css';

export function UploadScreen() {
  const { goTo, setSelectedImage } = useApp();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { image } = useImageElement(stagedUrl);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const resized = await resizeImage(file, 1800);
      setStagedUrl(resized.url);
    } catch {
      setError('Could not read that image. Please try another.');
    } finally {
      setBusy(false);
    }
  };

  if (stagedUrl && image) {
    return (
      <div className="screen upload-screen">
        <Header title="Crop your photo" onBack={() => setStagedUrl(null)} />
        <ImageCropper
          image={image}
          onCancel={() => setStagedUrl(null)}
          onConfirm={({ url, aspect }) => {
            setSelectedImage({
              id: `custom-${Date.now()}`,
              title: 'Your photo',
              category: 'Abstract',
              src: url,
              thumb: url,
              aspect,
              builtIn: false,
            });
            goTo('difficulty');
          }}
        />
      </div>
    );
  }

  return (
    <div className="screen upload-screen">
      <Header title="Upload a photo" onBack={() => goTo('home')} />
      <div className="upload-screen__body">
        <div className="upload-dropzone" onClick={() => inputRef.current?.click()}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p>{busy ? 'Preparing your photo…' : 'Tap to choose a photo'}</p>
          <span className="upload-dropzone__hint">JPG, PNG, or WebP</span>
        </div>
        {error && <p className="upload-screen__error" role="alert">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="visually-hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
