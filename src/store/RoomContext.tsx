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
import type { RoomSnapshot, PlayerInfo, WirePuzzleConfig } from '../multiplayer/protocol';
import type { RemoteLock } from '../multiplayer/sync';

const WORKER_BASE_URL = import.meta.env.VITE_WORKER_URL as string ?? 'piecewise.anonymousguy074.workers.dev';
const PLAYER_ID_KEY = 'piecewise:playerId';
const PLAYER_NAME_KEY = 'piecewise:playerName';

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

function getStoredName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface RoomContextValue {
  // Identity
  playerId: string;
  playerName: string;
  setPlayerName: (name: string) => void;

  // Room
  roomId: string | null;
  snapshot: RoomSnapshot | null;
  connectionStatus: ConnectionStatus;

  // Players
  players: PlayerInfo[];
  locks: Map<number, RemoteLock>;

  // Actions
  createRoom: () => Promise<string>; // returns roomId
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

  // For PuzzleWorkspace to register event handlers
  onServerMessage: (handler: (snap: RoomSnapshot, prevSnap: RoomSnapshot | null) => void) => () => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [playerId] = useState(getOrCreatePlayerId);
  const [playerName, setPlayerNameState] = useState(getStoredName);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [locks, setLocks] = useState<Map<number, RemoteLock>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');

  const clientRef = useRef<MultiplayerClient | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const locksRef = useRef<Map<number, RemoteLock>>(new Map());
  const snapshotHandlersRef = useRef<Set<(snap: RoomSnapshot, prev: RoomSnapshot | null) => void>>(new Set());

  const setPlayerName = useCallback((name: string) => {
    setPlayerNameState(name);
    localStorage.setItem(PLAYER_NAME_KEY, name);
  }, []);

  // Initialize the multiplayer client once
  useEffect(() => {
    const client = new MultiplayerClient({
      workerBaseUrl: WORKER_BASE_URL,
      onConnect: () => setConnectionStatus('connected'),
      onDisconnect: () => setConnectionStatus((s) => s === 'connected' ? 'reconnecting' : s),
      onMessage: (msg) => {
        const prevSnap = snapshotRef.current;

        if (msg.type === 'room_state') {
          const snap = msg.snapshot;
          snapshotRef.current = snap;
          setSnapshot(snap);
          setPlayers(snap.players);
          // Build locks from snapshot
          const newLocks = new Map<number, RemoteLock>();
          for (const p of snap.pieces) {
            if (p.lockedBy && p.lockedBy !== playerId) {
              const locker = snap.players.find((pl) => pl.id === p.lockedBy);
              if (locker) {
                newLocks.set(p.id, {
                  playerId: locker.id,
                  playerName: locker.name,
                  playerColor: locker.color,
                  x: p.x,
                  y: p.y,
                });
              }
            }
          }
          locksRef.current = newLocks;
          setLocks(new Map(newLocks));
          snapshotHandlersRef.current.forEach((h) => h(snap, prevSnap));
          return;
        }

        if (msg.type === 'player_joined') {
          setPlayers((prev) => {
            const idx = prev.findIndex((p) => p.id === msg.player.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = msg.player; return next; }
            return [...prev, msg.player];
          });
        }
        if (msg.type === 'player_left' || msg.type === 'player_online') {
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === (msg.type === 'player_left' ? msg.playerId : msg.playerId)
                ? { ...p, online: msg.type === 'player_online' ? msg.online : false }
                : p
            )
          );
        }

        if (msg.type === 'piece_grabbed') {
          if (msg.playerId !== playerId) {
            locksRef.current.set(msg.pieceId, {
              playerId: msg.playerId,
              playerName: msg.playerName,
              playerColor: msg.playerColor,
              x: 0,
              y: 0,
            });
            setLocks(new Map(locksRef.current));
          }
        }
        if (msg.type === 'piece_moved' && msg.playerId !== playerId) {
          const lock = locksRef.current.get(msg.pieceId);
          if (lock) { lock.x = msg.x; lock.y = msg.y; setLocks(new Map(locksRef.current)); }
        }
        if (msg.type === 'piece_dropped') {
          locksRef.current.delete(msg.pieceId);
          setLocks(new Map(locksRef.current));
        }
        if (msg.type === 'piece_lock_expired') {
          locksRef.current.delete(msg.pieceId);
          setLocks(new Map(locksRef.current));
        }

        if (msg.type === 'game_started') {
          setSnapshot((prev) => prev ? { ...prev, phase: 'playing', config: msg.config, pieces: msg.pieces } : prev);
        }
        if (msg.type === 'game_complete') {
          setSnapshot((prev) => prev ? { ...prev, phase: 'complete', completedAt: msg.completedAt } : prev);
          setPlayers(msg.players);
        }
        if (msg.type === 'host_changed') {
          setPlayers((prev) => prev.map((p) => ({ ...p, isHost: p.id === msg.newHostId })));
        }

        // Forward to workspace handlers for engine sync
        if (snapshotRef.current) {
          snapshotHandlersRef.current.forEach((h) => h(snapshotRef.current!, prevSnap));
        }
      },
    });
    clientRef.current = client;
    return () => client.disconnect();
  }, [playerId]);

  // Reconnect when page becomes visible (handles mobile background/foreground)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && roomId && !clientRef.current?.isConnected) {
        setConnectionStatus('reconnecting');
        clientRef.current?.connect(roomId, playerId, playerName);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
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
    setLocks(new Map());
    locksRef.current.clear();
    setConnectionStatus('idle');
  }, []);

  const setConfig = useCallback((config: WirePuzzleConfig) => {
    clientRef.current?.send({ type: 'set_config', config });
  }, []);

  const startGame = useCallback(() => {
    clientRef.current?.send({ type: 'start_game' });
  }, []);

  const sendPieceGrab = useCallback((pieceId: number) => {
    clientRef.current?.send({ type: 'piece_grab', pieceId });
  }, []);

  const sendPieceMove = useCallback((pieceId: number, x: number, y: number) => {
    clientRef.current?.sendPieceMove(pieceId, x, y);
  }, []);

  const sendPieceDrop = useCallback((pieceId: number, x: number, y: number) => {
    clientRef.current?.send({ type: 'piece_drop', pieceId, x, y });
  }, []);

  const sendShuffle = useCallback(() => {
    clientRef.current?.send({ type: 'shuffle' });
  }, []);

  const sendRestart = useCallback(() => {
    clientRef.current?.send({ type: 'restart' });
  }, []);

  const isHost = useMemo(
    () => snapshot?.hostId === playerId,
    [snapshot?.hostId, playerId]
  );

  const onServerMessage = useCallback(
    (handler: (snap: RoomSnapshot, prev: RoomSnapshot | null) => void) => {
      snapshotHandlersRef.current.add(handler);
      return () => snapshotHandlersRef.current.delete(handler);
    },
    []
  );

  const value = useMemo<RoomContextValue>(() => ({
    playerId, playerName, setPlayerName,
    roomId, snapshot, connectionStatus,
    players, locks,
    createRoom, joinRoom, leaveRoom,
    setConfig, startGame,
    sendPieceGrab, sendPieceMove, sendPieceDrop,
    sendShuffle, sendRestart,
    isHost,
    onServerMessage,
  }), [
    playerId, playerName, setPlayerName,
    roomId, snapshot, connectionStatus,
    players, locks,
    createRoom, joinRoom, leaveRoom,
    setConfig, startGame,
    sendPieceGrab, sendPieceMove, sendPieceDrop,
    sendShuffle, sendRestart,
    isHost,
    onServerMessage,
  ]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within RoomProvider');
  return ctx;
}
