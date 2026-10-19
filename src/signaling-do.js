// Durable Object — WebSocket signaling for a single session
// All host + client WS connections for a given session ID land here

export class SignallingDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.host = null;        // WebSocket of the screen host
    this.clients = new Set(); // Set of client WebSockets
  }

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [server, client] = pair;

      // Accept immediately
      server.accept();

      server.addEventListener('message', (event) => {
        this._handleMessage(server, event.data);
      });

      server.addEventListener('close', () => {
        this._cleanup(server);
      });

      server.addEventListener('error', (err) => {
        console.error('[DO] WS error', err);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // Non-WS: return session info
    return new Response(JSON.stringify({ 
      connected_clients: this.clients.size, 
      has_host: this.host !== null 
    }), { headers: { 'content-type': 'application/json' } });
  }

  _handleMessage(ws, rawData) {
    let msg;
    try { msg = JSON.parse(rawData); } catch { return; }

    const { type, sessionId, payload } = msg;

    if (type === 'join') {
      ws.sessionId = sessionId;
      ws.role = payload.role;

      if (payload.role === 'host') {
        this.host = ws;
      } else if (payload.role === 'client') {
        this.clients.add(ws);
        // Notify client
        ws.send(JSON.stringify({ type: 'joined' }));
        // Notify host
        if (this.host && this.host.readyState === 1) {
          this.host.send(JSON.stringify({ 
            type: 'client-joined', 
            count: this.clients.size 
          }));
        }
      }
      return;
    }

    // Relay SDP / ICE
    if (type === 'signal') {
      if (ws.role === 'host' && this.host) {
        this.clients.forEach(c => {
          if (c.readyState === 1) {
            c.send(JSON.stringify({ type: 'signal', payload }));
          }
        });
      } else if (ws.role === 'client') {
        if (this.host && this.host.readyState === 1) {
          this.host.send(JSON.stringify({ type: 'signal', payload }));
        }
      }
    }

    // Relay input (mouse / keyboard / touch) from client to host
    if (type === 'input') {
      if (ws.role === 'client' && this.host && this.host.readyState === 1) {
        this.host.send(JSON.stringify({ type: 'input', payload }));
      }
    }

    // Handle offer from host when client just joined
    // (Host sends offer via WebRTC negotiation, but client may have joined late)
    // The offer/answer flow is handled through the signal relay above.
  }

  _cleanup(ws) {
    const { sessionId, role } = ws;
    if (role === 'host') {
      this.host = null;
      // Notify all clients
      this.clients.forEach(c => {
        if (c.readyState === 1) {
          c.send(JSON.stringify({ type: 'host-disconnected' }));
          c.close();
        }
      });
      this.clients.clear();
    } else if (role === 'client') {
      this.clients.delete(ws);
      if (this.host && this.host.readyState === 1) {
        this.host.send(JSON.stringify({ 
          type: 'client-left', 
          count: this.clients.size 
        }));
      }
    }
  }

  async Alarm() {}
}
