import type { PuzzleEngine } from '../engine/PuzzleEngine';
import type { ServerMessage, WirePiece, PlayerInfo } from './protocol';

/** Overlay data for a single piece being moved by another player. */
export interface RemoteLock {
  playerId: string;
  playerName: string;
  playerColor: string;
  x: number;
  y: number;
}

/**
 * Applies a server-pushed event to the local engine and returns any side-effect
 * data that the canvas/UI needs (lock overlays, player info, completion flag).
 */
export interface SyncResult {
  playersChanged?: boolean;
  locksChanged?: boolean;
  piecesChanged?: boolean;
  complete?: boolean;
}

export function applyServerEvent(
  msg: ServerMessage,
  engine: PuzzleEngine,
  locks: Map<number, RemoteLock>,
  localPlayerId: string,
): SyncResult {
  switch (msg.type) {
    case 'piece_grabbed': {
      if (msg.playerId === localPlayerId) break; // we handle our own drags
      locks.set(msg.pieceId, {
        playerId: msg.playerId,
        playerName: msg.playerName,
        playerColor: msg.playerColor,
        x: 0,
        y: 0,
      });
      return { locksChanged: true };
    }

    case 'piece_moved': {
      if (msg.playerId === localPlayerId) break;
      const piece = engine.pieces.find((p) => p.id === msg.pieceId);
      if (piece && !piece.placed) {
        piece.x = msg.x;
        piece.y = msg.y;
        const lock = locks.get(msg.pieceId);
        if (lock) { lock.x = msg.x; lock.y = msg.y; }
      }
      return { piecesChanged: true, locksChanged: true };
    }

    case 'piece_dropped': {
      if (msg.playerId === localPlayerId) break;
      const piece = engine.pieces.find((p) => p.id === msg.pieceId);
      if (piece) {
        piece.x = msg.x;
        piece.y = msg.y;
        if (msg.snapped) {
          piece.x = piece.homeX;
          piece.y = piece.homeY;
          piece.placed = true;
          piece.zIndex = 0;
        }
      }
      locks.delete(msg.pieceId);
      return { piecesChanged: true, locksChanged: true, complete: msg.snapped && engine.isComplete() };
    }

    case 'piece_lock_expired': {
      locks.delete(msg.pieceId);
      return { locksChanged: true };
    }

    case 'board_shuffled':
    case 'game_restarted': {
      applyWirePieces(msg.pieces, engine);
      locks.clear();
      return { piecesChanged: true, locksChanged: true };
    }

    default:
      break;
  }
  return {};
}

/**
 * Hydrates the local engine's piece positions from the server's authoritative
 * WirePiece list (called on game_started or after joining a room mid-game).
 */
export function applyWirePieces(wirePieces: WirePiece[], engine: PuzzleEngine) {
  for (const wp of wirePieces) {
    const piece = engine.pieces.find((p) => p.id === wp.id);
    if (piece) {
      piece.x = wp.x;
      piece.y = wp.y;
      piece.rotation = wp.rotation;
      piece.placed = wp.placed;
      piece.zIndex = wp.zIndex;
    }
  }
}

/** Sort players: host first, then by moves desc, then online-first. */
export function sortPlayers(players: PlayerInfo[]): PlayerInfo[] {
  return [...players].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    if (a.online !== b.online) return a.online ? -1 : 1;
    return b.moves - a.moves;
  });
}
