/**
 * Room Durable Object
 *
 * One instance per room. Lifecycle:
 *   lobby  → host sets config  → playing  → all pieces placed  → complete
 *
 * State persistence strategy:
 *   - In-memory: all state while the DO is running (fast, zero cost)
 *   - DO Storage: written on structural events (piece drop/snap, start,
 *     restart, player join/leave, host change).  NOT written on every
 *     piece_move (would be hundreds of writes/second).
 *   - DO alarm: set to 30 s whenever locks exist; expires stale locks
 *     if a client disconnects without sending piece_drop.
 *
 * Concurrency: Durable Objects are single-threaded. No mutex needed.
 */

import type {
  ClientMessage,
  ServerMessage,
  WirePiece,
  WirePuzzleConfig,
  PlayerInfo,
  RoomSnapshot,
  RoomPhase,
} from './protocol';
import { playerColor, encodeMsg, decodeMsg } from './protocol';

const LOCK_EXPIRE_MS = 20_000; // auto-release locks after 20 s
const ROOM_IDLE_CLEANUP_MS = 1000 * 60 * 60 * 2; // delete DO state after 2 h idle

interface PieceLock {
  playerId: string;
  since: number;
}

interface InternalRoomState {
  roomId: string;
  phase: RoomPhase;
  hostId: string;
  config: WirePuzzleConfig | null;
  pieces: WirePiece[];
  locks: Record<number, PieceLock>;
  players: Map<string, PlayerInfo>;
  startedAt: number | null;
  completedAt: number | null;
  totalMoves: number;
  lastActivity: number;
}

type WebSocketSession = {
  ws: WebSocket;
  playerId: string;
};

export class Room {
  private state: DurableObjectState;
  private room: InternalRoomState | null = null;
  private sessions: Map<string, WebSocketSession> = new Map(); // playerId → session

  constructor(state: DurableObjectState) {
    this.state = state;
    // blockConcurrencyWhile ensures init finishes before any requests are handled
    this.state.blockConcurrencyWhile(async () => {
      await this.loadState();
    });
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private async loadState() {
    const stored = await this.state.storage.get<Omit<InternalRoomState, 'players' | 'locks'> & {
      players: PlayerInfo[];
      locks: Record<number, PieceLock>;
    }>('room');
    if (stored) {
      this.room = {
        ...stored,
        players: new Map(stored.players.map((p) => [p.id, p])),
        locks: stored.locks ?? {},
      };
    }
  }

  private async saveState() {
    if (!this.room) return;
    this.room.lastActivity = Date.now();
    const serializable = {
      ...this.room,
      players: [...this.room.players.values()],
    };
    await this.state.storage.put('room', serializable);
    // Reset idle alarm
    await this.state.storage.setAlarm(Date.now() + ROOM_IDLE_CLEANUP_MS);
  }

  private async scheduleLockAlarm() {
    // Only set alarm if there are active locks; expires in LOCK_EXPIRE_MS
    if (this.room && Object.keys(this.room.locks).length > 0) {
      await this.state.storage.setAlarm(Date.now() + LOCK_EXPIRE_MS);
    }
  }

  async alarm() {
    if (!this.room) return;

    const now = Date.now();

    // Expire stale locks
    let locksChanged = false;
    for (const [idStr, lock] of Object.entries(this.room.locks)) {
      if (now - lock.since > LOCK_EXPIRE_MS) {
        const pieceId = Number(idStr);
        delete this.room.locks[pieceId];
        this.broadcast({ type: 'piece_lock_expired', pieceId });
        locksChanged = true;
      }
    }
    if (locksChanged) await this.saveState();

    // Idle cleanup: delete all state if room has been inactive
    if (now - this.room.lastActivity > ROOM_IDLE_CLEANUP_MS) {
      await this.state.storage.deleteAll();
      this.room = null;
    }
  }

  // ── HTTP / WebSocket entry point ───────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── WebSocket handlers (Hibernation API) ──────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const msg = decodeMsg(raw) as ClientMessage | null;
    if (!msg) return;

    // Extract playerId from session tag (set on open)
    const playerId = (ws as unknown as { _playerId?: string })._playerId;
    if (!playerId && msg.type !== 'join') return;

    try {
      await this.handleMessage(ws, msg, playerId ?? '');
    } catch (err) {
      this.send(ws, { type: 'error', code: 'INTERNAL', message: String(err) });
    }
  }

