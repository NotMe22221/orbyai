// content_script.js — Resident Secretary v1.1
// Enhanced browser action engine:
//   shadow DOM, iframes, React/Vue/Angular, checkbox/radio,
//   contenteditable, pointer events, draggable overlay, escape key,
//   auto-reset UI, new action types, safe CSS escaping.

let overlayElement = null;
let sessionId = null;
let currentAction = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let micStream = null;
let uiResetTimer = null;

// ── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ pong: true });
      return true;

    case 'SHOW_OVERLAY':
      sessionId = message.sessionId;
      showOverlay();
      sendResponse({ success: true });
      break;

    case 'HIDE_OVERLAY':
      hideOverlay();
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
  if (overlayElement) {
    overlayElement.style.display = 'block';
    return;
  }
  overlayElement = document.createElement('div');
  overlayElement.id = 'resident-secretary-overlay';
  overlayElement.innerHTML = createOverlayHTML();
  document.body.appendChild(overlayElement);
  // Trigger slide-in animation
  requestAnimationFrame(() => overlayElement.classList.add('rs-visible'));
  setupOverlayListeners();
  initMicrophone();
}

function hideOverlay() {
  stopRecording();
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (uiResetTimer) { clearTimeout(uiResetTimer); uiResetTimer = null; }
  document.removeEventListener('keydown', handleEscapeKey);
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
  chrome.runtime.sendMessage({ type: 'OVERLAY_CLOSED' }).catch(() => {});
}

function createOverlayHTML() {
  return `
    <div class="rs-container">
      <div class="rs-header" id="rs-drag-handle">
        <div class="rs-logo">&#x1F916;</div>
        <span class="rs-title">Resident Secretary</span>
        <button class="rs-close" id="rs-close-btn" title="Close (Esc)">&#x2715;</button>
      </div>
      <div class="rs-body">
        <div class="rs-status">
          <div class="rs-mic-indicator" id="rs-mic-indicator" title="Hold to record">&#x1F399;&#xFE0F;</div>
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
          <input type="text" id="rs-text-input" placeholder="Or type a command…" autocomplete="off" spellcheck="false" />
          <button id="rs-send-btn" class="rs-btn rs-btn-send" title="Send (Enter)">&#x2192;</button>
        </div>
      </div>
    </div>
  `;
}

function setupOverlayListeners() {
  document.getElementById('rs-close-btn')?.addEventListener('click', hideOverlay);
  document.getElementById('rs-send-btn')?.addEventListener('click', sendTextCommand);
  document.getElementById('rs-analyze-btn')?.addEventListener('click', analyzeScreen);
  document.getElementById('rs-approve-btn')?.addEventListener('click', () => approveAction(true));
  document.getElementById('rs-reject-btn')?.addEventListener('click', () => approveAction(false));

  const input = document.getElementById('rs-text-input');
  if (input) {
    // Stop key events from leaking to the page
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextCommand(); }
    });
    input.addEventListener('keyup',    e => e.stopPropagation());
    input.addEventListener('keypress', e => e.stopPropagation());
    setTimeout(() => input.focus(), 100);
  }

  // Mic hold-to-record
  const mic = document.getElementById('rs-mic-indicator');
  if (mic) {
    mic.addEventListener('mousedown',  (e) => { e.preventDefault(); startRecording(); });
    mic.addEventListener('mouseup',    () => stopAndTranscribe());
    mic.addEventListener('mouseleave', () => { if (isRecording) stopAndTranscribe(); });
    mic.addEventListener('touchstart', e => { e.preventDefault(); startRecording(); }, { passive: false });
    mic.addEventListener('touchend',   e => { e.preventDefault(); stopAndTranscribe(); }, { passive: false });
  }

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);

  // Draggable header
  makeDraggable(document.getElementById('rs-drag-handle'), overlayElement);
}

function handleEscapeKey(e) {
  if (e.key === 'Escape' && overlayElement) {
    e.preventDefault();
    hideOverlay();
  }
}

