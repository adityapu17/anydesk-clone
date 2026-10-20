/* AnyDesk Clone — WebRTC client logic (no timeout) */

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

      // Create offer AFTER tracks added, but only send when WS opens.
      // onnegotiationneeded fires before WS is ready — disabled to prevent early send
      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'signal', sessionId: SESSION_ID, payload: { ice: e.candidate } }));
        }
      };

      display.getVideoTracks()[0].onended = () => stopSharing();

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', sessionId: SESSION_ID, payload: { role: 'host' } }));
        updateStatus('connected', 'Hosting Session: ' + SESSION_ID);
        clientList.style.display = 'block';
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'client-joined') {
          clientCountEl.textContent = msg.count;
          // Send SDP offer NOW that client is connected
          createOffer().catch(e => console.error('offer error', e));
        }
        if (msg.type === 'client-left') clientCountEl.textContent = msg.count;
        if (msg.type === 'input') handleRemoteInput(msg.payload);

        if (msg.type === 'signal') {
          const p = msg.payload;
          if (p.sdp) {
            pc.setRemoteDescription(p.sdp).then(() => {
              if (p.sdp.type === 'answer') {
                console.log('[host] Client connected — stream active, no timeout');
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

    // Visual remote cursor on host screen
    let remoteCursorEl = document.getElementById('remoteCursor');

    // Scale normalized coords to host viewport, fallback to absolute
    const getCoords = (p) => {
      if (p.nx !== undefined && p.ny !== undefined) {
        return { x: p.nx * window.innerWidth, y: p.ny * window.innerHeight };
      }
      return { x: p.cx || 0, y: p.cy || 0 };
    };

    if (payload.type === 'mousemove') {
      const { x, y } = getCoords(payload);
      if (remoteCursorEl) {
        remoteCursorEl.style.left = x + 'px';
        remoteCursorEl.style.top = y + 'px';
        remoteCursorEl.style.display = 'block';
        remoteCursorEl.classList.remove('active-click');
      }
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.dispatchEvent(new MouseEvent('mousemove', {
          clientX: x, clientY: y, bubbles: true, cancelable: true, view: window
        }));
      }
    } else if (payload.type === 'mousedown') {
      const { x, y } = getCoords(payload);
      if (remoteCursorEl) {
        remoteCursorEl.classList.add('active-click');
        remoteCursorEl.style.display = 'block';
        remoteCursorEl.style.left = x + 'px';
        remoteCursorEl.style.top = y + 'px';
      }
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.focus();
        el.dispatchEvent(new MouseEvent('mousedown', {
          button: payload.button, bubbles: true, cancelable: true, view: window
        }));
      }
    } else if (payload.type === 'mouseup') {
      if (remoteCursorEl) remoteCursorEl.classList.remove('active-click');
      const { x, y } = getCoords(payload);
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.dispatchEvent(new MouseEvent('mouseup', {
          button: payload.button, bubbles: true, cancelable: true, view: window
        }));
      }
    } else if (payload.type === 'click') {
      const { x, y } = getCoords(payload);
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.focus();
        el.dispatchEvent(new MouseEvent('click', {
          button: payload.button, bubbles: true, cancelable: true,
          clientX: x, clientY: y, view: window
        }));
      }
    } else if (payload.type === 'keydown') {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: payload.key, code: payload.code, bubbles: true, cancelable: true, view: window
      }));
    } else if (payload.type === 'keyup') {
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: payload.key, code: payload.code, bubbles: true, cancelable: true, view: window
      }));
    } else if (payload.type === 'wheel') {
      const { x, y } = getCoords(payload);
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.dispatchEvent(new WheelEvent('wheel', {
          deltaX: payload.deltaX, deltaY: payload.deltaY, bubbles: true, cancelable: true, view: window
        }));
      }
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
  const remoteCursor = document.getElementById('remoteCursor');
  const fsBtn = document.getElementById('fsBtn');
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
          setStatus('connected', 'Connected! No timeout — session stays live indefinitely.');
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

  // Assign onclick EARLY before controlsEl block (CSP blocks inline onclick)
  connectBtn.onclick = connectToSession;

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

      // Virtual cursor visual feedback (follows local mouse on controls area)
      controlsEl.addEventListener('mousemove', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const nx = relX / rect.width;
        const ny = relY / rect.height;
        if (remoteCursor) {
          remoteCursor.style.left = relX + 'px';
          remoteCursor.style.top = relY + 'px';
          remoteCursor.style.display = 'block';
        }
        sendInput({ type: 'mousemove', x: relX, y: relY, cx: e.clientX, cy: e.clientY, nx, ny });
      });
      controlsEl.addEventListener('mouseleave', () => {
        if (remoteCursor) remoteCursor.style.display = 'none';
      });
      controlsEl.addEventListener('mousedown', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const nx = relX / rect.width;
        const ny = relY / rect.height;
        sendInput({ type: 'mousedown', button: e.button, cx: e.clientX, cy: e.clientY, nx, ny });
      });
      controlsEl.addEventListener('mouseup', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const nx = relX / rect.width;
        const ny = relY / rect.height;
        sendInput({ type: 'mouseup', button: e.button, cx: e.clientX, cy: e.clientY, nx, ny });
      });
      controlsEl.addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const nx = relX / rect.width;
        const ny = relY / rect.height;
        sendInput({ type: 'click', button: e.button, cx: e.clientX, cy: e.clientY, nx, ny });
      });
      controlsEl.addEventListener('keydown', (e) => sendInput({ type: 'keydown', key: e.key, code: e.code }));
      controlsEl.addEventListener('keyup', (e) => sendInput({ type: 'keyup', key: e.key, code: e.code }));
      controlsEl.addEventListener('wheel', (e) => sendInput({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY }));

      // Fullscreen button
      if (fsBtn) {
        const toggleFullscreen = () => {
          if (document.fullscreenElement === controlsEl) {
            document.exitFullscreen();
          } else if (controlsEl.requestFullscreen) {
            controlsEl.requestFullscreen();
          } else if (controlsEl.webkitRequestFullscreen) {
            controlsEl.webkitRequestFullscreen();
          } else if (controlsEl.msRequestFullscreen) {
            controlsEl.msRequestFullscreen();
          }
        };

        fsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          toggleFullscreen();
        });

        // Handle fullscreen change to update button state
        const handleFullscreenChange = () => {
          const isFullscreen = document.fullscreenElement === controlsEl;
          fsBtn.textContent = isFullscreen ? '⛶' : '⛶'; // Can change icon if needed
          fsBtn.title = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);
      }

      // Touch support for Android / mobile viewers
      // Track last touch position to maintain cursor position between swipes
      let lastTouchX = 0;
      let lastTouchY = 0;

      controlsEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const touch = e.touches[0];
        const cx = touch.clientX, cy = touch.clientY;
        const relX = touch.clientX - rect.left, relY = touch.clientY - rect.top;
        const nx = relX / rect.width, ny = relY / rect.height;
        lastTouchX = relX;
        lastTouchY = relY;
        if (remoteCursor) {
          remoteCursor.style.left = relX + 'px';
          remoteCursor.style.top = relY + 'px';
          remoteCursor.style.display = 'block';
        }
        sendInput({ type: 'mousemove', x: relX, y: relY, cx, cy, nx, ny });
        sendInput({ type: 'mousedown', button: 0, cx, cy, nx, ny });
      }, { passive: false });

      controlsEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const touch = e.touches[0];
        const cx = touch.clientX, cy = touch.clientY;
        const relX = touch.clientX - rect.left, relY = touch.clientY - rect.top;
        const nx = relX / rect.width, ny = relY / rect.height;
        lastTouchX = relX;
        lastTouchY = relY;
        if (remoteCursor) {
          remoteCursor.style.left = relX + 'px';
          remoteCursor.style.top = relY + 'px';
          remoteCursor.style.display = 'block';
        }
        sendInput({ type: 'mousemove', x: relX, y: relY, cx, cy, nx, ny });
      }, { passive: false });

      controlsEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        // Keep cursor at last position instead of hiding it
        if (remoteCursor) {
          remoteCursor.style.left = lastTouchX + 'px';
          remoteCursor.style.top = lastTouchY + 'px';
          remoteCursor.style.display = 'block';
        }
        // Send final position before mouseup
        sendInput({ type: 'mousemove', x: lastTouchX, y: lastTouchY, cx: lastTouchX, cy: lastTouchY, nx: lastTouchX/rect.width, ny: lastTouchY/rect.height });
        sendInput({ type: 'mouseup', button: 0 });
      }, { passive: false });

      controlsEl.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        if (remoteCursor) {
          remoteCursor.style.left = lastTouchX + 'px';
          remoteCursor.style.top = lastTouchY + 'px';
          remoteCursor.style.display = 'block';
        }
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