  async webSocketOpen(ws: WebSocket) {
    // playerId is set in the 'join' message, not the URL (avoids URL logging)
    (ws as unknown as { _playerId?: string })._playerId = undefined;
  }

  async webSocketClose(ws: WebSocket) {
    const playerId = (ws as unknown as { _playerId?: string })._playerId;
    if (playerId) await this.handleDisconnect(playerId);
  }

  async webSocketError(ws: WebSocket) {
    const playerId = (ws as unknown as { _playerId?: string })._playerId;
    if (playerId) await this.handleDisconnect(playerId);
  }

  // ── Message dispatch ───────────────────────────────────────────────────────

  private async handleMessage(ws: WebSocket, msg: ClientMessage, senderId: string) {
    switch (msg.type) {
      case 'join':
        return this.handleJoin(ws, msg.playerId, msg.playerName);
      case 'ping':
        return this.send(ws, { type: 'pong' });
      case 'set_config':
        return this.handleSetConfig(senderId, msg.config);
      case 'start_game':
        return this.handleStartGame(senderId);
      case 'piece_grab':
        return this.handlePieceGrab(senderId, msg.pieceId);
      case 'piece_move':
        return this.handlePieceMove(senderId, msg.pieceId, msg.x, msg.y);
      case 'piece_drop':
        return this.handlePieceDrop(senderId, msg.pieceId, msg.x, msg.y);
      case 'shuffle':
        return this.handleShuffle(senderId);
      case 'restart':
        return this.handleRestart(senderId);
      case 'transfer_host':
        return this.handleTransferHost(senderId, msg.toPlayerId);
    }
  }

  private async handleJoin(ws: WebSocket, playerId: string, playerName: string) {
    // Attach playerId to the WebSocket object for later reference
    (ws as unknown as { _playerId: string })._playerId = playerId;
    this.sessions.set(playerId, { ws, playerId });

    // Initialize room on first join
    if (!this.room) {
      this.room = {
        roomId: crypto.randomUUID().slice(0, 8), // internal ID; actual room code is in the DO name
        phase: 'lobby',
        hostId: playerId,
        config: null,
        pieces: [],
        locks: {},
        players: new Map(),
        startedAt: null,
        completedAt: null,
        totalMoves: 0,
        lastActivity: Date.now(),
      };
    }

    const existingPlayer = this.room.players.get(playerId);
    const colorIndex = existingPlayer
      ? [...this.room.players.keys()].indexOf(playerId)
      : this.room.players.size;

    const player: PlayerInfo = {
      id: playerId,
      name: playerName,
      color: playerColor(colorIndex),
      moves: existingPlayer?.moves ?? 0,
      joinedAt: existingPlayer?.joinedAt ?? Date.now(),
      isHost: this.room.hostId === playerId,
      online: true,
    };
    this.room.players.set(playerId, player);

    // Send full room state to the joining player
    this.send(ws, { type: 'room_state', snapshot: this.makeSnapshot() });

    // Notify others
    if (!existingPlayer) {
      this.broadcastExcept(playerId, { type: 'player_joined', player });
    } else {
      this.broadcastExcept(playerId, { type: 'player_online', playerId, online: true });
    }

    await this.saveState();
  }

  private async handleDisconnect(playerId: string) {
    this.sessions.delete(playerId);
    if (!this.room) return;

    // Release any locks held by this player
    for (const [idStr, lock] of Object.entries(this.room.locks)) {
      if (lock.playerId === playerId) {
        const pieceId = Number(idStr);
        delete this.room.locks[pieceId];
        this.broadcast({ type: 'piece_lock_expired', pieceId });
      }
    }

    // Mark offline rather than removing (keeps contribution stats)
    const player = this.room.players.get(playerId);
    if (player) {
      player.online = false;
      this.room.players.set(playerId, player);
    }

    this.broadcast({ type: 'player_online', playerId, online: false });

    // Transfer host if host left
    if (this.room.hostId === playerId) {
      const nextHost = [...this.room.players.values()].find((p) => p.id !== playerId && p.online);
      if (nextHost) {
        this.room.hostId = nextHost.id;
        nextHost.isHost = true;
        this.room.players.set(nextHost.id, nextHost);
        this.broadcast({ type: 'host_changed', newHostId: nextHost.id });
      }
    }

    await this.saveState();
  }

