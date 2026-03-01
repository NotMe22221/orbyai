// Content script for Resident Secretary
// Voice pipeline: ElevenLabs STT (mic recording) + ElevenLabs TTS (audio playback)

let overlayElement = null;
let overlayState = 'idle';
let sessionId = null;
let currentAction = null;

// ─── MediaRecorder for ElevenLabs STT ───────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let micStream = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SHOW_OVERLAY':
      sessionId = message.sessionId;
      showOverlay();
      sendResponse({ success: true });
      break;
    case 'HIDE_OVERLAY':
      hideOverlay();
      sendResponse({ success: true });
      break;
    case 'UPDATE_STATE':
      updateOverlayState(message.state, message.data);
      sendResponse({ success: true });
      break;
    case 'EXECUTE_BROWSER_ACTION':
      executeBrowserAction(message.action)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }
});

function showOverlay() {
  if (overlayElement) return;
  overlayElement = document.createElement('div');
  overlayElement.id = 'resident-secretary-overlay';
  overlayElement.innerHTML = createOverlayHTML();
  document.body.appendChild(overlayElement);
  setupOverlayListeners();
  initMicrophone();
}

function hideOverlay() {
  stopRecording();
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (overlayElement) { overlayElement.remove(); overlayElement = null; }
  chrome.runtime.sendMessage({ type: 'OVERLAY_CLOSED' });
}

function createOverlayHTML() {
  return `
    <div class="rs-container">
      <div class="rs-header">
        <div class="rs-logo">&#x1F916;</div>
        <span class="rs-title">Resident Secretary</span>
        <button class="rs-close" id="rs-close-btn">&#x2715;</button>
      </div>
      <div class="rs-body">
        <div class="rs-status">
          <div class="rs-mic-indicator" id="rs-mic-indicator" title="Hold to speak"></div>
          <p class="rs-status-text" id="rs-status-text">Hold mic to speak</p>
        </div>
        <div class="rs-response" id="rs-response" style="display:none">
          <p id="rs-response-text"></p>
        </div>
        <div class="rs-approval-banner" id="rs-approval-banner" style="display:none">
          <p id="rs-approval-text">Approve action?</p>
          <div class="rs-approval-buttons">
            <button id="rs-approve-btn" class="rs-btn rs-btn-approve">&#x2713; Approve</button>
            <button id="rs-reject-btn" class="rs-btn rs-btn-reject">&#x2715; Reject</button>
          </div>
        </div>
        <div class="rs-text-input-area">
          <input type="text" id="rs-text-input" placeholder="Or type a command..." />
          <button id="rs-send-btn" class="rs-btn rs-btn-send">&#x2192;</button>
        </div>
      </div>
    </div>
  `;
}

function setupOverlayListeners() {
  document.getElementById('rs-close-btn')?.addEventListener('click', hideOverlay);
  document.getElementById('rs-send-btn')?.addEventListener('click', sendTextCommand);
  document.getElementById('rs-text-input')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendTextCommand();
  });
  document.getElementById('rs-approve-btn')?.addEventListener('click', () => approveAction(true));
  document.getElementById('rs-reject-btn')?.addEventListener('click', () => approveAction(false));

  // Push-to-talk: hold mic button
  const mic = document.getElementById('rs-mic-indicator');
  mic?.addEventListener('mousedown', startRecording);
  mic?.addEventListener('mouseup', stopAndTranscribe);
  mic?.addEventListener('mouseleave', stopAndTranscribe);
  // Touch support
  mic?.addEventListener('touchstart', e => { e.preventDefault(); startRecording(); });
  mic?.addEventListener('touchend', e => { e.preventDefault(); stopAndTranscribe(); });
}

async function initMicrophone() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    updateOverlayState('idle');
    // Play ElevenLabs greeting
    await playGreeting();
  } catch {
    updateOverlayState('error', { error: 'Microphone permission denied' });
  }
}

async function playGreeting() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SYNTHESIZE_SPEECH',
      text: "Hello, I'm your Resident Secretary. I'm ready to help."
    });
    if (response?.audioBase64) playAudioBase64(response.audioBase64);
  } catch { /* non-critical */ }
}

function startRecording() {
  if (!micStream || isRecording) return;
  audioChunks = [];
  mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start();
  isRecording = true;
  updateOverlayState('listening');
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  mediaRecorder.stop();
  isRecording = false;
}

async function stopAndTranscribe() {
  if (!isRecording) return;
  stopRecording();
  updateOverlayState('processing');

  await new Promise(resolve => setTimeout(resolve, 300)); // let recorder flush

  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  if (audioBlob.size < 1000) { updateOverlayState('idle'); return; } // too short

  try {
    // Send audio to backend for ElevenLabs STT transcription
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const response = await chrome.runtime.sendMessage({
      type: 'VOICE_COMMAND',
      payload: { audioBase64: base64Audio, mimeType: 'audio/webm', vapiRecording: null }
    });
    await handleAgentResponse(response);
  } catch (err) {
    updateOverlayState('error', { error: err.message });
  }
}

