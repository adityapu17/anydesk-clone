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