  private handleSetConfig(senderId: string, config: WirePuzzleConfig) {
    if (!this.room || this.room.hostId !== senderId) return;
    if (this.room.phase !== 'lobby') return;
    this.room.config = config;
    // Don't broadcast yet; host will call start_game when ready
  }

  private async handleStartGame(senderId: string) {
    if (!this.room || this.room.hostId !== senderId) return;
    if (!this.room.config) {
      const ws = this.sessions.get(senderId)?.ws;
      if (ws) this.send(ws, { type: 'error', code: 'NO_CONFIG', message: 'Set image and difficulty first' });
      return;
    }

    this.room.phase = 'playing';
    this.room.pieces = this.generateInitialPieces(this.room.config);
    this.room.startedAt = Date.now();
    this.room.totalMoves = 0;

    this.broadcast({ type: 'game_started', config: this.room.config, pieces: this.room.pieces });
    await this.saveState();
  }

  private handlePieceGrab(senderId: string, pieceId: number) {
    if (!this.room || this.room.phase !== 'playing') return;

    // Reject if already locked by someone else
    const existing = this.room.locks[pieceId];
    if (existing && existing.playerId !== senderId) return;

    const piece = this.room.pieces.find((p) => p.id === pieceId);
    if (!piece || piece.placed) return;

    this.room.locks[pieceId] = { playerId: senderId, since: Date.now() };

    // Bring to top
    const maxZ = Math.max(0, ...this.room.pieces.map((p) => p.zIndex));
    piece.zIndex = maxZ + 1;

    const player = this.room.players.get(senderId);
    this.broadcast({
      type: 'piece_grabbed',
      pieceId,
      playerId: senderId,
      playerName: player?.name ?? 'Unknown',
      playerColor: player?.color ?? '#888',
    });

    this.scheduleLockAlarm();
  }

  private handlePieceMove(senderId: string, pieceId: number, x: number, y: number) {
    if (!this.room || this.room.phase !== 'playing') return;

    const lock = this.room.locks[pieceId];
    if (!lock || lock.playerId !== senderId) return;

    // Update in-memory position (not persisted until drop)
    const piece = this.room.pieces.find((p) => p.id === pieceId);
    if (piece) {
      piece.x = x;
      piece.y = y;
    }

    // Relay to all OTHER clients; sender already shows optimistic position
    this.broadcastExcept(senderId, { type: 'piece_moved', pieceId, x, y, playerId: senderId });
  }

  private async handlePieceDrop(senderId: string, pieceId: number, x: number, y: number) {
    if (!this.room || this.room.phase !== 'playing') return;

    const lock = this.room.locks[pieceId];
    if (!lock || lock.playerId !== senderId) return;

    delete this.room.locks[pieceId];

    const piece = this.room.pieces.find((p) => p.id === pieceId);
    if (!piece) return;

    piece.x = x;
    piece.y = y;

    // Check snap (same threshold as frontend: 38% of cell size)
    const snapped = this.checkSnap(piece, x, y);
    if (snapped) {
      piece.placed = true;
      piece.zIndex = 0;
    }

    // Increment move count
    const player = this.room.players.get(senderId);
    if (player) {
      player.moves += 1;
      this.room.players.set(senderId, player);
    }
    this.room.totalMoves += 1;

    this.broadcast({ type: 'piece_dropped', pieceId, x: piece.x, y: piece.y, snapped, playerId: senderId });

    // Check completion
    if (this.room.pieces.every((p) => p.placed)) {
      this.room.phase = 'complete';
      this.room.completedAt = Date.now();
      this.broadcast({
        type: 'game_complete',
        completedAt: this.room.completedAt,
        totalMoves: this.room.totalMoves,
        players: [...this.room.players.values()],
      });
    }

    await this.saveState();
  }

  private async handleShuffle(senderId: string) {
    if (!this.room || this.room.hostId !== senderId) return;
    if (this.room.phase !== 'playing') return;

    const config = this.room.config!;
    const seed = Date.now();
    let rand = mulberry32(seed);

    for (const piece of this.room.pieces) {
      if (piece.placed) continue;
      const bounds = this.scatterBounds(config);
      piece.x = bounds.x + rand() * (bounds.w - this.cellW(config));
      piece.y = bounds.y + rand() * (bounds.h - this.cellH(config));
    }
    this.room.locks = {};

    this.broadcast({ type: 'board_shuffled', pieces: this.room.pieces });
    await this.saveState();
  }

