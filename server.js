const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active sessions
const sessions = new Map();

wss.on('connection', (ws, req) => {
  // Parse session ID from URL query: /signal?session=ABC123
  const url = new URL(req.url, 'http://' + req.headers.host);
  ws.sessionId = url.searchParams.get('session');
  // Keep role assignment via 'join' message (for backward compat)

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    const { type, sessionId, payload } = msg;

    if (type === 'join') {
      // Use session ID from URL if available, fallback to message
      if (!ws.sessionId) ws.sessionId = sessionId;
      ws.role = payload.role;
      const existing = sessions.get(ws.sessionId);

      if (ws.role === 'host') {
        sessions.set(ws.sessionId, { host: ws, clients: new Set() });
        ws.send(JSON.stringify({ type: 'session-created', sessionId: ws.sessionId }));
      } else if (ws.role === 'client') {
        const session = sessions.get(ws.sessionId);
        if (session) {
          session.clients.add(ws);
          ws.send(JSON.stringify({ type: 'joined' }));
          // Notify host that a client joined
          session.host.send(JSON.stringify({ type: 'client-joined', count: session.clients.size }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
        }
      }
      return;
    }

    // Use ws.sessionId from URL for routing
    const activeSessionId = ws.sessionId;
    if (!activeSessionId) return;

    // Relay signaling messages
    if (type === 'signal') {
      const session = sessions.get(activeSessionId);
      if (!session) return;

      if (ws.role === 'host') {
        // Host sends to all clients
        session.clients.forEach(c => {
          if (c.readyState === c.OPEN) c.send(JSON.stringify({ type: 'signal', payload }));
        });
      } else if (ws.role === 'client') {
        // Client sends to host
        if (session.host.readyState === session.host.OPEN) {
          session.host.send(JSON.stringify({ type: 'signal', payload }));
        }
      }
    }

    // Relay input events from client to host
    if (type === 'input') {
      const session = sessions.get(activeSessionId);
      if (!session) return;
      if (session.host.readyState === session.host.OPEN) {
        session.host.send(JSON.stringify({ type: 'input', payload }));
      }
    }
  });

  ws.on('close', () => {
    const { sessionId, role } = ws;
    if (!sessionId || !role) return;
    const session = sessions.get(sessionId);
    if (!session) return;

    if (role === 'host') {
      // Host disconnected — notify all clients to end session
      session.clients.forEach(c => {
        if (c.readyState === c.OPEN) {
          c.send(JSON.stringify({ type: 'host-disconnected' }));
          c.close();
        }
      });
      sessions.delete(sessionId);
    } else if (role === 'client') {
      session.clients.delete(ws);
      if (session.host.readyState === session.host.OPEN) {
        session.host.send(JSON.stringify({ type: 'client-left', count: session.clients.size }));
      }
      // If no clients left, keep host alive (waiting for new clients)
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`AnyDesk Clone server running on port ${PORT}`);
  console.log(`No free plan timeout — connections stay alive indefinitely.`);
});
