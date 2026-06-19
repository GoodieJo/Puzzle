import type { ClientMessage, ServerMessage } from './protocol';
import { encodeMsg, decodeMsg } from './protocol';

export type MessageHandler = (msg: ServerMessage) => void;

interface MultiplayerClientOptions {
  workerBaseUrl: string; // e.g. "https://piecewise-api.your-subdomain.workers.dev"
  onMessage: MessageHandler;
  onConnect: () => void;
  onDisconnect: () => void;
}

const PING_INTERVAL_MS = 25_000;
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];
const MOVE_THROTTLE_MS = 40; // ~25 piece_move events per second

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private roomId: string | null = null;
  private playerId: string | null = null;
  private playerName: string | null = null;
  private opts: MultiplayerClientOptions;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastMoveTime = 0;
  private pendingMove: { pieceId: number; x: number; y: number } | null = null;
  private moveRafId = 0;
  private dead = false; // set to true on deliberate disconnect

  constructor(opts: MultiplayerClientOptions) {
    this.opts = opts;
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  connect(roomId: string, playerId: string, playerName: string) {
    this.dead = false;
    this.roomId = roomId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.openSocket();
  }

  disconnect() {
    this.dead = true;
    this.clearTimers();
    this.ws?.close(1000, 'deliberate');
    this.ws = null;
  }

  private openSocket() {
    if (!this.roomId) return;
    const wsUrl = this.opts.workerBaseUrl
      .replace(/^http/, 'ws')
      .replace(/\/$/, '');
    const url = `${wsUrl}/api/rooms/${this.roomId}/ws`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startPing();
      // Immediately announce ourselves
      this.sendRaw({ type: 'join', playerId: this.playerId!, playerName: this.playerName! });
      this.opts.onConnect();
    };

    ws.onmessage = (e) => {
      const msg = decodeMsg(e.data as string) as ServerMessage | null;
      if (msg) this.opts.onMessage(msg);
    };

    ws.onclose = (e) => {
      this.clearTimers();
      this.ws = null;
      this.opts.onDisconnect();
      if (!this.dead && e.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror, so reconnect logic is centralized there
    };
  }

  private scheduleReconnect() {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => this.openSocket(), delay);
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendRaw({ type: 'ping' });
      }
    }, PING_INTERVAL_MS);
  }

  private clearTimers() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
    if (this.moveRafId) { cancelAnimationFrame(this.moveRafId); this.moveRafId = 0; }
  }

  // ── Message sending ────────────────────────────────────────────────────────

  private sendRaw(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMsg(msg));
    }
  }

  send(msg: ClientMessage) {
    this.sendRaw(msg);
  }

  /**
   * Throttled piece move: coalesces rapid moves so we send at most ~25/s.
   * The local canvas renders at 60 fps (optimistic) regardless.
   */
  sendPieceMove(pieceId: number, x: number, y: number) {
    this.pendingMove = { pieceId, x, y };
    const now = performance.now();
    if (now - this.lastMoveTime >= MOVE_THROTTLE_MS) {
      this.flushMove();
    } else if (!this.moveRafId) {
      this.moveRafId = requestAnimationFrame(() => {
        this.moveRafId = 0;
        this.flushMove();
      });
    }
  }

  private flushMove() {
    if (!this.pendingMove) return;
    const { pieceId, x, y } = this.pendingMove;
    this.pendingMove = null;
    this.lastMoveTime = performance.now();
    this.sendRaw({ type: 'piece_move', pieceId, x, y });
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentRoomId(): string | null {
    return this.roomId;
  }
}
