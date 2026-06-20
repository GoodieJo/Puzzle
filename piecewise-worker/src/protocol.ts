// Self-contained protocol — copy of src/multiplayer/protocol.ts
// Kept here so the worker folder is fully independent of the frontend tree.

export type EdgeShape = 'flat' | 'tab' | 'blank';
export type PieceStyle = 'classic' | 'square';
export type RoomPhase = 'lobby' | 'playing' | 'complete';

export interface WirePuzzleConfig {
  imageId: string;
  imageSrc: string;
  rows: number;
  cols: number;
  pieceStyle: PieceStyle;
  allowRotation: boolean;
  aspect: number;
  seed: number;
}

export interface WirePiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  placed: boolean;
  zIndex: number;
  lockedBy: string | null;
}

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  moves: number;
  joinedAt: number;
  isHost: boolean;
  online: boolean;
}

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

export function encodeMsg(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeMsg(raw: string): ServerMessage | ClientMessage | null {
  try { return JSON.parse(raw) as ServerMessage | ClientMessage; }
  catch { return null; }
}

export function makeRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const PLAYER_COLORS = [
  '#E8693A', '#1F6F6B', '#5B7CE0', '#E0A020',
  '#9D6BE0', '#2EA87A', '#E05B8A', '#5BA8E0',
];

export function playerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
