var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/signaling-do.js
var SignallingDO = class {
  static {
    __name(this, "SignallingDO");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.host = null;
    this.clients = /* @__PURE__ */ new Set();
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [server, client] = pair;
      server.accept();
      server.addEventListener("message", (event) => {
        this._handleMessage(server, event.data);
      });
      server.addEventListener("close", () => {
        this._cleanup(server);
      });
      server.addEventListener("error", (err) => {
        console.error("[DO] WS error", err);
      });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response(JSON.stringify({
      connected_clients: this.clients.size,
      has_host: this.host !== null
    }), { headers: { "content-type": "application/json" } });
  }
  _handleMessage(ws, rawData) {
    let msg;
    try {
      msg = JSON.parse(rawData);
    } catch {
      return;
    }
    const { type, sessionId, payload } = msg;
    if (type === "join") {
      ws.sessionId = sessionId;
      ws.role = payload.role;
      if (payload.role === "host") {
        this.host = ws;
      } else if (payload.role === "client") {
        this.clients.add(ws);
        ws.send(JSON.stringify({ type: "joined" }));
        if (this.host && this.host.readyState === 1) {
          this.host.send(JSON.stringify({
            type: "client-joined",
            count: this.clients.size
          }));
        }
      }
      return;
    }
    if (type === "signal") {
      if (ws.role === "host" && this.host) {
        this.clients.forEach((c) => {
          if (c.readyState === 1) {
            c.send(JSON.stringify({ type: "signal", payload }));
          }
        });
      } else if (ws.role === "client") {
        if (this.host && this.host.readyState === 1) {
          this.host.send(JSON.stringify({ type: "signal", payload }));
        }
      }
    }
    if (type === "input") {
      if (ws.role === "client" && this.host && this.host.readyState === 1) {
        this.host.send(JSON.stringify({ type: "input", payload }));
      }
    }
  }
  _cleanup(ws) {
    const { sessionId, role } = ws;
    if (role === "host") {
      this.host = null;
      this.clients.forEach((c) => {
        if (c.readyState === 1) {
          c.send(JSON.stringify({ type: "host-disconnected" }));
          c.close();
        }
      });
      this.clients.clear();
    } else if (role === "client") {
      this.clients.delete(ws);
      if (this.host && this.host.readyState === 1) {
        this.host.send(JSON.stringify({
          type: "client-left",
          count: this.clients.size
        }));
      }
    }
  }
  async Alarm() {
  }
};

