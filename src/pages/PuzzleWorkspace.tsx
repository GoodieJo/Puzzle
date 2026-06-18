import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { useImageElement } from '../hooks/useImageElement';
import { usePuzzleGame } from '../hooks/usePuzzleGame';
import { usePuzzleCanvas } from '../canvas/usePuzzleCanvas';
import { Header } from '../components/Header';
import { StatsBar } from '../components/StatsBar';
import { Toolbar } from '../components/Toolbar';
import { PreviewModal } from '../components/PreviewModal';
import { CompletionModal } from '../components/CompletionModal';
import { hapticPulse } from '../utils/haptics';
import './PuzzleWorkspace.css';

const BOARD_BG = '#11161f';

export function PuzzleWorkspace() {
  const { config, selectedImage, settings, goTo } = useApp();
  const { image } = useImageElement(config?.imageSrc ?? null);
  const { engine, moves, completed, timer, actions } = usePuzzleGame(config);

  useEffect(() => {
    if (!config || !selectedImage) goTo('home');
  }, [config, selectedImage, goTo]);

  const [showGhost, setShowGhost] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const handleSnap = useCallback(() => {
    hapticPulse(14);
  }, []);
  const handleMove = useCallback(() => actions.incrementMove(), [actions]);
  const handleComplete = useCallback(() => actions.markComplete(), [actions]);

  const { containerRef, canvasRef, selectedPieceId, handlers, controls } = usePuzzleCanvas({
    engine,
    image,
    showGhost,
    highContrast: settings.highContrast,
    backgroundColor: BOARD_BG,
    paused: timer.paused || completed,
    onSnap: handleSnap,
    onMove: handleMove,
    onComplete: handleComplete,
  });

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (!config || !selectedImage) {
    return null;
  }

  const totalPieces = config.rows * config.cols;
  const placedCount = engine ? engine.pieces.filter((p) => p.placed).length : 0;
  const progress = totalPieces > 0 ? placedCount / totalPieces : 0;

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await screenRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen API may be unavailable (e.g. iOS Safari) - silently ignore.
    }
  };

  const handleRestart = () => {
    if (window.confirm('Restart this puzzle? Your current progress will be lost.')) {
      actions.restart();
      controls.deselect();
    }
  };

  const handleTogglePause = () => {
    if (timer.paused) timer.resume();
    else timer.pause();
  };

  return (
    <div className="screen workspace-screen" ref={screenRef}>
      <Header
        title={selectedImage.title}
        onBack={() => {
          actions.clearSave();
          goTo('home');
        }}
      />
      <StatsBar elapsedMs={timer.elapsedMs} moves={moves} progress={progress} paused={timer.paused} />

      <div className="workspace-canvas-area" ref={containerRef}>
        {!image && <div className="workspace-loading">Loading puzzle…</div>}
        <canvas
          ref={canvasRef}
          className="workspace-canvas"
          onPointerDown={handlers.onPointerDown}
          onPointerMove={handlers.onPointerMove}
          onPointerUp={handlers.onPointerUp}
          onPointerCancel={handlers.onPointerCancel}
          role="application"
          aria-label="Puzzle board. Drag pieces to assemble the image. Pinch or use zoom buttons to scale the view."
        />
        {timer.paused && !completed && (
          <div className="workspace-pause-overlay">
            <button className="btn btn-primary" onClick={handleTogglePause}>
              Resume
            </button>
          </div>
        )}
      </div>

      <Toolbar
        onShuffle={actions.shuffle}
        onAutoArrange={actions.autoArrange}
        onZoomIn={controls.zoomIn}
        onZoomOut={controls.zoomOut}
        onResetZoom={controls.resetView}
        onTogglePreview={() => setPreviewOpen(true)}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        onTogglePause={handleTogglePause}
        paused={timer.paused}
        onRestart={handleRestart}
        showGhost={showGhost}
        onToggleGhost={() => setShowGhost((g) => !g)}
        allowRotation={config.allowRotation}
        onRotate={controls.rotateSelected}
        rotateEnabled={selectedPieceId !== null}
      />

      <PreviewModal open={previewOpen} src={config.imageSrc} onClose={() => setPreviewOpen(false)} />

      <CompletionModal
        open={completed}
        elapsedMs={timer.elapsedMs}
        moves={moves}
        pieceCount={totalPieces}
        title={selectedImage.title}
        onPlayAgain={() => {
          actions.restart();
        }}
        onHome={() => {
          actions.clearSave();
          goTo('home');
        }}
      />
    </div>
  );
}
