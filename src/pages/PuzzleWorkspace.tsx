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

  // ── Stable config: only changes when the actual puzzle changes (not on every
  //    player-list / connection-status update which would recreate the engine) ─
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

  // ── Refs (no React state for high-frequency data) ─────────────────────────
  const engineRef = useRef<PuzzleEngine | null>(null);
  // Locks stored as a plain ref — the RAF canvas loop reads .current every frame.
  // This means zero React re-renders when pieces are grabbed/moved/dropped.
  const locksRef = useRef<Map<number, RemoteLock>>(new Map());
  const initialPiecesApplied = useRef(false);
  const timerPauseRef = useRef(timer.pause);
  const screenRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { engineRef.current = engine; }, [engine]);
  useEffect(() => { timerPauseRef.current = timer.pause; }, [timer.pause]);

  // ── UI-only state (infrequent) ────────────────────────────────────────────
  const [showGhost, setShowGhost] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  const [mpTick, setMpTick] = useState(0); 
  useEffect(() => { if (!isMultiplayer) return; const id = setInterval(() => setMpTick((t) => t + 1), 1000);
  return () => clearInterval(id); }, [isMultiplayer]);

  // Reset initial-pieces flag when a new engine is created
  useEffect(() => { initialPiecesApplied.current = false; }, [engine]);

  // ── Apply server piece positions when engine first becomes available ───────
  const snapshotPieces = room.snapshot?.pieces;
  useEffect(() => {
    const eng = engineRef.current;
    if (!isMultiplayer || !eng || !snapshotPieces?.length || initialPiecesApplied.current) return;
    applyWirePieces(snapshotPieces, eng);
    initialPiecesApplied.current = true;
  }, [engine, isMultiplayer, snapshotPieces]);

  // ── Raw message handler: mutate engine and locksRef directly, no setState ──
  //    This fires 25+ times/second per player. Everything here MUST be ref-only.
  const { onRawMessage, playerId: roomPlayerId } = room;
  useEffect(() => {
    if (!isMultiplayer) return;
    return onRawMessage((msg) => {
      const eng = engineRef.current;

      // Lock display — mutate ref directly, canvas reads it next frame
      if (msg.type === 'piece_grabbed' && msg.playerId !== roomPlayerId) {
        locksRef.current.set(msg.pieceId, {
          playerId: msg.playerId,
          playerName: msg.playerName,
          playerColor: msg.playerColor,
          x: 0, y: 0,
        });
      }
      if (msg.type === 'piece_moved' && msg.playerId !== roomPlayerId) {
        const lock = locksRef.current.get(msg.pieceId);
        if (lock) { lock.x = msg.x; lock.y = msg.y; }
      }
      if (msg.type === 'piece_dropped' || msg.type === 'piece_lock_expired') {
        locksRef.current.delete(msg.pieceId);
      }

      if (!eng) return;

      // Remote piece position updates
      if (msg.type === 'piece_moved' && msg.playerId !== roomPlayerId) {
        const piece = eng.pieces.find((p) => p.id === msg.pieceId);
        if (piece && !piece.placed) { piece.x = msg.x; piece.y = msg.y; }
      }
      if (msg.type === 'piece_dropped' && msg.playerId !== roomPlayerId) {
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
        locksRef.current.clear();
        initialPiecesApplied.current = true;
      }
      if (msg.type === 'game_complete') {
        timerPauseRef.current();
        setIsComplete(true); // only setState here — fires once
      }
      if (msg.type === 'game_restarted') {
        setIsComplete(false);
        initialPiecesApplied.current = true;
      }
    });
  }, [isMultiplayer, onRawMessage, roomPlayerId]);

  // Sync single-player completion
  useEffect(() => {
    if (!isMultiplayer && completed) setIsComplete(true);
  }, [isMultiplayer, completed]);

  useEffect(() => {
    if (!isMultiplayer && !config && !selectedImage) goTo('home');
  }, [isMultiplayer, config, selectedImage, goTo]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Stable callbacks — room actions are already stable useCallbacks ────────
  const handleSnap     = useCallback(() => { hapticPulse(14); }, []);
  const handleMove     = useCallback(() => { if (!isMultiplayer) actions.incrementMove(); }, [isMultiplayer, actions]);
  const handleComplete = useCallback(() => { if (!isMultiplayer) { actions.markComplete(); setIsComplete(true); } }, [isMultiplayer, actions]);
  const handlePieceGrab = useCallback((pieceId: number) => { if (isMultiplayer) room.sendPieceGrab(pieceId); }, [isMultiplayer, room.sendPieceGrab]);
  const handlePieceMove = useCallback((pieceId: number, x: number, y: number) => { if (isMultiplayer) room.sendPieceMove(pieceId, x, y); }, [isMultiplayer, room.sendPieceMove]);
  const handlePieceDrop = useCallback((pieceId: number, x: number, y: number) => { if (isMultiplayer) room.sendPieceDrop(pieceId, x, y); }, [isMultiplayer, room.sendPieceDrop]);

  const { containerRef, canvasRef, selectedPieceId, handlers, controls } = usePuzzleCanvas({
    engine, image, showGhost,
    highContrast: settings.highContrast,
    backgroundColor: BOARD_BG,
    paused: timer.paused && !isMultiplayer,
    remoteLocks: locksRef,   // pass the ref itself — RAF loop reads .current
    onSnap: handleSnap, onMove: handleMove, onComplete: handleComplete,
    onPieceGrab: handlePieceGrab, onPieceMove: handlePieceMove, onPieceDrop: handlePieceDrop,
  });

  if (!effectiveConfig) return null;

  const totalPieces  = effectiveConfig.rows * effectiveConfig.cols;
  const placedCount  = engine ? engine.pieces.filter((p) => p.placed).length : 0;
  const progress     = totalPieces > 0 ? placedCount / totalPieces : 0;
  const displayTitle = selectedImage?.title ?? sc?.imageId ?? 'Puzzle';
  const mpMoves      = isMultiplayer ? (room.snapshot?.totalMoves ?? 0) : moves;
  const mpElapsed = isMultiplayer
    ? (room.snapshot?.startedAt ? Date.now() - room.snapshot.startedAt + (mpTick * 0) : 0)
    : timer.elapsedMs;

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await screenRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* iOS Safari */ }
  };

  const handleRestart = () => {
    if (!window.confirm('Restart? Progress will be lost.')) return;
    locksRef.current.clear();
    setIsComplete(false);
    if (isMultiplayer) room.sendRestart();
    else { actions.restart(); controls.deselect(); }
  };

  const handleShuffle = () => {
    if (isMultiplayer) room.sendShuffle();
    else actions.shuffle();
  };

  const handleTogglePause = () => {
    if (isMultiplayer) return;
    if (timer.paused) timer.resume(); else timer.pause();
  };

  const handleBack = () => {
    locksRef.current.clear();
    if (isMultiplayer) { room.leaveRoom(); goTo('home'); }
    else { actions.clearSave(); goTo('home'); }
  };

  return (
    <div className="screen workspace-screen" ref={screenRef}>
      <Header
        title={displayTitle}
        onBack={handleBack}
        right={isMultiplayer ? (
          <button
            className="btn btn-icon btn-ghost player-toggle"
            aria-label="Show players"
            aria-expanded={showPlayers}
            onClick={() => setShowPlayers((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
              <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" />
            </svg>
            <span className="player-toggle__count">{room.players.filter(p => p.online).length}</span>
          </button>
        ) : undefined}
      />

      <StatsBar
        elapsedMs={mpElapsed} moves={mpMoves} progress={progress}
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

      {/* Players panel — rendered as fixed overlay to avoid layout interference */}
      {isMultiplayer && showPlayers && (
        <div className="players-overlay" onClick={() => setShowPlayers(false)}>
          <div className="players-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="players-sheet__header">
              <span>Players ({room.players.filter(p => p.online).length} online)</span>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowPlayers(false)} aria-label="Close">✕</button>
            </div>
            <PlayerList players={room.players} localPlayerId={room.playerId} />
            {room.roomId && (
              <div className="players-sheet__room">
                <span>Room code</span>
                <code>{room.roomId}</code>
                <button className="btn btn-ghost"
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/room/${room.roomId}`)}>
                  Copy invite link
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <PreviewModal open={previewOpen} src={effectiveConfig.imageSrc} onClose={() => setPreviewOpen(false)} />

      <CompletionModal
        open={isComplete}
        elapsedMs={mpElapsed} moves={mpMoves}
        pieceCount={totalPieces} title={displayTitle}
        onPlayAgain={() => {
          locksRef.current.clear();
          setIsComplete(false);
          if (isMultiplayer) room.sendRestart();
          else { actions.restart(); controls.deselect(); }
        }}
        onHome={() => {
          locksRef.current.clear();
          if (isMultiplayer) { room.leaveRoom(); goTo('home'); }
          else { actions.clearSave(); goTo('home'); }
        }}
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
