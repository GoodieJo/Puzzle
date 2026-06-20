/**
 * Piecewise Multiplayer Worker
 *
 * Architecture decisions:
 *  - Durable Objects (Room DO):  One DO per room. Holds all WebSocket
 *    connections + in-memory room state. Persists to DO Storage on
 *    structural changes (piece drop/snap, game start/restart).
 *    Provides strong serialization guarantees without a separate DB.
 *
 *  - R2:  Uploaded puzzle images. Stored once, served globally via Cache.
 *    Much cheaper than base64-in-DO-storage; supports images up to 5 GB.
 *
 *  - Workers KV:  Room metadata index (roomId → DO name). Allows fast
 *    "does this room exist?" checks without hitting the DO on every request.
 *    TTL-based auto-cleanup after 24 h of inactivity.
 *
 *  - D1:  NOT used initially. Would be added for user accounts & history.
 *
 * Request routing:
 *   POST /api/rooms                → create room
 *   GET  /api/rooms/:id           → room info
 *   POST /api/rooms/:id/upload    → upload image to R2
 *   GET  /api/rooms/:id/ws        → WebSocket upgrade → Room DO
 *   GET  /r2/:key                 → serve R2 image (cached)
 */

import { Room } from './room';

export { Room };

export interface Env {
  ROOM: DurableObjectNamespace;
  PUZZLE_IMAGES: R2Bucket;
  ROOM_INDEX: KVNamespace;
  CORS_ORIGIN: string; // e.g. "https://piecewise.pages.dev"
}

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data: unknown, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.CORS_ORIGIN || '*';

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const path = url.pathname;

    // ── R2 image serving ────────────────────────────────────────────────────
    if (path.startsWith('/r2/')) {
      const key = decodeURIComponent(path.slice(4));
      const cache = caches.default;
      const cacheKey = new Request(request.url);
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const obj = await env.PUZZLE_IMAGES.get(key);
      if (!obj) return new Response('Not found', { status: 404 });

      const resp = new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          ...cors(origin),
        },
      });
      await cache.put(cacheKey, resp.clone());
      return resp;
    }

    // ── Room creation ────────────────────────────────────────────────────────
    if (path === '/api/rooms' && request.method === 'POST') {
      const { makeRoomId } = await import('./protocol');
      let roomId = makeRoomId();
      // Ensure uniqueness (extremely rare collision)
      for (let i = 0; i < 3; i++) {
        const existing = await env.ROOM_INDEX.get(roomId);
        if (!existing) break;
        roomId = makeRoomId();
      }
      await env.ROOM_INDEX.put(roomId, JSON.stringify({ createdAt: Date.now() }), {
        expirationTtl: 60 * 60 * 24, // 24 h initial TTL; extended on activity
      });
      return json({ roomId }, 201, origin);
    }

    // ── Room info ────────────────────────────────────────────────────────────
    const roomMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{6})(\/.*)?$/);
    if (roomMatch) {
      const roomId = roomMatch[1];
      const subpath = roomMatch[2] ?? '';

      // Image upload
      if (subpath === '/upload' && request.method === 'POST') {
        const contentType = request.headers.get('content-type') ?? 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const key = `rooms/${roomId}/${Date.now()}.${ext}`;
        await env.PUZZLE_IMAGES.put(key, request.body, {
          httpMetadata: { contentType },
        });
        const imageUrl = `/r2/${encodeURIComponent(key)}`;
        return json({ imageUrl }, 200, origin);
      }

      // WebSocket upgrade → forward to DO
      if (subpath === '/ws') {
        const upgradeHeader = request.headers.get('upgrade');
        if (upgradeHeader !== 'websocket') {
          return new Response('Expected WebSocket upgrade', { status: 426 });
        }
        const doId = env.ROOM.idFromName(roomId);
        const stub = env.ROOM.get(doId);
        return stub.fetch(request);
      }

      // Room metadata
      if (request.method === 'GET') {
        const meta = await env.ROOM_INDEX.get(roomId);
        if (!meta) return json({ error: 'Room not found' }, 404, origin);
        // Refresh TTL on activity
        await env.ROOM_INDEX.put(roomId, meta, { expirationTtl: 60 * 60 * 24 });
        return json({ roomId, exists: true }, 200, origin);
      }
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
