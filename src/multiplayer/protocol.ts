// ─────────────────────────────────────────────────────────────────────────────
// Piecewise Multiplayer Protocol
// Shared between worker/src and src/multiplayer. Keep this file pure TS with
// no DOM or CF-specific imports so it can be bundled for both environments.
// ─────────────────────────────────────────────────────────────────────────────

// --------------- Primitive config (sent from frontend to DO) ─────────────────

export interface WirePuzzleConfig {
  imageId: string;
  imageSrc: string; // built-in SVG data URI OR R2 public URL
  rows: number;
  cols: number;
  pieceStyle: 'classic' | 'square';
  allowRotation: boolean;
  aspect: number; // width / height
  seed: number;
}

// --------------- Piece state stored + broadcast by the DO ────────────────────

export interface WirePiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  placed: boolean;
  zIndex: number;
  lockedBy: string | null; // playerId
}

// --------------- Player presence ─────────────────────────────────────────────

export interface PlayerInfo {
  id: string;
  name: string;
  color: string; // hex
  moves: number;
  joinedAt: number;
  isHost: boolean;
  online: boolean;
}

// --------------- Full room snapshot (sent on join) ───────────────────────────

export type RoomPhase = 'lobby' | 'playing' | 'complete';

export interface RoomSnapshot {
  roomId: string;
  phase: RoomPhase;
  hostId: string;
  config: WirePuzzleConfig | null;
  pieces: WirePiece[];
  players: PlayerInfo[];
  startedAt: number | null;
  completedAt: number | null;
  totalMoves: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT → SERVER messages
// ─────────────────────────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'join'; playerId: string; playerName: string }
  | { type: 'set_config'; config: WirePuzzleConfig }
  | { type: 'start_game' }
  | { type: 'piece_grab'; pieceId: number }
  | { type: 'piece_move'; pieceId: number; x: number; y: number }
  | { type: 'piece_drop'; pieceId: number; x: number; y: number }
  | { type: 'shuffle' }
  | { type: 'restart' }
  | { type: 'transfer_host'; toPlayerId: string }
  | { type: 'ping' };

// ─────────────────────────────────────────────────────────────────────────────
// SERVER → CLIENT messages
// ─────────────────────────────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'room_state'; snapshot: RoomSnapshot }
  | { type: 'player_joined'; player: PlayerInfo }
  | { type: 'player_left'; playerId: string; newHostId: string | null }
  | { type: 'player_online'; playerId: string; online: boolean }
  | { type: 'game_started'; config: WirePuzzleConfig; pieces: WirePiece[] }
  | { type: 'piece_grabbed'; pieceId: number; playerId: string; playerName: string; playerColor: string }
  | { type: 'piece_moved'; pieceId: number; x: number; y: number; playerId: string }
  | { type: 'piece_dropped'; pieceId: number; x: number; y: number; snapped: boolean; playerId: string }
  | { type: 'piece_lock_expired'; pieceId: number }
  | { type: 'board_shuffled'; pieces: WirePiece[] }
  | { type: 'game_restarted'; pieces: WirePiece[] }
  | { type: 'game_complete'; completedAt: number; totalMoves: number; players: PlayerInfo[] }
  | { type: 'host_changed'; newHostId: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function encodeMsg(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeMsg(raw: string): ServerMessage | ClientMessage | null {
  try {
    return JSON.parse(raw) as ServerMessage | ClientMessage;
  } catch {
    return null;
  }
}

/** 6-character uppercase alphanumeric room ID, easy to share verbally. */
export function makeRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit confusable chars
  let id = '';
  // Use crypto.getRandomValues if available (Worker env), else Math.random
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** Deterministic player color from a palette, assigned by join order index. */
const PLAYER_COLORS = [
  '#E8693A', '#1F6F6B', '#5B7CE0', '#E0A020',
  '#9D6BE0', '#2EA87A', '#E05B8A', '#5BA8E0',
];

export function playerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