  private async handleRestart(senderId: string) {
    if (!this.room || this.room.hostId !== senderId) return;
    if (!this.room.config) return;

    this.room.phase = 'playing';
    this.room.pieces = this.generateInitialPieces(this.room.config);
    this.room.locks = {};
    this.room.startedAt = Date.now();
    this.room.completedAt = null;
    this.room.totalMoves = 0;
    for (const player of this.room.players.values()) {
      player.moves = 0;
    }

    this.broadcast({ type: 'game_restarted', pieces: this.room.pieces });
    await this.saveState();
  }

  private async handleTransferHost(senderId: string, toPlayerId: string) {
    if (!this.room || this.room.hostId !== senderId) return;
    const target = this.room.players.get(toPlayerId);
    if (!target) return;

    const prev = this.room.players.get(senderId);
    if (prev) { prev.isHost = false; this.room.players.set(senderId, prev); }
    target.isHost = true;
    this.room.players.set(toPlayerId, target);
    this.room.hostId = toPlayerId;

    this.broadcast({ type: 'host_changed', newHostId: toPlayerId });
    await this.saveState();
  }

  // ── Puzzle generation helpers ──────────────────────────────────────────────

  private cellW(config: WirePuzzleConfig) {
    return 1000 / config.cols;
  }
  private cellH(config: WirePuzzleConfig) {
    return (1000 / config.aspect) / config.rows;
  }

  private scatterBounds(config: WirePuzzleConfig) {
    const cW = this.cellW(config);
    const cH = this.cellH(config);
    const boardW = 1000;
    const boardH = 1000 / config.aspect;
    const count = config.rows * config.cols;
    const cellMax = Math.max(cW, cH);
    const margin = cellMax * Math.ceil(Math.sqrt(count)) * 0.62;
    return {
      x: -margin,
      y: -margin * 0.6,
      w: boardW + margin * 2,
      h: boardH + margin * 1.6,
    };
  }

  private generateInitialPieces(config: WirePuzzleConfig): WirePiece[] {
    const cW = this.cellW(config);
    const cH = this.cellH(config);
    const bounds = this.scatterBounds(config);
    let rand = mulberry32(config.seed + 7919);

    const pieces: WirePiece[] = [];
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const id = r * config.cols + c;
        let x: number, y: number;
        let attempts = 0;
        do {
          x = bounds.x + rand() * (bounds.w - cW);
          y = bounds.y + rand() * (bounds.h - cH);
          attempts++;
        } while (
          attempts < 6 &&
          x + cW > 0 && x < 1000 &&
          y + cH > 0 && y < 1000 / config.aspect
        );
        pieces.push({
          id,
          x,
          y,
          rotation: 0,
          placed: false,
          zIndex: id + 1,
          lockedBy: null,
        });
      }
    }
    return pieces;
  }

  private checkSnap(piece: WirePiece, x: number, y: number): boolean {
    if (!this.room?.config) return false;
    const cW = this.cellW(this.room.config);
    const cH = this.cellH(this.room.config);
    // Derive home position from piece id
    const col = piece.id % this.room.config.cols;
    const row = Math.floor(piece.id / this.room.config.cols);
    const homeX = col * cW;
    const homeY = row * cH;
    const dist = Math.hypot(x - homeX, y - homeY);
    const snapDist = Math.min(cW, cH) * 0.38;
    if (dist < snapDist) {
      piece.x = homeX;
      piece.y = homeY;
      return true;
    }
    return false;
  }

  // ── Snapshot & broadcast helpers ───────────────────────────────────────────

  private makeSnapshot(): RoomSnapshot {
    const r = this.room!;
    return {
      roomId: r.roomId,
      phase: r.phase,
      hostId: r.hostId,
      config: r.config,
      pieces: r.pieces.map((p) => ({
        ...p,
        lockedBy: r.locks[p.id]?.playerId ?? null,
      })),
      players: [...r.players.values()],
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      totalMoves: r.totalMoves,
    };
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(encodeMsg(msg));
    } catch {
      // Client disconnected mid-send; ignore
    }
  }

  private broadcast(msg: ServerMessage) {
    for (const session of this.sessions.values()) {
      this.send(session.ws, msg);
    }
  }

  private broadcastExcept(excludeId: string, msg: ServerMessage) {
    for (const [id, session] of this.sessions.entries()) {
      if (id !== excludeId) this.send(session.ws, msg);
    }
  }
}

// ── Inline mulberry32 (no import needed in Worker) ────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