function makeDraggable(handle, target) {
  if (!handle || !target) return;
  let startX, startY, initLeft, initTop;
  handle.style.cursor = 'grab';

  handle.addEventListener('mousedown', e => {
    if (e.target.closest('.rs-close')) return;
    e.preventDefault();
    const rect = target.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initLeft = rect.left;
    initTop  = rect.top;
    handle.style.cursor = 'grabbing';

    function onMove(e) {
      const newLeft = Math.max(0, Math.min(window.innerWidth  - rect.width,  initLeft + e.clientX - startX));
      const newTop  = Math.max(0, Math.min(window.innerHeight - rect.height, initTop  + e.clientY - startY));
      target.style.right = 'auto';
      target.style.left  = `${newLeft}px`;
      target.style.top   = `${newTop}px`;
    }
    function onUp() {
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Microphone / recording ────────────────────────────────────────────────────
async function initMicrophone() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    updateOverlayState('idle');
    await playGreeting();
  } catch {
    updateOverlayState('error', { error: 'Mic access denied — you can still type commands below.' });
  }
}

async function playGreeting() {
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'SYNTHESIZE_SPEECH',
      text: "Hello, I'm your Resident Secretary. Ready to help.",
    });
    if (res?.audioBase64) await playAudioBase64(res.audioBase64);
  } catch { /* non-critical */ }
}

function startRecording() {
  if (!micStream || isRecording) return;
  audioChunks = [];
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';
  try {
    mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);
  } catch {
    mediaRecorder = new MediaRecorder(micStream);
  }
  mediaRecorder.ondataavailable = e => { if (e.data?.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start(100);
  isRecording = true;
  updateOverlayState('listening');
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  try { mediaRecorder.stop(); } catch { /* may already be stopped */ }
  isRecording = false;
}

async function stopAndTranscribe() {
  if (!isRecording) return;
  stopRecording();
  updateOverlayState('processing');
  // Wait for final ondataavailable event
  await new Promise(r => setTimeout(r, 350));

  const mimeType = mediaRecorder?.mimeType || 'audio/webm';
  const audioBlob = new Blob(audioChunks, { type: mimeType });
  if (audioBlob.size < 500) { updateOverlayState('idle'); return; }

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64Audio = arrayBufferToBase64(arrayBuffer);
    const response = await chrome.runtime.sendMessage({
      type: 'VOICE_COMMAND',
      payload: { audioBase64: base64Audio, mimeType, vapiRecording: null },
    });
    await handleAgentResponse(response);
  } catch (err) {
    updateOverlayState('error', { error: err.message });
    scheduleReset(6000);
  }
}

// Chunked base64 encoding — avoids stack overflow for large audio buffers
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function sendTextCommand() {
  const input = document.getElementById('rs-text-input');
  const text  = input?.value?.trim();
  if (!text) return;
  input.value = '';
  updateOverlayState('processing');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'VOICE_COMMAND',
      payload: { transcript: text, vapiRecording: null },
    });
    await handleAgentResponse(response);
  } catch (err) {
    updateOverlayState('error', { error: err.message });
    scheduleReset(6000);
  }
}

async function analyzeScreen() {
  updateOverlayState('processing');
  const st = document.getElementById('rs-status-text');
  if (st) st.textContent = 'Analyzing…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'ANALYZE_SCREEN' });
    await handleAgentResponse(response);
  } catch (err) {
    updateOverlayState('error', { error: err.message });
    scheduleReset(6000);
  }
}

async function handleAgentResponse(response) {
  if (!response || response.error) {
    updateOverlayState('error', { error: response?.error || 'No response from backend' });
    scheduleReset(6000);
    return;
  }

  // Non-blocking TTS
  if (response.responseText) {
    chrome.runtime.sendMessage({ type: 'SYNTHESIZE_SPEECH', text: response.responseText })
      .then(tts => { if (tts?.audioBase64) playAudioBase64(tts.audioBase64); })
      .catch(() => {});
  }

  if (response.requiresApproval && response.action) {
    currentAction = response.action;
    updateOverlayState('action_pending', {
      description: response.actionDescription || 'Execute this browser action?',
    });
  } else if (response.action) {
    updateOverlayState('processing');
    try {
      await executeBrowserAction(response.action);
      updateOverlayState('result', { text: response.responseText || 'Done!' });
      scheduleReset(4000);
    } catch (err) {
      updateOverlayState('error', { error: `Action failed: ${err.message}` });
      scheduleReset(6000);
    }
  } else {
    updateOverlayState('responding', { text: response.responseText || 'Got it.' });
    scheduleReset(8000);
  }
}

function scheduleReset(ms) {
  if (uiResetTimer) clearTimeout(uiResetTimer);
  uiResetTimer = setTimeout(() => {
    updateOverlayState('idle');
    uiResetTimer = null;
  }, ms);
}

