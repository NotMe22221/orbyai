// Service worker for Resident Secretary
// Voice pipeline: ElevenLabs STT + TTS + Screen capture for visual analysis

let currentSessionId = null;
let overlayActive = false;

// ── Backend URL ────────────────────────────────────────────────
const DEFAULT_BACKEND = 'https://565ybsck.run.complete.dev';

async function getBackendUrl() {
  try {
    const { backendUrl } = await chrome.storage.sync.get('backendUrl');
    return backendUrl || DEFAULT_BACKEND;
  } catch {
    return DEFAULT_BACKEND;
  }
}

// ── Safe JSON fetch (handles HTML error pages gracefully) ──────
async function safeJsonFetch(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkErr) {
    throw new Error(`Network error reaching ${url}: ${networkErr.message}. Check your backend URL in the extension popup.`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Server returned HTML (404/500 page) — likely wrong URL or deployment issue
    throw new Error(
      `Backend at ${new URL(url).hostname} returned a ${response.status} HTML page instead of JSON. ` +
      `Open the extension popup and update the Backend URL to your Vercel deployment URL.`
    );
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Backend error ${response.status}`);
  }
  return data;
}

// ── Hotkey / toolbar click ──────────────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => { await toggleOverlay(tab); });

chrome.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await toggleOverlay(tab);
  }
});

async function toggleOverlay(tab) {
  overlayActive = !overlayActive;
  if (overlayActive) {
    currentSessionId = generateSessionId();
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_OVERLAY', sessionId: currentSessionId });
  } else {
    await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_OVERLAY' });
    currentSessionId = null;
  }
}

// ── Message router ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VOICE_COMMAND') {
    handleVoiceCommand(message.payload, sender.tab)
      .then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'ANALYZE_SCREEN') {
    handleAnalyzeScreen(sender.tab)
      .then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'SYNTHESIZE_SPEECH') {
    synthesizeSpeech(message.text)
      .then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'OVERLAY_CLOSED') {
    overlayActive = false;
    currentSessionId = null;
  }
  if (message.type === 'SET_BACKEND_URL') {
    chrome.storage.sync.set({ backendUrl: message.url })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// ── Screenshot capture ──────────────────────────────────────────
async function captureScreenshot() {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    return dataUrl.replace(/^data:image\/png;base64,/, '');
  } catch (err) {
    console.warn('[Screenshot] Capture failed:', err.message);
    return null;
  }
}

// ── Voice command (auto-attaches screenshot) ───────────────────────
async function handleVoiceCommand(payload, tab) {
  let transcript = payload.transcript;
  let recordingId = null;

  if (!transcript && payload.audioBase64) {
    const backend = await getBackendUrl();
    // ✅ Use safeJsonFetch — detects HTML responses and gives clear error
    const sttData = await safeJsonFetch(`${backend}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: payload.audioBase64, mimeType: payload.mimeType || 'audio/webm' })
    });
    transcript = sttData.transcript;
    recordingId = sttData.recordingId;
  }

  const [screenshotBase64, context, backend] = await Promise.all([
    captureScreenshot(),
    getPageContext(tab),
    getBackendUrl(),
  ]);

  // ✅ Use safeJsonFetch for voice call too
  return await safeJsonFetch(`${backend}/api/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: currentSessionId,
      transcript,
      pageContext: context,
      vapiRecording: recordingId,
      screenshotBase64,
    })
  });
}

// ── Dedicated screen analysis ──────────────────────────────────────
async function handleAnalyzeScreen(tab) {
  const [screenshotBase64, context, backend] = await Promise.all([
    captureScreenshot(),
    getPageContext(tab),
    getBackendUrl(),
  ]);

  if (!screenshotBase64) {
    return { responseText: 'Screenshot capture failed. Please grant screen capture permission and try again.' };
  }

  return await safeJsonFetch(`${backend}/api/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: currentSessionId || generateSessionId(),
      transcript: 'Analyze what is on this screen. Describe the main content, key interactive elements (buttons, inputs, links), the page purpose, and suggest the single most useful action I could take right now.',
      pageContext: context,
      vapiRecording: null,
      screenshotBase64,
    })
  });
}

// ── TTS ─────────────────────────────────────────────────────────
async function synthesizeSpeech(text) {
  const backend = await getBackendUrl();
  return await safeJsonFetch(`${backend}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}

// ── Page context ─────────────────────────────────────────────────────
async function getPageContext(tab) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: window.location.href,
        title: document.title,
        pageType: detectPageType(window.location.href),
        selectedText: window.getSelection()?.toString() || '',
        bodyText: document.body?.innerText?.slice(0, 5000) || ''
      })
    });
    return result[0]?.result || {};
  } catch {
    return { url: tab?.url || '', title: tab?.title || '', pageType: 'generic' };
  }
}

function detectPageType(url) {
  if (url.includes('github.com')) return 'github';
  if (url.includes('gmail.com') || url.includes('mail.google.com')) return 'gmail';
  if (url.includes('notion.so')) return 'notion';
  if (url.includes('linear.app')) return 'linear';
  return 'generic';
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
