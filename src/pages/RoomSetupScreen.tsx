import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { ImageCard } from '../components/ImageCard';
import { ImageCropper } from '../components/ImageCropper';
import { useRoom } from '../store/RoomContext';
import { useApp } from '../store/AppContext';
import { useImageElement } from '../hooks/useImageElement';
import { resizeImage } from '../utils/resizeImage';
import { BUILT_IN_PUZZLES, CATEGORIES } from '../assets/puzzles/manifest';
import { DIFFICULTY_OPTIONS, pieceCount } from '../utils/difficulty';
import { seedFromString } from '../engine/rng';
import type { PuzzleImageMeta, PuzzleCategory } from '../types/puzzle';
import type { WirePuzzleConfig } from '../multiplayer/protocol';
import './RoomSetupScreen.css';

const WORKER_BASE_URL = import.meta.env.VITE_WORKER_URL as string ?? 'piecewise.anonymousguy074.workers.dev';
const LABEL_CLASS: Record<string, string> = {
  Easy: 'diff-pill diff-pill--easy', Medium: 'diff-pill diff-pill--medium',
  Hard: 'diff-pill diff-pill--hard', Expert: 'diff-pill diff-pill--expert',
};

export function RoomSetupScreen() {
  const { goTo, settings } = useApp();
  const { roomId, snapshot, players, isHost, setConfig, startGame, leaveRoom, connectionStatus } = useRoom();

  const [tab, setTab] = useState<'gallery' | 'upload'>('gallery');
  const [category, setCategory] = useState<'All' | PuzzleCategory>('All');
  const [selectedImage, setSelectedImage] = useState<PuzzleImageMeta | null>(null);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const { image: cropImage } = useImageElement(stagedUrl);
  const [pendingConfig, setPendingConfig] = useState<WirePuzzleConfig | null>(null);

  const phase = snapshot?.phase ?? 'lobby';
  const roomLink = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    // If server transitioned us to playing, go to workspace
    if (phase === 'playing' && snapshot?.config) {
      goTo('workspace');
    }
  }, [phase, snapshot?.config, goTo]);

  const handleImageSelect = (img: PuzzleImageMeta) => {
    setSelectedImage(img);
    setPendingConfig(null);
  };

  const handleFileUpload = async (file: File | undefined) => {
    if (!file || !roomId) return;
    setUploadBusy(true);
    try {
      const resized = await resizeImage(file, 1600);
      // Upload to Worker → R2
      const blob = await fetch(resized.url).then((r) => r.blob());
      const res = await fetch(`${WORKER_BASE_URL}/api/rooms/${roomId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: blob,
      });
      const { imageUrl } = await res.json() as { imageUrl: string };
      const fullUrl = WORKER_BASE_URL + imageUrl;
      setStagedUrl(fullUrl);
    } catch {
      alert('Upload failed. Please try again.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleCropConfirm = ({ url, aspect }: { url: string; width: number; height: number; aspect: number }) => {
    setSelectedImage({ id: `custom-${Date.now()}`, title: 'Your photo', category: 'Abstract', src: url, thumb: url, aspect, builtIn: false });
    setStagedUrl(null);
    setPendingConfig(null);
  };

  const handleSelectDifficulty = (rows: number, cols: number) => {
    if (!selectedImage) return;
    const cfg: WirePuzzleConfig = {
      imageId: selectedImage.id,
      imageSrc: selectedImage.src,
      rows, cols,
      pieceStyle: settings.pieceStyle,
      allowRotation: settings.allowRotation,
      aspect: selectedImage.aspect,
      seed: seedFromString(`${selectedImage.id}:${rows}x${cols}`),
    };
    setPendingConfig(cfg);
    setConfig(cfg);
  };

  const handleStart = () => {
    if (pendingConfig) startGame();
  };

  const copyLink = () => navigator.clipboard?.writeText(roomLink);

  const filteredImages = BUILT_IN_PUZZLES.filter(
    (img) => category === 'All' || img.category === category
  );

  if (!isHost) {
    return (
      <div className="screen room-setup-screen">
        <Header title={`Room ${roomId}`} onBack={() => { leaveRoom(); goTo('home'); }} />
        <div className="room-setup__waiting">
          <span className="room-setup__waiting-icon">⏳</span>
          <h2>Waiting for host…</h2>
          <p>The host is setting up the puzzle.</p>
          <div className="room-setup__players">
            {players.map((p) => (
              <div key={p.id} className="room-setup__player-chip" style={{ borderColor: p.color }}>
                <span className="room-setup__player-dot" style={{ background: p.color }} />
                {p.name} {p.isHost ? '👑' : ''}
              </div>
            ))}
          </div>
          <div className="room-setup__invite">
            <span className="room-setup__invite-label">Share this link:</span>
            <div className="room-setup__link-row">
              <code className="room-setup__code">{roomId}</code>
              <button className="btn btn-ghost" onClick={copyLink}>Copy link</button>
            </div>
          </div>
          <div className="conn-badge" data-status={connectionStatus}>
            {connectionStatus === 'connected' ? '● Connected' : connectionStatus === 'reconnecting' ? '↻ Reconnecting…' : '○ Connecting…'}
          </div>
        </div>
      </div>
    );
  }

  // Host view
  if (stagedUrl && cropImage) {
    return (
      <div className="screen room-setup-screen">
        <Header title="Crop your photo" onBack={() => setStagedUrl(null)} />
        <ImageCropper image={cropImage} onConfirm={handleCropConfirm} onCancel={() => setStagedUrl(null)} />
      </div>
    );
  }

  return (
    <div className="screen room-setup-screen">
      <Header title={`Room ${roomId}`} onBack={() => { leaveRoom(); goTo('home'); }} />

      <div className="room-setup__invite-bar">
        <span>Invite link:</span>
        <code>{roomId}</code>
        <button className="btn btn-ghost btn-sm" onClick={copyLink}>Copy</button>
      </div>

      {players.length > 1 && (
        <div className="room-setup__players-row">
          {players.map((p) => (
            <div key={p.id} className="room-setup__player-avatar" style={{ background: p.color }} title={p.name}>
              {p.name[0].toUpperCase()}
            </div>
          ))}
        </div>
      )}

      <div className="room-setup__tabs">
        <button className={tab === 'gallery' ? 'rs-tab is-active' : 'rs-tab'} onClick={() => setTab('gallery')}>Gallery</button>
        <button className={tab === 'upload' ? 'rs-tab is-active' : 'rs-tab'} onClick={() => setTab('upload')}>Upload photo</button>
      </div>

      {tab === 'gallery' && (
        <>
          <div className="chip-row" role="tablist" aria-label="Filter category">
            {CATEGORIES.map((c) => (
              <button key={c} role="tab" aria-selected={category === c}
                className={category === c ? 'chip is-active' : 'chip'} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
          <div className="gallery-grid">
            {filteredImages.map((img) => (
              <div key={img.id} className={selectedImage?.id === img.id ? 'gallery-item is-selected' : 'gallery-item'}>
                <ImageCard image={img} onSelect={handleImageSelect} />
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'upload' && (
        <div className="room-setup__upload">
          <div className="upload-dropzone" onClick={() => document.getElementById('rs-file')?.click()}>
            <p>{uploadBusy ? 'Uploading…' : 'Tap to choose a photo'}</p>
            <span className="upload-dropzone__hint">JPG, PNG, or WebP</span>
          </div>
          <input id="rs-file" type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden"
            onChange={(e) => handleFileUpload(e.target.files?.[0])} />
        </div>
      )}

      {selectedImage && (
        <div className="room-setup__difficulty-section">
          <h3>Choose difficulty</h3>
          <div className="difficulty-grid">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button key={`${opt.rows}x${opt.cols}`}
                className={pendingConfig?.rows === opt.rows && pendingConfig?.cols === opt.cols
                  ? 'difficulty-card is-selected' : 'difficulty-card'}
                onClick={() => handleSelectDifficulty(opt.rows, opt.cols)}>
                <span className="difficulty-card__count">{pieceCount(opt)}</span>
                <span className="difficulty-card__grid">{opt.rows} × {opt.cols}</span>
                <span className={LABEL_CLASS[opt.label]}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingConfig && (
        <div className="room-setup__start-bar">
          <button className="btn btn-primary room-setup__start-btn" onClick={handleStart}>
            Start puzzle for everyone →
          </button>
        </div>
      )}
    </div>
  );
}