// src/worker.js
var indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AnyDesk Clone \u2014 Remote Desktop Without Timeout</title>
  <style>
    :root {
      --bg: #0f0f1a;
      --card: #1a1a2e;
      --border: #2a2a3e;
      --text: #e0e0e0;
      --muted: #888;
      --accent: #00d4ff;
      --green: #00ff88;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
    }
    .container { max-width: 900px; width: 100%; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--muted); margin-bottom: 2rem; font-size: 1.1rem; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    .btn {
      display: block; width: 100%; padding: 0.8rem 1.2rem;
      border: none; border-radius: 8px; font-size: 1rem; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
    }
    .btn-host { background: var(--green); color: #000; }
    .btn-host:hover { background: #00ff77; transform: translateY(-1px); }
    .btn-client { background: var(--accent); color: #000; }
    .btn-client:hover { background: #00e0ff; transform: translateY(-1px); }
    .feature { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
    .feature-icon { font-size: 1.5rem; flex-shrink: 0; }
    .feature-text { color: var(--muted); font-size: 0.9rem; line-height: 1.4; }
    .badge {
      display: inline-block; background: #442; color: #ff6b6b;
      padding: 0.15rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700;
    }
    .badge-free { background: #2a1a1a; color: #00ff88; }
    footer { text-align: center; color: var(--muted); font-size: 0.85rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AnyDesk Clone</h1>
    <p class="subtitle">Remote desktop \u2014 no free plan timeout, no session limits</p>

    <div class="grid">
      <div class="card">
        <h3 style="margin-bottom:1rem;">Host a Computer</h3>
        <p class="feature-text" style="margin-bottom:1rem;">Share your screen and let others control it remotely.</p>
        <button class="btn btn-host" onclick="location.href='/host.html'">Start Hosting</button>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;">View / Control</h3>
        <p class="feature-text" style="margin-bottom:1rem;">Enter a session ID to connect to a remote computer.</p>
        <button class="btn btn-client" onclick="location.href='/client.html'">Connect to Session</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:1rem;">Features <span class="badge-free">No Timeout</span></h3>
      <div class="feature">
        <div class="feature-icon">\u{1F4F1}</div>
        <div class="feature-text">Viewer bisa pakai Android/iOS (touch support)</div>
      </div>
      <div class="feature">
        <div class="feature-icon">\u{1F3AC}</div>
        <div class="feature-text">Full HD screen sharing via WebRTC P2P</div>
      </div>
      <div class="feature">
        <div class="feature-icon">\u{1F5B1}\uFE0F</div>
        <div class="feature-text">Real-time mouse & keyboard control</div>
      </div>
      <div class="feature">
        <div class="feature-icon">\u{1F512}</div>
        <div class="feature-text">End-to-end encrypted WebRTC connection</div>
      </div>
      <div class="feature">
        <div class="feature-icon">\u26A1</div>
        <div class="feature-text">Low latency \u2014 no session time limits</div>
      </div>
      <div class="feature">
        <div class="feature-icon">\u{1F193}</div>
        <div class="feature-text">Free & open source \u2014 no paid plans</div>
      </div>
    </div>
  </div>

  <footer>
    AnyDesk Clone \u2014 built with WebRTC \u2022 No free plan timeout \u2022 Unlimited sessions
  </footer>
</body>
</html>`;
var hostHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Host \u2014 AnyDesk Clone</title>
  <style>
    :root{--bg:#0f0f1a;--card:#1a1a2e;--border:#2a2a3e;--text:#e0e0e0;--muted:#888;--accent:#00d4ff;--green:#00ff88;--red:#ff4757}
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;padding:1.5rem}
    .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}
    h1{font-size:1.3rem}
    .session-id{font-family:'Courier New',monospace;background:var(--card);border:1px solid var(--border);padding:0.3rem 0.8rem;border-radius:6px;font-size:1.1rem;color:var(--accent)}
    .status-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
    .status-waiting{background:var(--muted)}
    .status-connected{background:var(--green);box-shadow:0 0 8px var(--green)}
    .status-ended{background:var(--red)}
    .toolbar{display:flex;gap:0.75rem;margin-bottom:1rem;align-items:center;flex-wrap:wrap}
    .btn{padding:0.5rem 1rem;border:none;border-radius:6px;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all .2s}
    .btn-start{background:var(--green);color:#000}
    .btn-start:hover{background:#00ff77}
    .btn-stop{background:var(--red);color:#fff}
    .btn-stop:hover{background:#ff5263}
    .btn:disabled{opacity:0.5;cursor:not-allowed}
    .preview{flex:1;min-width:0;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden}
    .preview video{width:100%;display:block}
    .preview .placeholder{display:flex;align-items:center;justify-content:center;height:40vh;color:var(--muted);font-size:1rem}
    .info{color:var(--muted);font-size:0.85rem;margin-top:0.5rem}
    .hidden{display:none}
  </style>
</head>
<body>
  <div class="top">
    <h1>\u{1F5A5}\uFE0F Host Mode \u2014 No Timeout</h1>
    <span id="status"><span class="status-dot status-waiting"></span>Waiting to share\u2026</span>
  </div>

  <div class="toolbar">
    <button class="btn btn-start" id="startBtn" onclick="startSharing()">Start Screen Share</button>
    <button class="btn btn-stop" id="stopBtn" onclick="stopSharing()" disabled>Stop Sharing</button>
    <span class="info">Session ID: <span class="session-id" id="sessionId"></span> Share this ID with viewers.</span>
  </div>

  <div class="toolbar" id="clientList" style="display:none">
    <span class="info">Connected viewers: <span id="clientCount">0</span></span>
  </div>

  <div class="preview">
    <video id="preview" autoplay muted playsinline></video>
    <div class="placeholder" id="placeholder">Click "Start Screen Share" to begin sharing your screen.</div>
  </div>

  <div class="info">
    Host: desktop browser (Chrome/Firefox/Edge). Viewer: bisa pakai Android/iOS.
    This session has <strong>no timeout</strong> \u2014 it stays alive until you stop sharing.</div>
  </div>

<script src="/app.js"><\/script>
</body>
</html>`;
var clientHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=coverage">
  <title>Connect \u2014 AnyDesk Clone</title>
  <style>
  :root{--bg:#0f0f1a;--card:#1a1a2e;--border:#2a2a3e;--text:#e0e0e0;--muted:#888;--accent:#00d4ff;--green:#00ff88;--red:#ff4757}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;padding:1rem}
  h1{font-size:1.3rem;margin-bottom:1rem}
  .form-row{display:flex;gap:0.5rem;margin-bottom:1rem}
  .form-row input{flex:1;padding:0.6rem 1rem;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:1rem;font-family:inherit}
  .form-row input::placeholder{color:var(--muted)}
  .btn{padding:0.6rem 1.2rem;border:none;border-radius:6px;font-size:0.95rem;font-weight:600;cursor:pointer;transition:all .2s;white-space:nowrap}
  .btn-connect{background:var(--accent);color:#000}
  .btn-connect:hover{background:#00e0ff}
  .btn:disabled{opacity:0.5;cursor:not-allowed}
  .preview{flex:1;min-width:0;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:1rem}
  .preview video{width:100%;display:block}
  .preview .placeholder{display:flex;align-items:center;justify-content:center;height:60vh;color:var(--muted);font-size:1.1rem}
  .status-bar{display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem}
  .status-dot{width:10px;height:10px;border-radius:50%}
  .status-disconnected{background:var(--muted)}
  .status-connecting{background:#ffa500;box-shadow:0 0 8px #ffa500}
  .status-connected{background:var(--green);box-shadow:0 0 8px var(--green)}
  .controls{border:2px solid var(--border);border-radius:8px;padding:0.5rem;background:var(--card);margin-bottom:1rem;cursor:crosshair}
  .controls video{width:100%;opacity:0.3}
  .info{color:var(--muted);font-size:0.85rem;margin-bottom:0.5rem}
  /* Mobile / Android */
  @media (max-width: 768px) {
    body{padding:0.5rem}
    h1{font-size:1.1rem}
    .form-row{flex-direction:column}
    .btn{padding:0.8rem;font-size:1rem}
    .controls{border:2px solid var(--green);margin:0;position:fixed;top:0;left:0;width:100vw;height:100vh;border-radius:0}
    .controls video{height:100%;object-fit:contain}
    .info{margin-top:4rem}
    .preview,.placeholder{display:none}
  }
  </style>
</head>
<body>
  <h1>\u{1F3AE} Connect to Remote Session</h1>
  <div class="status-bar">
    <span class="status-dot status-disconnected" id="statusDot"></span>
    <span id="statusText">Enter a session ID to connect</span>
  </div>

  <div class="form-row">
    <input type="text" id="sessionId" placeholder="Enter session ID (e.g., a1b2c3d4)" maxlength="20">
    <button class="btn btn-connect" id="connectBtn" onclick="connectToSession()">Connect</button>
  </div>

  <div class="info">Control the remote computer by moving your mouse and typing inside the red frame below.</div>

  <div class="controls" id="controls" style="display:none">
    <video id="remoteVideo" autoplay playsinline></video>
  </div>

  <div class="preview" id="previewContainer" style="display:none">
    <video id="preview" autoplay playsinline></video>
    <div class="placeholder" id="placeholder" style="display:none">Connecting to remote session\u2026</div>
  </div>

  <div class="placeholder" id="initPlaceholder">Enter a session ID and click Connect.</div>

<script src="/app.js"><\/script>
</body>
</html>`;
var appJS = `/* AnyDesk Clone \u2014 WebRTC client logic (no timeout) */

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws';
const WS_URL = WS_PROTOCOL + '://' + location.host;

function generateSessionId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function createWebSocket(sessionId) {
  const wsUrl = sessionId
    ? WS_URL + '/signal?session=' + sessionId
    : WS_URL;
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => console.log('[signal] WebSocket connected');
  ws.onerror = (e) => console.error('[signal] WebSocket error', e);
  ws.onclose = () => console.log('[signal] WebSocket disconnected');
  return ws;
}

const isHostPage = document.getElementById('startBtn') !== null;
const isClientPage = document.getElementById('connectBtn') !== null;

if (isHostPage) { initHost(); }
else if (isClientPage) { initClient(); }

function initHost() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const sessionIdEl = document.getElementById('sessionId');
  const statusSpan = document.getElementById('status');
  const placeholder = document.getElementById('placeholder');
  const preview = document.getElementById('preview');
  const clientList = document.getElementById('clientList');
  const clientCountEl = document.getElementById('clientCount');

  let ws, pc;
  const SESSION_ID = generateSessionId();
  sessionIdEl.textContent = SESSION_ID;

  const iceConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.stunprotocol.org:3478' }
    ]
  };

  startBtn.onclick = startSharing;
  stopBtn.onclick = stopSharing;

  async function startSharing() {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });

      preview.srcObject = display;
      placeholder.classList.add('hidden');
      ws = createWebSocket(SESSION_ID);
            pc = new RTCPeerConnection(iceConfig);

      display.getTracks().forEach(track => pc.addTrack(track, display));

      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'signal', sessionId: SESSION_ID, payload: { ice: e.candidate } }));
        }
      };

      pc.onnegotiationneeded = async () => {
        try { await createOffer(); } catch (e) { console.error('negotiation error', e); }
      };

      display.getVideoTracks()[0].onended = () => stopSharing();

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', sessionId: SESSION_ID, payload: { role: 'host' } }));
        updateStatus('connected', 'Hosting Session: ' + SESSION_ID);
        clientList.style.display = 'block';
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'client-joined') clientCountEl.textContent = msg.count;
        if (msg.type === 'client-left') clientCountEl.textContent = msg.count;
        if (msg.type === 'input') handleRemoteInput(msg.payload);

        if (msg.type === 'signal') {
          const p = msg.payload;
          if (p.sdp) {
            pc.setRemoteDescription(p.sdp).then(() => {
              if (p.sdp.type === 'answer') {
                console.log('[host] Client connected \u2014 stream active, no timeout');
              }
            });
          }
          if (p.ice) {
            pc.addIceCandidate(p.ice).catch(e => console.warn('ICE add failed', e));
          }
        }
      };

      startBtn.disabled = true;
      stopBtn.disabled = false;

    } catch (err) {
      console.error('Screen share error:', err);
      alert('Failed to start screen sharing: ' + err.message);
    }
  }

  function stopSharing() {
    if (pc) { pc.close(); pc = null; }
    if (ws) { ws.close(); ws = null; }
    preview.srcObject = null;
    placeholder.classList.remove('hidden');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    clientList.style.display = 'none';
    updateStatus('ended', 'Sharing stopped');
  }

  async function createOffer() {
    const offer = await pc.createOffer({ offerToReceive: false });
    await pc.setLocalDescription(offer);

    const gatherComplete = new Promise(resolve => {
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') resolve();
      };
      setTimeout(resolve, 1000);
    });
    await gatherComplete;

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'signal',
        sessionId: SESSION_ID,
        payload: { sdp: pc.localDescription }
      }));
    }
  }

  function updateStatus(cls, text) {
    statusSpan.innerHTML = '<span class="status-dot status-' + cls + '"></span>' + text;
  }

  function handleRemoteInput(payload) {
    if (!payload || !payload.type) return;

    if (payload.type === 'mousemove') {
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: payload.cx, clientY: payload.cy, bubbles: true, cancelable: true
      }));
    } else if (payload.type === 'mousedown') {
      document.dispatchEvent(new MouseEvent('mousedown', {
        button: payload.button, bubbles: true, cancelable: true
      }));
    } else if (payload.type === 'mouseup') {
      document.dispatchEvent(new MouseEvent('mouseup', {
        button: payload.button, bubbles: true, cancelable: true
      }));
    } else if (payload.type === 'click') {
      document.dispatchEvent(new MouseEvent('click', {
        button: payload.button, bubbles: true, cancelable: true,
        clientX: payload.cx, clientY: payload.cy
      }));
    } else if (payload.type === 'keydown') {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: payload.key, code: payload.code, bubbles: true, cancelable: true
      }));
    } else if (payload.type === 'keyup') {
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: payload.key, code: payload.code, bubbles: true, cancelable: true
      }));
    } else if (payload.type === 'wheel') {
      document.dispatchEvent(new WheelEvent('wheel', {
        deltaX: payload.deltaX, deltaY: payload.deltaY, bubbles: true, cancelable: true
      }));
    }
  }
}