async function playAudioBase64(base64) {
  try {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch { /* non-critical */ }
}

async function approveAction(approved) {
  const banner = document.getElementById('rs-approval-banner');
  if (banner) banner.style.display = 'none';
  if (approved && currentAction) {
    updateOverlayState('processing');
    try {
      await executeBrowserAction(currentAction);
      updateOverlayState('result', { text: 'Action completed.' });
      scheduleReset(4000);
    } catch (err) {
      updateOverlayState('error', { error: err.message });
      scheduleReset(6000);
    }
  } else {
    updateOverlayState('idle');
  }
  currentAction = null;
}

function updateOverlayState(state, data = {}) {
  if (!overlayElement) return;
  const statusText    = document.getElementById('rs-status-text');
  const micIndicator  = document.getElementById('rs-mic-indicator');
  const responseDiv   = document.getElementById('rs-response');
  const responseText  = document.getElementById('rs-response-text');
  const approvalBanner = document.getElementById('rs-approval-banner');

  micIndicator?.classList.remove('listening', 'processing', 'responding', 'error');

  ({
    idle: () => {
      if (statusText)    statusText.textContent = 'Hold mic to speak';
      if (responseDiv)   responseDiv.style.display   = 'none';
      if (approvalBanner) approvalBanner.style.display = 'none';
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
      if (statusText)   statusText.textContent   = 'Done';
      micIndicator?.classList.add('responding');
      if (responseDiv)  responseDiv.style.display = 'block';
      if (responseText) responseText.textContent   = data.text || '';
    },
    action_pending: () => {
      if (statusText)    statusText.textContent = 'Approval required';
      if (approvalBanner) {
        approvalBanner.style.display = 'block';
        const t = document.getElementById('rs-approval-text');
        if (t) t.textContent = data.description || 'Approve action?';
      }
    },
    result: () => {
      if (statusText)    statusText.textContent   = 'Done ✓';
      micIndicator?.classList.add('responding');
      if (responseDiv)   responseDiv.style.display = 'block';
      if (responseText)  responseText.textContent   = data.text || 'Action completed';
      if (approvalBanner) approvalBanner.style.display = 'none';
    },
    error: () => {
      if (statusText)   statusText.textContent   = 'Error';
      micIndicator?.classList.add('error');
      if (responseDiv)  responseDiv.style.display = 'block';
      if (responseText) responseText.textContent   = data.error || 'Something went wrong';
    },
  })[state]?.();
}

// ══════════════════════════════════════════════════════════════════════════════
//  BROWSER ACTION ENGINE
// ══════════════════════════════════════════════════════════════════════════════

// Escape special chars for CSS attribute selectors like [attr="..."]  
function cssEscape(str) {
  return str.replace(/["\\]/g, '\\$&');
}

function isVisible(el) {
  if (!el) return false;
  const s = window.getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Recursively search shadow DOM roots
function findInShadowDom(selector, root) {
  try {
    for (const host of root.querySelectorAll('*')) {
      if (!host.shadowRoot) continue;
      try {
        const el = host.shadowRoot.querySelector(selector);
        if (el && isVisible(el)) return el;
        const deeper = findInShadowDom(selector, host.shadowRoot);
        if (deeper) return deeper;
      } catch { /* cross-origin shadow root */ }
    }
  } catch { }
  return null;
}

// Search accessible iframes
function findInIframes(selector) {
  try {
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) continue;
        const el = findElement(selector, doc);
        if (el) return el;
      } catch { /* cross-origin */ }
    }
  } catch { }
  return null;
}

/**
 * findElement — 12 strategies + shadow DOM + iframe support.
 * Handles plain selectors, ID, placeholder, aria-label, name,
 * data-testid/cy/id, button text, title, label text, shadow DOM, iframes.
 */
function findElement(selector, context = document) {
  if (!selector) return null;
  const ctx = context || document;

  // 1. Direct CSS selector
  try {
    const el = ctx.querySelector(selector);
    if (el && isVisible(el)) return el;
  } catch { }

  // 2. Relaxed — strip pseudo-classes that may not match
  try {
    const relaxed = selector
      .replace(/:nth-(?:child|of-type|last-child|last-of-type)\([^)]*\)/g, '')
      .replace(/\s+/g, ' ').trim();
    if (relaxed && relaxed !== selector) {
      const el = ctx.querySelector(relaxed);
      if (el && isVisible(el)) return el;
    }
  } catch { }

  // Clean search term for attribute-based lookups
  const term = selector
    .replace(/[#.\[\]"'=><:*()^$|~+]/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
  if (!term) return null;

  const safe = cssEscape(term);

  // 3. Exact ID (bare #id or just the id text)
  const idMatch = selector.match(/^#([\w-]+)$/);
  if (idMatch) {
    const el = ctx.getElementById(idMatch[1]);
    if (el && isVisible(el)) return el;
  }

  // 4. Placeholder text
  const byPlaceholder = [...ctx.querySelectorAll('input, textarea')]
    .find(el => el.placeholder?.toLowerCase().includes(term) && isVisible(el));
  if (byPlaceholder) return byPlaceholder;

  // 5. aria-label
  try {
    const el = ctx.querySelector(`[aria-label*="${safe}" i]`);
    if (el && isVisible(el)) return el;
  } catch { }

  // 6. name attribute
  try {
    const el = ctx.querySelector(`[name="${safe}"]`) ||
               ctx.querySelector(`[name*="${safe}" i]`);
    if (el && isVisible(el)) return el;
  } catch { }

  // 7. data-testid / data-cy / data-id
  try {
    const el = ctx.querySelector(
      `[data-testid*="${safe}" i], [data-cy*="${safe}" i], [data-id*="${safe}" i]`
    );
    if (el && isVisible(el)) return el;
  } catch { }

  // 8. Button / link / role=button text content
  const clickables = [...ctx.querySelectorAll(
    'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], input[type="submit"], input[type="button"]'
  )];
  const byText = clickables.find(el =>
    el.textContent?.trim().toLowerCase().includes(term) && isVisible(el)
  );
  if (byText) return byText;

  // 9. title attribute
  try {
    const el = ctx.querySelector(`[title*="${safe}" i]`);
    if (el && isVisible(el)) return el;
  } catch { }

  // 10. <label> text -> associated input
  const byLabel = [...ctx.querySelectorAll('input, textarea, select')].find(el => {
    const lbl = el.id ? ctx.querySelector(`label[for="${el.id}"]`) : null;
    return lbl && lbl.textContent?.toLowerCase().includes(term) && isVisible(el);
  });
  if (byLabel) return byLabel;

  // 11. Shadow DOM
  const inShadow = findInShadowDom(selector, ctx);
  if (inShadow) return inShadow;

  // 12. Iframes (top-level context only)
  if (ctx === document) {
    const inFrame = findInIframes(selector);
    if (inFrame) return inFrame;
  }

  return null;
}

// Exponential-backoff retry for React/Vue/dynamic pages
async function findElementWithRetry(selector, maxMs = 5000) {
  let el = findElement(selector);
  if (el) return el;
  const delays = [150, 300, 600, 1200, 2400];
  let elapsed = 0;
  for (const delay of delays) {
    if (elapsed >= maxMs) break;
    await new Promise(r => setTimeout(r, delay));
    elapsed += delay;
    el = findElement(selector);
    if (el) return el;
  }
  return null;
}

// ── fillField ─────────────────────────────────────────────────────────────────
// Supports: React (native setter + full event chain), Vue 3, Angular,
//           contenteditable (Notion/Gmail/Slack/ProseMirror),
//           checkbox, radio, <select>, plain inputs.
async function fillField(selector, value) {
  const el = await findElementWithRetry(selector);
  if (!el) throw new Error(`Field not found: "${selector}"`);

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 100));
  el.focus();
  await new Promise(r => setTimeout(r, 50));

  // ── checkbox / radio ──────────────────────────────────────────────────────
  if (el.type === 'checkbox' || el.type === 'radio') {
    const shouldCheck = /^(true|1|on|yes|check|checked)$/i.test(value) || value === el.value;
    if (el.checked !== shouldCheck) el.click();
    return;
  }

  // ── <select> dropdown ─────────────────────────────────────────────────────
  if (el.tagName === 'SELECT') {
    const low = value.toLowerCase();
    const opt = [...el.options].find(o =>
      o.text.toLowerCase().includes(low) || o.value.toLowerCase() === low
    );
    if (opt) el.value = opt.value;
    else     el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    return;
  }

  // ── contenteditable (Notion, Gmail, Slack, ProseMirror, etc.) ────────────
  if (el.isContentEditable) {
    el.focus();
    document.execCommand('selectAll', false, null);
    const ok = document.execCommand('insertText', false, value);
    if (!ok) el.textContent = value; // fallback
    el.dispatchEvent(new InputEvent('input',  { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  // ── Standard input / textarea (React-compatible) ──────────────────────────
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (nativeSetter) nativeSetter.call(el, value);
  else              el.value = value;

  // Full event chain: React 16+, Vue 3, Angular, plain HTML all handled
  el.dispatchEvent(new Event('focus',       { bubbles: true }));
  el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: value, inputType: 'insertText' }));
  el.dispatchEvent(new InputEvent('input',  { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
  el.dispatchEvent(new Event('change',      { bubbles: true, cancelable: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', code: 'KeyA' }));
  el.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true, key: 'a', code: 'KeyA' }));
}

// ── clickElement ──────────────────────────────────────────────────────────────
// Full pointer + mouse event chain — handles React synthetic events,
// custom listeners, and native browser behavior.
async function clickElement(selector) {
  const el = await findElementWithRetry(selector);
  if (!el) throw new Error(`Element not found: "${selector}"`);

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 150));
  el.focus();

  const base    = { bubbles: true, cancelable: true };
  const pointer = { ...base, isPrimary: true, pointerId: 1 };
  const mouse   = { ...base, buttons: 1, button: 0 };

  el.dispatchEvent(new PointerEvent('pointerover',  pointer));
  el.dispatchEvent(new PointerEvent('pointerenter', pointer));
  el.dispatchEvent(new MouseEvent('mouseover',  base));
  el.dispatchEvent(new MouseEvent('mouseenter', base));
  el.dispatchEvent(new PointerEvent('pointerdown', pointer));
  el.dispatchEvent(new MouseEvent('mousedown',  mouse));
  el.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup',    { ...base, buttons: 0, button: 0 }));
  el.click();
  el.dispatchEvent(new MouseEvent('click',      { ...base, buttons: 0, button: 0 }));
  el.dispatchEvent(new MouseEvent('mouseleave', base));
  el.dispatchEvent(new PointerEvent('pointerleave', pointer));
}

// ── executeBrowserAction — main dispatcher ────────────────────────────────────
async function executeBrowserAction(action) {
  switch (action.type) {

    // Fill a text / select / checkbox field
    case 'fill_field':
      await fillField(action.selector, action.value ?? '');
      return { success: true };

    // Single click
    case 'click':
      await clickElement(action.selector);
      return { success: true };

    // Double click
    case 'double_click': {
      const el = await findElementWithRetry(action.selector);
      if (!el) throw new Error(`Element not found for double_click: "${action.selector}"`);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 100));
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }));
      return { success: true };
    }

    // Hover (mouseover / mouseenter / pointerover)
    case 'hover': {
      const el = await findElementWithRetry(action.selector);
      if (!el) throw new Error(`Element not found for hover: "${action.selector}"`);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, isPrimary: true }));
      return { success: true };
    }

    // Clear a field without typing new content
    case 'clear_field': {
      const el = await findElementWithRetry(action.selector);
      if (!el) throw new Error(`Field not found for clear_field: "${action.selector}"`);
      el.focus();
      const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter ? setter.call(el, '') : (el.value = '');
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }

    // Simulate a keyboard key press on an element (or active element)
    case 'press_key': {
      const el  = action.selector ? await findElementWithRetry(action.selector) : document.activeElement;
      const key = action.value || action.key || 'Enter';
      const opts = { bubbles: true, cancelable: true, key, code: key };
      (el || document.body).dispatchEvent(new KeyboardEvent('keydown',  opts));
      (el || document.body).dispatchEvent(new KeyboardEvent('keypress', opts));
      (el || document.body).dispatchEvent(new KeyboardEvent('keyup',    opts));
      return { success: true };
    }

    // Focus an element
    case 'focus': {
      const el = await findElementWithRetry(action.selector);
      if (!el) throw new Error(`Element not found for focus: "${action.selector}"`);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      return { success: true };
    }

    // Select a <select> option (alias)
    case 'select_option':
      await fillField(action.selector, action.value ?? '');
      return { success: true };

    // Copy text to clipboard
    case 'copy_clipboard':
      await navigator.clipboard.writeText(action.text ?? '');
      return { success: true };

    // Inject HTML overlay on the page
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

    // Navigate current tab
    case 'navigate':
      if (!action.url) throw new Error('navigate requires a url');
      window.location.href = action.url;
      return { success: true };

    // Open in new tab
    case 'open_tab':
      if (!action.url) throw new Error('open_tab requires a url');
      window.open(action.url, '_blank', 'noopener,noreferrer');
      return { success: true };

    // Scroll to element or coordinates
    case 'scroll_to': {
      const target = action.selector ? findElement(action.selector) : null;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollTo({ top: action.y ?? 0, left: action.x ?? 0, behavior: 'smooth' });
      }
      return { success: true };
    }

    default:
      throw new Error(`Unknown action type: "${action.type}"`);
  }
}
