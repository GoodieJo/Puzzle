# Piecewise Multiplayer — Architecture & Deployment Guide

## Architecture decisions

### Why Durable Objects (not D1/KV for real-time state)?
Each room is one Durable Object instance. The DO:
- Holds **all WebSocket connections** for that room in a single JS context
- Broadcasts events synchronously — no polling, no race conditions
- Persists to **DO Storage** on structural events (piece drop, game start), NOT on every piece_move (that would be hundreds of writes/second at $0.20/million)
- Has built-in **alarm API** for lock expiry and idle cleanup
- Provides strong serialization — no concurrent-write conflicts possible
- Auto-hibernates when the room has no active connections (zero cost when idle)

### Why R2 (not base64 in DO Storage)?
DO Storage values are max 128KB. A compressed puzzle image is 100–500KB. R2:
- Stores images cheaply ($0.015/GB/month)
- Serves via Cloudflare's global CDN with `Cache-Control: immutable`
- Zero egress fees between R2 and Workers

### Why KV (for room index)?
Fast "does this room exist?" check without touching the DO (which cold-starts). KV:
- Global eventual consistency is fine for this use case (just a boolean existence check)
- Auto-TTL cleans up stale room entries after 24 hours

### Why NOT D1?
D1 is great for relational data and user accounts. For real-time room state it would require polling or complex change-detection. Added as a future-proofing note for when user accounts and history are added.

## WebSocket message flow

```
Client A grabs piece:
  A → Worker: { type: "piece_grab", pieceId: 42 }
  Worker → A, B, C: { type: "piece_grabbed", pieceId: 42, playerId: "...", playerName: "Raj" }

Client A moves piece (throttled to ~25/s on client):
  A → Worker: { type: "piece_move", pieceId: 42, x: 400, y: 300 }
  Worker → B, C only: { type: "piece_moved", pieceId: 42, x: 400, y: 300, playerId: "..." }
  (A already shows local optimistic position)

Client A drops piece:
  A → Worker: { type: "piece_drop", pieceId: 42, x: 405, y: 296 }
  Worker checks snap (same threshold as frontend)
  Worker → A, B, C: { type: "piece_dropped", pieceId: 42, x: 0, y: 0, snapped: true, playerId: "..." }
  Worker saves updated piece state to DO Storage
```

## Local development

### Prerequisites
- Node 18+
- Wrangler CLI: `npm i -g wrangler`
- Cloudflare account (free tier works)

### 1. Set up the Worker
```bash
cd worker
npm install

# Create KV namespace (one-time)
wrangler kv:namespace create ROOM_INDEX
# Copy the `id` from the output into worker/wrangler.toml → kv_namespaces[0].id

# Create R2 bucket (one-time)
wrangler r2 bucket create piecewise-puzzle-images

# Start local Worker (with local KV/R2/DO)
npm run dev
# → Worker listening on http://localhost:8787
```

### 2. Start the frontend
```bash
# In the project root (not worker/)
cp .env.example .env.local
# .env.local already contains: VITE_WORKER_URL=http://localhost:8787
npm install
npm run dev
# → Frontend at http://localhost:5173
```

The Vite dev server proxies `/api/*` and `/r2/*` to `localhost:8787`, so WebSocket
upgrades also work via the same port.

### Testing locally
Open two browser tabs to `http://localhost:5173`.
- Click "Play with friends" → "Create a room" in tab 1.
- Copy the room code, open tab 2, enter the code, join.
- Both tabs should see each other's piece movements in real time.

## Production deployment

### 1. Deploy the Worker
```bash
cd worker

# Edit wrangler.toml:
#  - Set CORS_ORIGIN to your Pages URL: "https://piecewise.pages.dev"
#  - Fill in the real kv_namespaces[0].id from `wrangler kv:namespace list`

wrangler deploy
# → https://piecewise-api.YOUR-SUBDOMAIN.workers.dev
```

### 2. Deploy the frontend to Cloudflare Pages
```bash
# In project root
# Set build environment variable in Pages dashboard:
#   VITE_WORKER_URL = https://piecewise-api.YOUR-SUBDOMAIN.workers.dev

npm run build
# Upload dist/ to Cloudflare Pages, or use:
npx wrangler pages deploy dist --project-name piecewise
```

### 3. Pages routing (SPA fallback)
Create `public/_redirects`:
```
/room/*  /index.html  200
/*       /index.html  200
```
This ensures `/room/ABC123` deep links work on refresh.

### 4. Custom domain (optional)
In Cloudflare Pages → Custom domains → add `piecewise.yourdomain.com`.
Update `CORS_ORIGIN` in `worker/wrangler.toml` to match, then `wrangler deploy` again.

## Migration from single-player

The multiplayer layer is purely additive. Existing solo-play functionality is
unchanged — the "Play with friends" button is the only new entry point.

- Solo flow: Home → (upload) → Difficulty → Workspace (local engine, localStorage save)
- Multiplayer flow: Home → Lobby → Room Setup → Workspace (server-authoritative engine, DO persistence)

In Workspace, the `isMultiplayer` flag (derived from `room.roomId && room.snapshot`)
switches between local and server state seamlessly. The canvas, toolbar, and
completion screen are shared between both modes.

## Future features roadmap

| Feature | Cloudflare service needed |
|---|---|
| User accounts / auth | Workers + D1 + KV (sessions) |
| Puzzle history | D1 |
| Public room browser | D1 + Workers |
| Daily challenge | Workers Cron + D1 |
| Leaderboards | D1 |
| Spectator mode | DO (read-only WebSocket connections, already supported) |
| Voice chat | Workers + Calls (WebRTC) |
| Race mode | DO (add phase + per-player timer) |
