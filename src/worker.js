// Cloudflare Worker entry point
// Serves static files + routes WebSocket signaling to Durable Object

// Import static assets — bundled at deploy time
import indexHTML from '../public/index.html?raw';
import hostHTML from '../public/host.html?raw';
import clientHTML from '../public/client.html?raw';
import appJS from '../public/app.js?raw';

// Re-export Durable Object class
export { SignallingDO } from './signaling-do.js';

const CACHE_TTL = 86400; // 1 day

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ─── WebSocket signaling → Durable Object ──────────────────
    if (pathname === '/signal' || pathname === '/signal/') {
      const sessionId = url.searchParams.get('session');
      if (!sessionId) {
        return new Response('Missing ?session=<ID>', { status: 400 });
      }
      // Route to DO by session ID — same session → same DO instance
      const id = env.SIGNALLING_DO.idFromName(sessionId);
      const stub = env.SIGNALLING_DO.get(id);
      return stub.fetch(request);
    }

    // ─── Static files ───────────────────────────────────────────
    // Add security + CORS headers for mobile/web access
    const headers = {
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-frame-options': 'DENY',
      'permissions-policy': 'geolocation=(), microphone=(), camera=()',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'access-control-allow-origin': '*',
    };

    if (pathname === '/' || pathname === '/index.html') {
      return new Response(indexHTML, {
        headers: { ...headers, 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (pathname === '/host.html') {
      return new Response(hostHTML, {
        headers: { ...headers, 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (pathname === '/client.html') {
      return new Response(clientHTML, {
        headers: { ...headers, 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (pathname === '/app.js') {
      return new Response(appJS, {
        headers: { ...headers, 'content-type': 'application/javascript; charset=utf-8', 'cache-control': `public, max-age=${CACHE_TTL}` }
      });
    }

    return new Response('Not found', { status: 404, headers });
  },
};
