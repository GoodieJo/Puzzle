import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MultiplayerClient } from '../multiplayer/client';
import type { RoomSnapshot, PlayerInfo, WirePuzzleConfig, ServerMessage } from '../multiplayer/protocol';

const WORKER_BASE_URL = (import.meta.env.VITE_WORKER_URL as string | undefined)?.trim() ?? '';
const PLAYER_ID_KEY = 'piecewise:playerId';
const PLAYER_NAME_KEY = 'piecewise:playerName';

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(PLAYER_ID_KEY, id); }
  return id;
}

function getStoredName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface RoomContextValue {
  playerId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  roomId: string | null;
  snapshot: RoomSnapshot | null;
  connectionStatus: ConnectionStatus;
  players: PlayerInfo[];
  // NOTE: locks are intentionally NOT in context.
  // They update 25+ times/second per player — putting them in React state
  // causes the entire component tree to re-render on every piece move.
  // PuzzleWorkspace manages locks via a plain ref read by the RAF canvas loop.
  createRoom: () => Promise<string>;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  setConfig: (config: WirePuzzleConfig) => void;
  startGame: () => void;
  sendPieceGrab: (pieceId: number) => void;
  sendPieceMove: (pieceId: number, x: number, y: number) => void;
  sendPieceDrop: (pieceId: number, x: number, y: number) => void;
  sendShuffle: () => void;
  sendRestart: () => void;
  isHost: boolean;
  onServerMessage: (handler: (snap: RoomSnapshot, prev: RoomSnapshot | null) => void) => () => void;
  onRawMessage: (handler: (msg: ServerMessage) => void) => () => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [playerId] = useState(getOrCreatePlayerId);
  const [playerName, setPlayerNameState] = useState(getStoredName);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');

  const clientRef = useRef<MultiplayerClient | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const snapshotHandlersRef = useRef<Set<(snap: RoomSnapshot, prev: RoomSnapshot | null) => void>>(new Set());
  const rawHandlersRef = useRef<Set<(msg: ServerMessage) => void>>(new Set());

  const setPlayerName = useCallback((name: string) => {
    setPlayerNameState(name);
    localStorage.setItem(PLAYER_NAME_KEY, name);
  }, []);

  useEffect(() => {
    const client = new MultiplayerClient({
      workerBaseUrl: WORKER_BASE_URL,
      onConnect: () => setConnectionStatus('connected'),
      onDisconnect: () => setConnectionStatus((s) => s === 'connected' ? 'reconnecting' : s),
      onMessage: (msg) => {
        const prevSnap = snapshotRef.current;

        // ── Structural state updates (infrequent) ──────────────────────────
        if (msg.type === 'room_state') {
          snapshotRef.current = msg.snapshot;
          setSnapshot(msg.snapshot);
          setPlayers(msg.snapshot.players);
          snapshotHandlersRef.current.forEach((h) => h(msg.snapshot, prevSnap));
          rawHandlersRef.current.forEach((h) => h(msg));
          return;
        }

        if (msg.type === 'player_joined') {
          setPlayers((prev) => {
            const idx = prev.findIndex((p) => p.id === msg.player.id);
            if (idx >= 0) { const n = [...prev]; n[idx] = msg.player; return n; }
            return [...prev, msg.player];
          });
        }
        if (msg.type === 'player_left' || msg.type === 'player_online') {
          setPlayers((prev) => prev.map((p) =>
            p.id === msg.playerId
              ? { ...p, online: msg.type === 'player_online' ? msg.online : false }
              : p
          ));
        }
        if (msg.type === 'host_changed') {
          setPlayers((prev) => prev.map((p) => ({ ...p, isHost: p.id === msg.newHostId })));
        }
        if (msg.type === 'game_started') {
          setSnapshot((prev) => prev
            ? { ...prev, phase: 'playing', config: msg.config, pieces: msg.pieces }
            : prev);
        }
        if (msg.type === 'game_complete') {
          setSnapshot((prev) => prev
            ? { ...prev, phase: 'complete', completedAt: msg.completedAt }
            : prev);
          setPlayers(msg.players);
        }

        // ── Fire raw handlers for ALL messages (piece sync, lock display) ──
        // These are ref-based callbacks — zero React state updates for
        // piece_moved/grabbed/dropped which fire at 25+ msg/s per player.
        rawHandlersRef.current.forEach((h) => h(msg));

        if (snapshotRef.current) {
          snapshotHandlersRef.current.forEach((h) => h(snapshotRef.current!, prevSnap));
        }
      },
    });
    clientRef.current = client;
    return () => client.disconnect();
  }, [playerId]);

  // Reconnect on tab visibility (mobile background → foreground)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && roomId && !clientRef.current?.isConnected) {
        setConnectionStatus('reconnecting');
        clientRef.current?.connect(roomId, playerId, playerName);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [roomId, playerId, playerName]);

  const createRoom = useCallback(async () => {
    setConnectionStatus('connecting');
    const res = await fetch(`${WORKER_BASE_URL}/api/rooms`, { method: 'POST' });
    const { roomId: id } = await res.json() as { roomId: string };
    setRoomId(id);
    clientRef.current?.connect(id, playerId, playerName);
    return id;
  }, [playerId, playerName]);

  const joinRoom = useCallback((id: string) => {
    setConnectionStatus('connecting');
    setRoomId(id);
    clientRef.current?.connect(id, playerId, playerName);
  }, [playerId, playerName]);

  const leaveRoom = useCallback(() => {
    clientRef.current?.disconnect();
    setRoomId(null);
    setSnapshot(null);
    setPlayers([]);
    setConnectionStatus('idle');
  }, []);

  const setConfig  = useCallback((c: WirePuzzleConfig) => clientRef.current?.send({ type: 'set_config', config: c }), []);
  const startGame  = useCallback(() => clientRef.current?.send({ type: 'start_game' }), []);
  const sendPieceGrab = useCallback((pieceId: number) => clientRef.current?.send({ type: 'piece_grab', pieceId }), []);
  const sendPieceMove = useCallback((pieceId: number, x: number, y: number) => clientRef.current?.sendPieceMove(pieceId, x, y), []);
  const sendPieceDrop = useCallback((pieceId: number, x: number, y: number) => clientRef.current?.send({ type: 'piece_drop', pieceId, x, y }), []);
  const sendShuffle   = useCallback(() => clientRef.current?.send({ type: 'shuffle' }), []);
  const sendRestart   = useCallback(() => clientRef.current?.send({ type: 'restart' }), []);

  const isHost = useMemo(() => snapshot?.hostId === playerId, [snapshot?.hostId, playerId]);

  const onServerMessage = useCallback((handler: (snap: RoomSnapshot, prev: RoomSnapshot | null) => void) => {
    snapshotHandlersRef.current.add(handler);
    return () => snapshotHandlersRef.current.delete(handler);
  }, []);

  const onRawMessage = useCallback((handler: (msg: ServerMessage) => void) => {
    rawHandlersRef.current.add(handler);
    return () => rawHandlersRef.current.delete(handler);
  }, []);

  const value = useMemo<RoomContextValue>(() => ({
    playerId, playerName, setPlayerName,
    roomId, snapshot, connectionStatus, players,
    createRoom, joinRoom, leaveRoom,
    setConfig, startGame,
    sendPieceGrab, sendPieceMove, sendPieceDrop,
    sendShuffle, sendRestart,
    isHost, onServerMessage, onRawMessage,
  }), [
    playerId, playerName, setPlayerName,
    roomId, snapshot, connectionStatus, players,
    createRoom, joinRoom, leaveRoom,
    setConfig, startGame,
    sendPieceGrab, sendPieceMove, sendPieceDrop,
    sendShuffle, sendRestart,
    isHost, onServerMessage, onRawMessage,
  ]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within RoomProvider');
  return ctx;
}
