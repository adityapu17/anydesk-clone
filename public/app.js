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

  // Host cursor position (tracked server-side)
  let hostCursorX = window.innerWidth / 2;
  let hostCursorY = window.innerHeight / 2;
  let remoteCursorEl = null;

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

      display.getVideoTracks()[0].onended = () => stopSharing();

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', sessionId: SESSION_ID, payload: { role: 'host' } }));
        updateStatus('connected', 'Hosting Session: ' + SESSION_ID);
        clientList.style.display = 'block';

        // Create remote cursor element on host
        remoteCursorEl = document.getElementById('remoteCursor');
        if (remoteCursorEl) {
          remoteCursorEl.style.left = hostCursorX + 'px';
          remoteCursorEl.style.top = hostCursorY + 'px';
        }
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'client-joined') {
          clientCountEl.textContent = msg.count;
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
    if (remoteCursorEl) remoteCursorEl.style.display = 'none';
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
    if (!remoteCursorEl) remoteCursorEl = document.getElementById('remoteCursor');

    if (payload.type === 'mousemove') {
      // Relative movement (delta) - AnyDesk style
      if (payload.dx !== undefined && payload.dy !== undefined) {
        hostCursorX += payload.dx;
        hostCursorY += payload.dy;
        // Clamp to screen bounds
        hostCursorX = Math.max(0, Math.min(window.innerWidth, hostCursorX));
        hostCursorY = Math.max(0, Math.min(window.innerHeight, hostCursorY));
      }
      // Fallback: absolute normalized coords (0-1)
      else if (payload.nx !== undefined && payload.ny !== undefined) {
        hostCursorX = payload.nx * window.innerWidth;
        hostCursorY = payload.ny * window.innerHeight;
      }
      // Fallback: absolute client coords
      else if (payload.cx !== undefined && payload.cy !== undefined) {
        hostCursorX = payload.cx;
        hostCursorY = payload.cy;
      }

      if (remoteCursorEl) {
        remoteCursorEl.style.left = hostCursorX + 'px';
        remoteCursorEl.style.top = hostCursorY + 'px';
        remoteCursorEl.style.display = 'block';
        remoteCursorEl.classList.remove('active-click');
      }
      dispatchMouseEvent('mousemove', hostCursorX, hostCursorY, payload.button);
    }
    else if (payload.type === 'mousedown') {
      if (remoteCursorEl) {
        remoteCursorEl.classList.add('active-click');
        remoteCursorEl.style.display = 'block';
        remoteCursorEl.style.left = hostCursorX + 'px';
        remoteCursorEl.style.top = hostCursorY + 'px';
      }
      dispatchMouseEvent('mousedown', hostCursorX, hostCursorY, payload.button);
    }
    else if (payload.type === 'mouseup') {
      if (remoteCursorEl) remoteCursorEl.classList.remove('active-click');
      dispatchMouseEvent('mouseup', hostCursorX, hostCursorY, payload.button);
    }
    else if (payload.type === 'click') {
      dispatchMouseEvent('click', hostCursorX, hostCursorY, payload.button);
    }
    else if (payload.type === 'keydown') {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: payload.key, code: payload.code, bubbles: true, cancelable: true, view: window
      }));
    }
    else if (payload.type === 'keyup') {
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: payload.key, code: payload.code, bubbles: true, cancelable: true, view: window
      }));
    }
    else if (payload.type === 'wheel') {
      dispatchWheelEvent(hostCursorX, hostCursorY, payload.deltaX, payload.deltaY);
    }
  }

  function dispatchMouseEvent(type, x, y, button) {
    const el = document.elementFromPoint(x, y);
    if (el) {
      if (type === 'mousedown') el.focus();
      el.dispatchEvent(new MouseEvent(type, {
        clientX: x, clientY: y, button: button || 0,
        bubbles: true, cancelable: true, view: window
      }));
    }
  }

  function dispatchWheelEvent(x, y, deltaX, deltaY) {
    const el = document.elementFromPoint(x, y);
    if (el) {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaX, deltaY, bubbles: true, cancelable: true, view: window
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

    // Mouse events - desktop: send absolute normalized coords
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
      sendInput({ type: 'mousemove', nx, ny, cx: e.clientX, cy: e.clientY });
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
      sendInput({ type: 'mousedown', button: e.button, nx, ny, cx: e.clientX, cy: e.clientY });
    });
    controlsEl.addEventListener('mouseup', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      const nx = relX / rect.width;
      const ny = relY / rect.height;
      sendInput({ type: 'mouseup', button: e.button, nx, ny, cx: e.clientX, cy: e.clientY });
    });
    controlsEl.addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      const nx = relX / rect.width;
      const ny = relY / rect.height;
      sendInput({ type: 'click', button: e.button, nx, ny, cx: e.clientX, cy: e.clientY });
    });
    controlsEl.addEventListener('keydown', (e) => sendInput({ type: 'keydown', key: e.key, code: e.code }));
    controlsEl.addEventListener('keyup', (e) => sendInput({ type: 'keyup', key: e.key, code: e.code }));
    controlsEl.addEventListener('wheel', (e) => sendInput({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY }));

    // Fullscreen button - robust implementation
    if (fsBtn) {
      fsBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('[fullscreen] Button clicked, current fullscreenElement:', document.fullscreenElement);

        try {
          if (document.fullscreenElement === controlsEl) {
            await document.exitFullscreen();
            console.log('[fullscreen] Exited fullscreen');
          } else {
            await controlsEl.requestFullscreen();
            console.log('[fullscreen] Entered fullscreen');
          }
        } catch (err) {
          console.error('[fullscreen] Error:', err);
          // Fallback for mobile
          try {
            if (controlsEl.webkitRequestFullscreen) {
              await controlsEl.webkitRequestFullscreen();
            } else if (controlsEl.msRequestFullscreen) {
              controlsEl.msRequestFullscreen();
            }
          } catch (e2) {
            console.error('[fullscreen] Fallback failed:', e2);
          }
        }
      });

      const handleFullscreenChange = () => {
        const isFullscreen = document.fullscreenElement === controlsEl;
        console.log('[fullscreen] Change event, isFullscreen:', isFullscreen);
        fsBtn.title = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.addEventListener('msfullscreenchange', handleFullscreenChange);
    }

    // Touch support - AnyDesk style: Virtual Trackpad (relative movements)
    let lastTouchX = 0;
    let lastTouchY = 0;
    let isTouchDragging = false;

    controlsEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.touches[0];
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      isTouchDragging = true;

      const relX = touch.clientX - rect.left;
      const relY = touch.clientY - rect.top;
      if (remoteCursor) {
        remoteCursor.style.left = relX + 'px';
        remoteCursor.style.top = relY + 'px';
        remoteCursor.style.display = 'block';
      }
      // Send initial absolute position (normalized) to sync host cursor
      sendInput({
        type: 'mousemove',
        nx: relX / rect.width,
        ny: relY / rect.height,
        cx: touch.clientX,
        cy: touch.clientY
      });
      sendInput({ type: 'mousedown', button: 0, nx: relX / rect.width, ny: relY / rect.height });
    }, { passive: false });

    controlsEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!isTouchDragging) return;

      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchX;
      const dy = touch.clientY - lastTouchY;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;

      const rect = e.currentTarget.getBoundingClientRect();
      const relX = touch.clientX - rect.left;
      const relY = touch.clientY - rect.top;

      if (remoteCursor) {
        remoteCursor.style.left = relX + 'px';
        remoteCursor.style.top = relY + 'px';
        remoteCursor.style.display = 'block';
      }

      // Send RELATIVE movement (delta) - AnyDesk style trackpad
      // Scale factor for sensitivity (adjust as needed)
      const sensitivity = 1.5;
      sendInput({ type: 'mousemove', dx: dx * sensitivity, dy: dy * sensitivity });
    }, { passive: false });

    controlsEl.addEventListener('touchend', (e) => {
      e.preventDefault();
      isTouchDragging = false;
      // Keep cursor visible at last position
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = lastTouchX - rect.left;
      const relY = lastTouchY - rect.top;
      if (remoteCursor) {
        remoteCursor.style.left = relX + 'px';
        remoteCursor.style.top = relY + 'px';
        remoteCursor.style.display = 'block';
      }
      sendInput({ type: 'mouseup', button: 0 });
    }, { passive: false });

    controlsEl.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      isTouchDragging = false;
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = lastTouchX - rect.left;
      const relY = lastTouchY - rect.top;
      if (remoteCursor) {
        remoteCursor.style.left = relX + 'px';
        remoteCursor.style.top = relY + 'px';
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