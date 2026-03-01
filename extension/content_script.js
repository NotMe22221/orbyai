// Content script for Resident Secretary
// Full browser action engine with React/Vue/Angular compatibility

let overlayElement = null;
let sessionId = null;
let currentAction = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let micStream = null;

// ── Message listener ─────────────────────────────────────────────────────────
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

// ── Overlay lifecycle ─────────────────────────────────────────────────────────
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
        <button class="rs-close" id="rs-close-btn" title="Close">&#x2715;</button>
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
        <div class="rs-action-row">
          <button id="rs-analyze-btn" class="rs-btn rs-btn-analyze">&#x1F441; Analyze Screen</button>
        </div>
        <div class="rs-text-input-area">
          <input type="text" id="rs-text-input" placeholder="Or type a command..." autocomplete="off" />
          <button id="rs-send-btn" class="rs-btn rs-btn-send" title="Send">&#x2192;</button>
        </div>
      </div>
    </div>
  `;
}

function setupOverlayListeners() {
  document.getElementById('rs-close-btn')?.addEventListener('click', hideOverlay);
  document.getElementById('rs-send-btn')?.addEventListener('click', sendTextCommand);
  document.getElementById('rs-analyze-btn')?.addEventListener('click', analyzeScreen);
  document.getElementById('rs-text-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendTextCommand(); }
  });
  document.getElementById('rs-approve-btn')?.addEventListener('click', () => approveAction(true));
  document.getElementById('rs-reject-btn')?.addEventListener('click', () => approveAction(false));

  const mic = document.getElementById('rs-mic-indicator');
  mic?.addEventListener('mousedown', startRecording);
  mic?.addEventListener('mouseup', stopAndTranscribe);
  mic?.addEventListener('mouseleave', stopAndTranscribe);
  mic?.addEventListener('touchstart', e => { e.preventDefault(); startRecording(); }, { passive: false });
  mic?.addEventListener('touchend', e => { e.preventDefault(); stopAndTranscribe(); }, { passive: false });
}

// ── Microphone / recording ────────────────────────────────────────────
async function initMicrophone() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    updateOverlayState('idle');
    await playGreeting();
  } catch {
    updateOverlayState('error', { error: 'Microphone permission denied. You can still type commands.' });
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
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  mediaRecorder = new MediaRecorder(micStream, { mimeType });
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start(100);
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
  await new Promise(resolve => setTimeout(resolve, 350));
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  if (audioBlob.size < 1000) { updateOverlayState('idle'); return; }
  try {
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

async function analyzeScreen() {
  updateOverlayState('processing');
  const st = document.getElementById('rs-status-text');
  if (st) st.textContent = 'Analyzing screen...';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'ANALYZE_SCREEN' });
    await handleAgentResponse(response);
  } catch (err) {
    updateOverlayState('error', { error: err.message });
  }
}

async function handleAgentResponse(response) {
  if (!response || response.error) {
    updateOverlayState('error', { error: response?.error || 'No response from backend' });
    return;
  }
  if (response.responseText) {
    try {
      const tts = await chrome.runtime.sendMessage({ type: 'SYNTHESIZE_SPEECH', text: response.responseText });
      if (tts?.audioBase64) playAudioBase64(tts.audioBase64);
    } catch { /* non-critical */ }
  }
  if (response.requiresApproval && response.action) {
    currentAction = response.action;
    updateOverlayState('action_pending', { description: response.actionDescription || 'Approve this action?' });
  } else if (response.action) {
    updateOverlayState('processing');
    try {
      await executeBrowserAction(response.action);
      updateOverlayState('result', { text: response.responseText || 'Done!' });
    } catch (err) {
      updateOverlayState('error', { error: `Action failed: ${err.message}` });
    }
  } else {
    updateOverlayState('responding', { text: response.responseText || 'Got it.' });
  }
}

function playAudioBase64(base64) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
  } catch { /* non-critical */ }
}

async function approveAction(approved) {
  document.getElementById('rs-approval-banner').style.display = 'none';
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
  if (!overlayElement) return;
  const statusText = document.getElementById('rs-status-text');
  const micIndicator = document.getElementById('rs-mic-indicator');
  const responseDiv = document.getElementById('rs-response');
  const responseText = document.getElementById('rs-response-text');
  const approvalBanner = document.getElementById('rs-approval-banner');

  micIndicator?.classList.remove('listening', 'processing', 'responding', 'error');

  const states = {
    idle: () => {
      if (statusText) statusText.textContent = 'Hold mic to speak';
      if (responseDiv) responseDiv.style.display = 'none';
    },
    listening: () => {
      if (statusText) statusText.textContent = 'Listening…';
      micIndicator?.classList.add('listening');
    },
    processing: () => {
      if (statusText) statusText.textContent = 'Processing…';
      micIndicator?.classList.add('processing');
    },
    responding: () => {
      if (statusText) statusText.textContent = 'Done';
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
      if (statusText) statusText.textContent = 'Error';
      micIndicator?.classList.add('error');
      if (responseDiv) responseDiv.style.display = 'block';
      if (responseText) responseText.textContent = data.error || 'Something went wrong';
    },
  };
  states[state]?.();
}

// ──────────────────────────────────────────────────────────────────
//  BROWSER ACTION ENGINE
// ──────────────────────────────────────────────────────────────────

function findElement(selector, context = document) {
  if (!selector) return null;
  try {
    const el = context.querySelector(selector);
    if (el && isVisible(el)) return el;
  } catch { }
  try {
    const relaxed = selector.replace(/:nth-child\([^)]+\)/g, '');
    if (relaxed !== selector) {
      const el = context.querySelector(relaxed);
      if (el && isVisible(el)) return el;
    }
  } catch { }
  const term = selector.replace(/[#.\[\]"'>=:*]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const byPlaceholder = [...context.querySelectorAll('input, textarea')]
    .find(el => el.placeholder?.toLowerCase().includes(term) && isVisible(el));
  if (byPlaceholder) return byPlaceholder;
  const byAria = context.querySelector(`[aria-label*="${term}" i]`);
  if (byAria && isVisible(byAria)) return byAria;
  const byName = context.querySelector(`[name="${term}"], [name*="${term}" i]`);
  if (byName && isVisible(byName)) return byName;
  const byTestId = context.querySelector(`[data-testid*="${term}" i]`);
  if (byTestId && isVisible(byTestId)) return byTestId;
  const clickable = [...context.querySelectorAll('button, a, [role="button"], [role="link"], [role="menuitem"]')];
  const byText = clickable.find(el => el.textContent?.trim().toLowerCase().includes(term) && isVisible(el));
  if (byText) return byText;
  const byTitle = context.querySelector(`[title*="${term}" i]`);
  if (byTitle && isVisible(byTitle)) return byTitle;
  return null;
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

async function findElementWithRetry(selector, maxMs = 3000) {
  const intervals = [100, 200, 400, 800, 1500];
  let el = findElement(selector);
  if (el) return el;
  for (const delay of intervals) {
    if (delay > maxMs) break;
    await new Promise(r => setTimeout(r, delay));
    el = findElement(selector);
    if (el) return el;
  }
  return null;
}

async function fillField(selector, value) {
  const el = await findElementWithRetry(selector);
  if (!el) throw new Error(`Field not found: "${selector}"`);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 80));
  el.focus();
  if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (el.tagName === 'SELECT') {
    const option = [...el.options].find(o =>
      o.text.toLowerCase().includes(value.toLowerCase()) ||
      o.value.toLowerCase() === value.toLowerCase()
    );
    if (option) { el.value = option.value; } else { el.value = value; }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) { nativeSetter.call(el, value); } else { el.value = value; }
  el.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
  el.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true, key: value.slice(-1) }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value.slice(-1) }));
}

async function clickElement(selector) {
  const el = await findElementWithRetry(selector);
  if (!el) throw new Error(`Clickable element not found: "${selector}"`);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 120));
  el.focus();
  const opts = { bubbles: true, cancelable: true };
  el.dispatchEvent(new MouseEvent('mouseover',  { ...opts }));
  el.dispatchEvent(new MouseEvent('mouseenter', { ...opts }));
  el.dispatchEvent(new MouseEvent('mousedown',  { ...opts, buttons: 1, button: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup',    { ...opts, buttons: 0, button: 0 }));
  el.click();
  el.dispatchEvent(new MouseEvent('click',      { ...opts, buttons: 0, button: 0 }));
  el.dispatchEvent(new MouseEvent('mouseleave', { ...opts }));
}

async function executeBrowserAction(action) {
  switch (action.type) {
    case 'fill_field':
      await fillField(action.selector, action.value ?? '');
      return { success: true, selector: action.selector, value: action.value };
    case 'click':
      await clickElement(action.selector);
      return { success: true, selector: action.selector };
    case 'copy_clipboard':
      await navigator.clipboard.writeText(action.text ?? '');
      return { success: true };
    case 'inject_overlay': {
      let container = document.getElementById('rs-injected-overlay');
      if (!container) {
        container = document.createElement('div');
        container.id = 'rs-injected-overlay';
        document.body.appendChild(container);
      }
      container.innerHTML = action.html ?? '';
      return { success: true };
    }
    case 'navigate':
      if (!action.url) throw new Error('navigate requires a url');
      window.location.href = action.url;
      return { success: true };
    case 'open_tab':
      if (!action.url) throw new Error('open_tab requires a url');
      window.open(action.url, '_blank', 'noopener');
      return { success: true };
    case 'scroll_to': {
      const target = action.selector ? findElement(action.selector) : null;
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else { window.scrollTo({ top: action.y ?? 0, left: action.x ?? 0, behavior: 'smooth' }); }
      return { success: true };
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