async function sendTextCommand() {
  const input = document.getElementById('rs-text-input');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  updateOverlayState('processing');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'VOICE_COMMAND',
      payload: { transcript: text, vapiRecording: null }
    });
    await handleAgentResponse(response);
  } catch (err) {
    updateOverlayState('error', { error: err.message });
  }
}

async function handleAgentResponse(response) {
  if (response?.error) { updateOverlayState('error', { error: response.error }); return; }
  // Play TTS response via ElevenLabs
  if (response?.responseText) {
    try {
      const tts = await chrome.runtime.sendMessage({
        type: 'SYNTHESIZE_SPEECH',
        text: response.responseText
      });
      if (tts?.audioBase64) playAudioBase64(tts.audioBase64);
    } catch { /* non-critical */ }
  }
  if (response?.requiresApproval) {
    currentAction = response.action;
    updateOverlayState('action_pending', { description: response.actionDescription });
  } else if (response?.action) {
    updateOverlayState('processing');
    await executeBrowserAction(response.action);
    updateOverlayState('result', { text: response.responseText });
  } else {
    updateOverlayState('responding', { text: response.responseText });
  }
}

function playAudioBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.play().catch(() => {});
}

async function approveAction(approved) {
  const approvalBanner = document.getElementById('rs-approval-banner');
  if (approvalBanner) approvalBanner.style.display = 'none';
  if (approved && currentAction) {
    updateOverlayState('processing');
    try {
      await executeBrowserAction(currentAction);
      updateOverlayState('result', { text: 'Action completed successfully' });
    } catch (err) {
      updateOverlayState('error', { error: err.message });
    }
  } else {
    updateOverlayState('idle');
  }
  currentAction = null;
}

function updateOverlayState(state, data = {}) {
  const statusText = document.getElementById('rs-status-text');
  const micIndicator = document.getElementById('rs-mic-indicator');
  const responseDiv = document.getElementById('rs-response');
  const responseText = document.getElementById('rs-response-text');
  const approvalBanner = document.getElementById('rs-approval-banner');

  micIndicator?.classList.remove('listening', 'processing', 'responding', 'error');

  const states = {
    idle: () => { if (statusText) statusText.textContent = 'Hold mic to speak'; },
    listening: () => { if (statusText) statusText.textContent = 'Listening...'; micIndicator?.classList.add('listening'); },
    processing: () => { if (statusText) statusText.textContent = 'Processing...'; micIndicator?.classList.add('processing'); },
    responding: () => {
      if (statusText) statusText.textContent = 'Responding...';
      micIndicator?.classList.add('responding');
      if (responseDiv) responseDiv.style.display = 'block';
      if (responseText) responseText.textContent = data.text || '';
    },
    action_pending: () => {
      if (statusText) statusText.textContent = 'Action requires approval';
      if (approvalBanner) approvalBanner.style.display = 'block';
      const el = document.getElementById('rs-approval-text');
      if (el) el.textContent = data.description || 'Approve action?';
    },
    result: () => {
      if (statusText) statusText.textContent = 'Done!';
      if (responseDiv) responseDiv.style.display = 'block';
      if (responseText) responseText.textContent = data.text || 'Action completed';
      if (approvalBanner) approvalBanner.style.display = 'none';
    },
    error: () => {
      if (statusText) statusText.textContent = 'Error occurred';
      micIndicator?.classList.add('error');
      if (responseDiv) responseDiv.style.display = 'block';
      if (responseText) responseText.textContent = data.error || 'Something went wrong';
    }
  };
  states[state]?.();
}

async function executeBrowserAction(action) {
  switch (action.type) {
    case 'fill_field': {
      const el = document.querySelector(action.selector);
      if (!el) throw new Error(`Element not found: ${action.selector}`);
      el.focus(); el.value = action.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }
    case 'click': {
      const el = document.querySelector(action.selector);
      if (!el) throw new Error(`Element not found: ${action.selector}`);
      el.click(); return { success: true };
    }
    case 'copy_clipboard':
      await navigator.clipboard.writeText(action.text);
      return { success: true };
    case 'inject_overlay': {
      const c = document.createElement('div');
      c.id = 'rs-injected-overlay'; c.innerHTML = action.html;
      document.body.appendChild(c); return { success: true };
    }
    case 'navigate': window.location.href = action.url; return { success: true };
    case 'open_tab': window.open(action.url, '_blank'); return { success: true };
    case 'scroll_to':
      action.selector
        ? document.querySelector(action.selector)?.scrollIntoView({ behavior: 'smooth' })
        : window.scrollTo({ top: action.y || 0, left: action.x || 0, behavior: 'smooth' });
      return { success: true };
    default: throw new Error(`Unknown action type: ${action.type}`);
  }
}
