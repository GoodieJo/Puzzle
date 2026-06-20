import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  // ── FIX 1: Stable effectiveConfig ────────────────────────────────────────
  // wireToPuzzleConfig() returns a new object on every call. If we call it
  // inline, every re-render (triggered by lock updates) creates a new config
  // object → usePuzzleGame sees a config change → recreates the engine from
  // scratch → drag state and piece positions are wiped. Use useMemo with
  // scalar deps so this only recomputes when the actual puzzle changes.
  const sc = room.snapshot?.config;
  const effectiveConfig = useMemo(() => {
    if (isMultiplayer && sc) return wireToPuzzleConfig(sc);
    return config;
  }, [
    isMultiplayer,
    sc?.imageId, sc?.rows, sc?.cols, sc?.seed, sc?.imageSrc,
    sc?.pieceStyle, sc?.allowRotation, sc?.aspect,
    config,
  ]);

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

  useEffect(() => { engineRef.current = engine; }, [engine]);

  // ── FIX 2: Apply initial server piece positions when engine is ready ──────
  // By the time the workspace mounts, the game is already in 'playing' phase,
  // so we can never catch a phase transition. Instead, apply snapshot pieces
  // the moment the engine object first becomes available.
  const snapshotPieces = room.snapshot?.pieces;
  useEffect(() => {
    const eng = engineRef.current;
    if (!isMultiplayer || !eng || !snapshotPieces?.length) return;
    applyWirePieces(snapshotPieces, eng);
  }, [engine, isMultiplayer, snapshotPieces]);

  // ── FIX 3: Sync remote piece moves directly via raw messages ─────────────
  // The snapshot is NOT updated on every piece_moved message (that would be
  // hundreds of React state updates per second). Instead we subscribe to raw
  // ServerMessage objects and mutate the engine pieces directly — same as the
  // existing local drag optimistic update pattern.
  useEffect(() => {
    if (!isMultiplayer) return;
    return room.onRawMessage((msg) => {
      const eng = engineRef.current;

      // Update remote locks display
      if (
        msg.type === 'piece_grabbed' ||
        msg.type === 'piece_moved' ||
        msg.type === 'piece_dropped' ||
        msg.type === 'piece_lock_expired'
      ) {
        const newLocks = new Map(locksRef.current);
        if (msg.type === 'piece_grabbed' && msg.playerId !== room.playerId) {
          newLocks.set(msg.pieceId, {
            playerId: msg.playerId,
            playerName: msg.playerName,
            playerColor: msg.playerColor,
            x: 0,
            y: 0,
          });
        }
        if (msg.type === 'piece_moved' && msg.playerId !== room.playerId) {
          const lock = newLocks.get(msg.pieceId);
          if (lock) { lock.x = msg.x; lock.y = msg.y; }
        }
        if (msg.type === 'piece_dropped' || msg.type === 'piece_lock_expired') {
          newLocks.delete(msg.type === 'piece_dropped' ? msg.pieceId : msg.pieceId);
        }
        locksRef.current = newLocks;
        setRemoteLocks(new Map(newLocks));
      }

      if (!eng) return;

      // Apply remote piece movements to local engine
      if (msg.type === 'piece_moved' && msg.playerId !== room.playerId) {
        const piece = eng.pieces.find((p) => p.id === msg.pieceId);
        if (piece && !piece.placed) { piece.x = msg.x; piece.y = msg.y; }
      }

      if (msg.type === 'piece_dropped' && msg.playerId !== room.playerId) {
        const piece = eng.pieces.find((p) => p.id === msg.pieceId);
        if (piece) {
          piece.x = msg.x; piece.y = msg.y;
          if (msg.snapped) {
            piece.x = piece.homeX; piece.y = piece.homeY;
            piece.placed = true; piece.zIndex = 0;
          }
        }
      }

      if (msg.type === 'board_shuffled' || msg.type === 'game_restarted') {
        applyWirePieces(msg.pieces, eng);
        locksRef.current = new Map();
        setRemoteLocks(new Map());
      }

      if (msg.type === 'game_complete') {
        timer.pause();
      }
    });
  }, [isMultiplayer, room.onRawMessage, room.playerId, timer]);

  // Navigate back if not in a valid state
  useEffect(() => {
    if (!isMultiplayer && !config && !selectedImage) goTo('home');
  }, [isMultiplayer, config, selectedImage, goTo]);

  const handleSnap = useCallback(() => { hapticPulse(14); }, []);
  const handleMove = useCallback(() => { if (!isMultiplayer) actions.incrementMove(); }, [isMultiplayer, actions]);
  const handleComplete = useCallback(() => { if (!isMultiplayer) actions.markComplete(); }, [isMultiplayer, actions]);
  const handlePieceGrab = useCallback((pieceId: number) => { if (isMultiplayer) room.sendPieceGrab(pieceId); }, [isMultiplayer, room]);
  const handlePieceMove = useCallback((pieceId: number, x: number, y: number) => { if (isMultiplayer) room.sendPieceMove(pieceId, x, y); }, [isMultiplayer, room]);
  const handlePieceDrop = useCallback((pieceId: number, x: number, y: number) => { if (isMultiplayer) room.sendPieceDrop(pieceId, x, y); }, [isMultiplayer, room]);

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
  const isComplete = isMultiplayer ? room.snapshot?.phase === 'complete' : completed;
  const displayTitle = selectedImage?.title ?? room.snapshot?.config?.imageId ?? 'Puzzle';
  const mpMoves = isMultiplayer ? (room.snapshot?.totalMoves ?? 0) : moves;
  const mpElapsed = isMultiplayer
    ? (room.snapshot?.startedAt ? Date.now() - room.snapshot.startedAt : 0)
    : timer.elapsedMs;

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await screenRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* iOS Safari doesn't support fullscreen */ }
  };

  const handleRestart = () => {
    if (!window.confirm('Restart? Current progress will be lost.')) return;
    if (isMultiplayer) room.sendRestart();
    else { actions.restart(); controls.deselect(); }
  };

  const handleShuffle = () => { if (isMultiplayer) room.sendShuffle(); else actions.shuffle(); };
  const handleTogglePause = () => {
    if (isMultiplayer) return;
    if (timer.paused) timer.resume(); else timer.pause();
  };
  const handleBack = () => {
    if (isMultiplayer) { room.leaveRoom(); goTo('home'); }
    else { actions.clearSave(); goTo('home'); }
  };

  return (
    <div className="screen workspace-screen" ref={screenRef}>
      <Header
        title={displayTitle}
        onBack={handleBack}
        right={
          isMultiplayer ? (
            <button className="btn btn-icon btn-ghost player-toggle" aria-label="Show players"
              onClick={() => setShowPlayers((v) => !v)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
                <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" />
              </svg>
              <span className="player-toggle__count">{room.players.filter(p => p.online).length}</span>
            </button>
          ) : undefined
        }
      />

      <StatsBar elapsedMs={mpElapsed} moves={mpMoves} progress={progress} paused={timer.paused && !isMultiplayer} />

      {isMultiplayer && room.connectionStatus !== 'connected' && (
        <div className="workspace-conn-banner" role="alert">
          {room.connectionStatus === 'reconnecting' ? '↻ Reconnecting…' : '○ Connecting…'}
        </div>
      )}

      <div className="workspace-canvas-area" ref={containerRef}>
        {!image && <div className="workspace-loading">Loading puzzle…</div>}
        <canvas ref={canvasRef} className="workspace-canvas"
          onPointerDown={handlers.onPointerDown} onPointerMove={handlers.onPointerMove}
          onPointerUp={handlers.onPointerUp} onPointerCancel={handlers.onPointerCancel}
          role="application" aria-label="Puzzle board. Drag pieces to solve. Pinch to zoom, drag to pan." />
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
              <button className="btn btn-ghost btn-sm"
                onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/room/${room.roomId}`)}>
                Copy link
              </button>
            </div>
          )}
        </div>
      )}

      <Toolbar
        onShuffle={handleShuffle}
        onAutoArrange={() => { if (!isMultiplayer) actions.autoArrange(); }}
        onZoomIn={controls.zoomIn} onZoomOut={controls.zoomOut} onResetZoom={controls.resetView}
        onTogglePreview={() => setPreviewOpen(true)}
        onToggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen}
        onTogglePause={handleTogglePause} paused={timer.paused && !isMultiplayer}
        onRestart={handleRestart}
        showGhost={showGhost} onToggleGhost={() => setShowGhost((g) => !g)}
        allowRotation={effectiveConfig.allowRotation}
        onRotate={controls.rotateSelected} rotateEnabled={selectedPieceId !== null}
      />

      <PreviewModal open={previewOpen} src={effectiveConfig.imageSrc} onClose={() => setPreviewOpen(false)} />

      <CompletionModal
        open={!!isComplete} elapsedMs={mpElapsed} moves={mpMoves}
        pieceCount={totalPieces} title={displayTitle}
        onPlayAgain={() => { if (isMultiplayer) room.sendRestart(); else { actions.restart(); controls.deselect(); } }}
        onHome={() => { if (isMultiplayer) { room.leaveRoom(); goTo('home'); } else { actions.clearSave(); goTo('home'); } }}
      />
    </div>
  );
}

function wireToPuzzleConfig(w: WirePuzzleConfig) {
  return {
    imageId: w.imageId, imageSrc: w.imageSrc,
    rows: w.rows, cols: w.cols,
    pieceStyle: w.pieceStyle, allowRotation: w.allowRotation,
    aspect: w.aspect, seed: w.seed,
  };
}