function initClient() {
  const connectBtn = document.getElementById('connectBtn');
  const sessionIdInput = document.getElementById('sessionId');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const remoteVideo = document.getElementById('remoteVideo');
  const previewContainer = document.getElementById('previewContainer');
  const controlsEl = document.getElementById('controls');
  const initPlaceholder = document.getElementById('initPlaceholder');

  let ws, pc, currentSessionId;

  const iceConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  function setStatus(cls, text) {
    statusDot.className = 'status-dot status-' + cls;
    statusText.textContent = text;
  }

  window.connectToSession = async function() {
    currentSessionId = sessionIdInput.value.trim().toUpperCase();
    if (!currentSessionId) { alert('Please enter a session ID'); return; }

    setStatus('connecting', 'Connecting to session...');
    connectBtn.disabled = true;
    sessionIdInput.disabled = true;
    initPlaceholder.style.display = 'none';
    previewContainer.style.display = 'block';

    ws = createWebSocket(currentSessionId);

        ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', sessionId: currentSessionId, payload: { role: 'client' } }));
    };

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === 'joined') {
        setStatus('connecting', 'Waiting for host offer...');
        pc = new RTCPeerConnection(iceConfig);

        pc.onicecandidate = (e) => {
          if (e.candidate && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'signal', sessionId: currentSessionId, payload: { ice: e.candidate } }));
          }
        };

        pc.ontrack = (e) => {
          if (remoteVideo.srcObject !== e.streams[0]) {
            remoteVideo.srcObject = e.streams[0];
          }
          controlsEl.style.display = 'block';
          setStatus('connected', 'Connected! No timeout \u2014 session stays live indefinitely.');
        };
      }

      if (msg.type === 'signal') {
        const p = msg.payload;
        if (p.sdp && p.sdp.type === 'offer') {
          await pc.setRemoteDescription(p.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const gatherComplete = new Promise(resolve => {
            pc.onicegatheringstatechange = () => {
              if (pc.iceGatheringState === 'complete') resolve();
            };
            setTimeout(resolve, 1000);
          });
          await gatherComplete;

          ws.send(JSON.stringify({
            type: 'signal',
            sessionId: currentSessionId,
            payload: { sdp: pc.localDescription }
          }));
        }
        if (p.ice) {
          try { await pc.addIceCandidate(p.ice); }
          catch(e) { console.warn('Late ICE candidate', e); }
        }
      }

      if (msg.type === 'host-disconnected') {
        endSession();
        setStatus('ended', 'Host disconnected. Session ended.');
      }
      if (msg.type === 'error') {
        setStatus('ended', msg.message);
        alert(msg.message);
      }
    };

    ws.onerror = () => setStatus('ended', 'Connection error');
    ws.onclose = () => {
      if (pc) { pc.close(); pc = null; }
      setStatus('ended', 'Disconnected. Refresh to reconnect.');
    };
  };

  function sendInput(event) {
    if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({
      type: 'input',
      sessionId: currentSessionId,
      payload: event
    }));
  }

  if (controlsEl) {
    controlsEl.style.touchAction = 'none';
    controlsEl.addEventListener('mousemove', (e) => {
      const rect = e.getBoundingClientRect();
      sendInput({ type: 'mousemove', x: e.clientX - rect.left, y: e.clientY - rect.top, cx: e.clientX, cy: e.clientY });
    });
    controlsEl.addEventListener('mousedown', (e) => sendInput({ type: 'mousedown', button: e.button }));
    controlsEl.addEventListener('mouseup', (e) => sendInput({ type: 'mouseup', button: e.button }));
    controlsEl.addEventListener('click', (e) => sendInput({ type: 'click', button: e.button }));
    controlsEl.addEventListener('keydown', (e) => sendInput({ type: 'keydown', key: e.key, code: e.code }));
    controlsEl.addEventListener('keyup', (e) => sendInput({ type: 'keyup', key: e.key, code: e.code }));
    controlsEl.addEventListener('wheel', (e) => sendInput({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY }));

    // Touch support for Android / mobile viewers
    controlsEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.touches[0];
      const cx = touch.clientX, cy = touch.clientY;
      const relX = touch.clientX - rect.left, relY = touch.clientY - rect.top;
      sendInput({ type: 'mousemove', x: relX, y: relY, cx, cy });
      sendInput({ type: 'mousedown', button: 0, cx, cy });
    }, { passive: false });

    controlsEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.touches[0];
      const cx = touch.clientX, cy = touch.clientY;
      const relX = touch.clientX - rect.left, relY = touch.clientY - rect.top;
      sendInput({ type: 'mousemove', x: relX, y: relY, cx, cy });
    }, { passive: false });

    controlsEl.addEventListener('touchend', (e) => {
      e.preventDefault();
      sendInput({ type: 'mouseup', button: 0 });
    }, { passive: false });

    controlsEl.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      sendInput({ type: 'mouseup', button: 0 });
    }, { passive: false });
  }

  function endSession() {
    if (pc) { pc.close(); pc = null; }
    if (ws) { ws.close(); ws = null; }
    remoteVideo.srcObject = null;
    controlsEl.style.display = 'none';
    connectBtn.disabled = false;
    sessionIdInput.disabled = false;
  }

  sessionIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectToSession();
  });
}
`;
var CACHE_TTL = 86400;
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/signal" || pathname === "/signal/") {
      const sessionId = url.searchParams.get("session");
      if (!sessionId) {
        return new Response("Missing ?session=<ID>", { status: 400 });
      }
      const id = env.SIGNALLING_DO.idFromName(sessionId);
      const stub = env.SIGNALLING_DO.get(id);
      return stub.fetch(request);
    }
    const headers = {
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-frame-options": "DENY",
      "permissions-policy": "geolocation=(), microphone=(), camera=()",
      "referrer-policy": "strict-origin-when-cross-origin",
      "access-control-allow-origin": "*"
    };
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(indexHTML, {
        headers: { ...headers, "content-type": "text/html; charset=utf-8" }
      });
    }
    if (pathname === "/host.html") {
      return new Response(hostHTML, {
        headers: { ...headers, "content-type": "text/html; charset=utf-8" }
      });
    }
    if (pathname === "/client.html") {
      return new Response(clientHTML, {
        headers: { ...headers, "content-type": "text/html; charset=utf-8" }
      });
    }
    if (pathname === "/app.js") {
      return new Response(appJS, {
        headers: { ...headers, "content-type": "application/javascript; charset=utf-8", "cache-control": `public, max-age=${CACHE_TTL}` }
      });
    }
    return new Response("Not found", { status: 404, headers });
  }
};

// ../../../../../../../Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../../Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-IEKRXo/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../../../../Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-IEKRXo/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  SignallingDO,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
