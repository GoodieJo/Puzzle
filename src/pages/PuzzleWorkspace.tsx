import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { useRoom } from '../store/RoomContext';
import { useImageElement } from '../hooks/useImageElement';
import { usePuzzleGame } from '../hooks/usePuzzleGame';
import { usePuzzleCanvas } from '../canvas/usePuzzleCanvas';
import { PuzzleEngine } from '../engine/PuzzleEngine';
import { applyWirePieces } from '../multiplayer/sync';
import type { RemoteLock } from '../multiplayer/sync';
import { Header } from '../components/Header';
import { StatsBar } from '../components/StatsBar';
import { Toolbar } from '../components/Toolbar';
import { PreviewModal } from '../components/PreviewModal';
import { CompletionModal } from '../components/CompletionModal';
import { PlayerList } from '../components/PlayerList';
import { hapticPulse } from '../utils/haptics';
import type { WirePuzzleConfig } from '../multiplayer/protocol';
import './PuzzleWorkspace.css';

const BOARD_BG = '#11161f';

export function PuzzleWorkspace() {
  const { config, selectedImage, settings, goTo } = useApp();
  const room = useRoom();
  const isMultiplayer = !!room.roomId && !!room.snapshot;

  // In multiplayer mode, build config from the server snapshot
  const effectiveConfig = isMultiplayer && room.snapshot?.config
    ? wireToPuzzleConfig(room.snapshot.config)
    : config;

  const { image } = useImageElement(effectiveConfig?.imageSrc ?? null);
  const { engine, moves, completed, timer, actions } = usePuzzleGame(effectiveConfig);

  const [showGhost, setShowGhost] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [remoteLocks, setRemoteLocks] = useState<Map<number, RemoteLock>>(new Map());
  const screenRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PuzzleEngine | null>(null);
  const locksRef = useRef<Map<number, RemoteLock>>(new Map());

  // Keep engineRef current
  useEffect(() => { engineRef.current = engine; }, [engine]);

  // ── Multiplayer event bridge ──────────────────────────────────────────────
  useEffect(() => {
    if (!isMultiplayer) return;

    return room.onServerMessage((snap, prev) => {
      const eng = engineRef.current;
      if (!eng) return;

      // game_started: hydrate piece positions from server
      if (snap.phase === 'playing' && prev?.phase !== 'playing' && snap.pieces.length > 0) {
        applyWirePieces(snap.pieces, eng);
        locksRef.current.clear();
        setRemoteLocks(new Map());
        return;
      }

      // Per-event sync already handled in RoomContext; update locks display
      setRemoteLocks(new Map(room.locks));
    });
  }, [isMultiplayer, room.onServerMessage, room.locks]);

  // Also apply all server events to local engine for remote player moves
  useEffect(() => {
    if (!isMultiplayer) return;
    return room.onServerMessage((snap) => {
      const eng = engineRef.current;
      if (!eng) return;
      // snap.pieces carries latest positions - apply any we're not locally tracking
      for (const wp of snap.pieces) {
        const local = eng.pieces.find((p) => p.id === wp.id);
        if (local && !local.placed && !eng['dragOffsets']?.has(wp.id)) {
          local.x = wp.x;
          local.y = wp.y;
          local.placed = wp.placed;
        }
      }
    });
  }, [isMultiplayer, room.onServerMessage]);

  // Apply per-message events (piece_moved, piece_dropped, board_shuffled, etc.)
  useEffect(() => {
    if (!isMultiplayer) return;
    const client = (room as { _client?: unknown })._client;
    void client; // handled via room context message loop
    // The RoomContext already relays messages; we tap into lock changes
    setRemoteLocks(new Map(room.locks));
  }, [isMultiplayer, room.locks]);

  // Navigate to home if we leave
  useEffect(() => {
    if (!isMultiplayer && !config && !selectedImage) goTo('home');
  }, [isMultiplayer, config, selectedImage, goTo]);

  // Navigate when multiplayer game completes
  useEffect(() => {
    if (isMultiplayer && room.snapshot?.phase === 'complete') {
      timer.pause();
    }
  }, [isMultiplayer, room.snapshot?.phase, timer]);

  const handleSnap = useCallback(() => { hapticPulse(14); }, []);
  const handleMove = useCallback(() => { if (!isMultiplayer) actions.incrementMove(); }, [isMultiplayer, actions]);
  const handleComplete = useCallback(() => { if (!isMultiplayer) actions.markComplete(); }, [isMultiplayer, actions]);

  const handlePieceGrab = useCallback((pieceId: number) => {
    if (isMultiplayer) room.sendPieceGrab(pieceId);
  }, [isMultiplayer, room]);

  const handlePieceMove = useCallback((pieceId: number, x: number, y: number) => {
    if (isMultiplayer) room.sendPieceMove(pieceId, x, y);
  }, [isMultiplayer, room]);

  const handlePieceDrop = useCallback((pieceId: number, x: number, y: number) => {
    if (isMultiplayer) room.sendPieceDrop(pieceId, x, y);
  }, [isMultiplayer, room]);

  const { containerRef, canvasRef, selectedPieceId, handlers, controls } = usePuzzleCanvas({
    engine,
    image,
    showGhost,
    highContrast: settings.highContrast,
    backgroundColor: BOARD_BG,
    paused: timer.paused && !isMultiplayer,
    remoteLocks,
    onSnap: handleSnap,
    onMove: handleMove,
    onComplete: handleComplete,
    onPieceGrab: handlePieceGrab,
    onPieceMove: handlePieceMove,
    onPieceDrop: handlePieceDrop,
  });

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (!effectiveConfig) return null;

  const totalPieces = effectiveConfig.rows * effectiveConfig.cols;
  const placedCount = engine ? engine.pieces.filter((p) => p.placed).length : 0;
  const progress = totalPieces > 0 ? placedCount / totalPieces : 0;
  const isComplete = isMultiplayer
    ? room.snapshot?.phase === 'complete'
    : completed;

  const displayTitle = isMultiplayer
    ? (room.snapshot?.config ? selectedImage?.title ?? 'Puzzle' : 'Puzzle')
    : (selectedImage?.title ?? 'Puzzle');

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await screenRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* iOS Safari */ }
  };

  const handleRestart = () => {
    if (!window.confirm('Restart? Current progress will be lost.')) return;
    if (isMultiplayer) room.sendRestart();
    else { actions.restart(); controls.deselect(); }
  };

  const handleShuffle = () => {
    if (isMultiplayer) room.sendShuffle();
    else actions.shuffle();
  };

  const handleTogglePause = () => {
    if (isMultiplayer) return; // no pause in multiplayer
    if (timer.paused) timer.resume();
    else timer.pause();
  };

  const handleBack = () => {
    if (isMultiplayer) { room.leaveRoom(); goTo('home'); }
    else { actions.clearSave(); goTo('home'); }
  };

  // Multiplayer stats
  const mpMoves = isMultiplayer ? (room.snapshot?.totalMoves ?? 0) : moves;
  const mpElapsed = isMultiplayer
    ? (room.snapshot?.startedAt ? Date.now() - room.snapshot.startedAt : 0)
    : timer.elapsedMs;

  return (
    <div className="screen workspace-screen" ref={screenRef}>
      <Header
        title={displayTitle}
        onBack={handleBack}
        right={
          isMultiplayer ? (
            <button
              className="btn btn-icon btn-ghost player-toggle"
              aria-label="Show players"
              onClick={() => setShowPlayers((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
                <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" />
              </svg>
              <span className="player-toggle__count">{room.players.filter(p => p.online).length}</span>
            </button>
          ) : undefined
        }
      />

      <StatsBar
        elapsedMs={mpElapsed}
        moves={mpMoves}
        progress={progress}
        paused={timer.paused && !isMultiplayer}
      />

      {isMultiplayer && room.connectionStatus !== 'connected' && (
        <div className="workspace-conn-banner" role="alert">
          {room.connectionStatus === 'reconnecting' ? '↻ Reconnecting…' : '○ Connecting…'}
        </div>
      )}

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
          aria-label="Puzzle board. Drag pieces to solve. Pinch to zoom, drag to pan."
        />
        {timer.paused && !isMultiplayer && (
          <div className="workspace-pause-overlay">
            <button className="btn btn-primary" onClick={handleTogglePause}>Resume</button>
          </div>
        )}
      </div>

      {isMultiplayer && showPlayers && (
        <div className="workspace-players-panel">
          <div className="workspace-players-panel__header">
            <span>Players</span>
            <button className="btn btn-icon btn-ghost" onClick={() => setShowPlayers(false)} aria-label="Close">✕</button>
          </div>
          <PlayerList players={room.players} localPlayerId={room.playerId} />
          {room.roomId && (
            <div className="workspace-room-code">
              Room: <code>{room.roomId}</code>
              <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/room/${room.roomId}`)}>Copy link</button>
            </div>
          )}
        </div>
      )}

      <Toolbar
        onShuffle={handleShuffle}
        onAutoArrange={() => { if (!isMultiplayer) actions.autoArrange(); }}
        onZoomIn={controls.zoomIn}
        onZoomOut={controls.zoomOut}
        onResetZoom={controls.resetView}
        onTogglePreview={() => setPreviewOpen(true)}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        onTogglePause={handleTogglePause}
        paused={timer.paused && !isMultiplayer}
        onRestart={handleRestart}
        showGhost={showGhost}
        onToggleGhost={() => setShowGhost((g) => !g)}
        allowRotation={effectiveConfig.allowRotation}
        onRotate={controls.rotateSelected}
        rotateEnabled={selectedPieceId !== null}
      />

      <PreviewModal
        open={previewOpen}
        src={effectiveConfig.imageSrc}
        onClose={() => setPreviewOpen(false)}
      />

      <CompletionModal
        open={isComplete}
        elapsedMs={mpElapsed}
        moves={mpMoves}
        pieceCount={totalPieces}
        title={displayTitle}
        onPlayAgain={() => {
          if (isMultiplayer) room.sendRestart();
          else { actions.restart(); controls.deselect(); }
        }}
        onHome={() => {
          if (isMultiplayer) { room.leaveRoom(); goTo('home'); }
          else { actions.clearSave(); goTo('home'); }
        }}
      />
    </div>
  );
}

function wireToPuzzleConfig(w: WirePuzzleConfig) {
  return {
    imageId: w.imageId,
    imageSrc: w.imageSrc,
    rows: w.rows,
    cols: w.cols,
    pieceStyle: w.pieceStyle,
    allowRotation: w.allowRotation,
    aspect: w.aspect,
    seed: w.seed,
  };
}
