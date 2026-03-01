// background.js \u2014 Resident Secretary Service Worker v1.2
// Handles keyboard shortcut (toggle-overlay) and all content-script messages.
// Toolbar click is now handled by the popup directly (popup.js).

const DEFAULT_BACKEND = 'https://565ybsck.run.complete.dev';

// Per-tab overlay state (tabId \u2192 boolean)
const overlayStates = new Map();
let currentSessionId = null;

async function getBackendUrl() {
  try {
    const { backendUrl } = await chrome.storage.sync.get('backendUrl');
    return backendUrl || DEFAULT_BACKEND;
  } catch {
    return DEFAULT_BACKEND;
  }
}

// \u2500\u2500 Keyboard shortcut (Cmd+Shift+Space) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nchrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-overlay') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await toggleOverlay(tab);
  } catch (err) {
    console.error('[RS] Command handler failed:', err.message);
  }
});

async function toggleOverlay(tab) {
  if (!tab?.id) return;
  if (
    tab.url?.startsWith('chrome://') ||
    tab.url?.startsWith('chrome-extension://') ||
    tab.url?.startsWith('about:') ||
    tab.url?.startsWith('edge://')
  ) {
    console.warn('[RS] Cannot activate on restricted URL:', tab.url);
    return;
  }

  const isActive = overlayStates.get(tab.id) ?? false;

  if (!isActive) {
    await ensureContentScript(tab.id);
    currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    overlayStates.set(tab.id, true);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_OVERLAY', sessionId: currentSessionId });
    } catch (err) {
      console.error('[RS] SHOW_OVERLAY failed:', err.message);
      overlayStates.set(tab.id, false);
    }
  } else {
    overlayStates.set(tab.id, false);
    currentSessionId = null;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_OVERLAY' });
    } catch { /* content script may have unloaded */ }
  }
}

async function ensureContentScript(tabId) {
  // Check if content script is responding
  try {
    await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: 'PING' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 700)),
    ]);
    return; // Already loaded and responding
  } catch { /* Not loaded or not responding, inject below */ }

  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['overlay.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content_script.js'] });
    await new Promise(r => setTimeout(r, 400));
  } catch (err) {
    console.error('[RS] Injection failed:', err.message);
  }
}

// \u2500\u2500 Tab lifecycle \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nchrome.tabs.onRemoved.addListener((tabId) => overlayStates.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') overlayStates.set(tabId, false);
});

// \u2500\u2500 Message router \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ pong: true });
      return true;

    case 'OVERLAY_CLOSED':
      if (sender.tab?.id) overlayStates.set(sender.tab.id, false);
      currentSessionId = null;
      break;

    case 'OVERLAY_OPENED':
      if (sender.tab?.id) overlayStates.set(sender.tab.id, true);
      break;

    case 'VOICE_COMMAND':
      handleVoiceCommand(message.payload, sender.tab)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'ANALYZE_SCREEN':
      handleAnalyzeScreen(sender.tab)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'SYNTHESIZE_SPEECH':
      synthesizeSpeech(message.text)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'SET_BACKEND_URL':
      chrome.storage.sync.set({ backendUrl: message.url })
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'GET_BACKEND_URL':
      getBackendUrl().then(url => sendResponse({ url }));
      return true;
  }
});

// \u2500\u2500 Screenshot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nasync function captureScreenshot(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(
      tab?.windowId ?? null,
      { format: 'png', quality: 80 }
    );
    return dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
  } catch (err) {
    console.warn('[RS] Screenshot failed:', err.message);
    return null;
  }
}

// \u2500\u2500 Page context (detectPageType inlined \u2014 service worker scope is inaccessible in executeScript) \u2500\u2500
async function getPageContext(tab) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        function getPageType(url) {
          if (url.includes('github.com'))                               return 'github';
          if (url.includes('gmail.com') || url.includes('mail.google')) return 'gmail';
          if (url.includes('notion.so'))                                return 'notion';
          if (url.includes('linear.app'))                               return 'linear';
          if (url.includes('docs.google.com'))                          return 'gdocs';
          if (url.includes('slack.com'))                                return 'slack';
          if (url.includes('twitter.com') || url.includes('x.com'))    return 'twitter';
          if (url.includes('linkedin.com'))                             return 'linkedin';
          return 'generic';
        }
        const inputs = [...document.querySelectorAll(
          'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), textarea, select'
        )].slice(0, 30).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || '',
          name: el.getAttribute('name') || '',
          id: el.id || '',
          placeholder: el.getAttribute('placeholder') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          label: (() => {
            const lbl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
            return lbl?.textContent?.trim() || '';
          })(),
        }));
        const buttons = [...document.querySelectorAll(
          'button, [role="button"], input[type="submit"], input[type="button"]'
        )].slice(0, 20).map(el => ({
          text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 80),
          id: el.id || '',
        })).filter(b => b.text);
        return {
          url: window.location.href,
          title: document.title,
          pageType: getPageType(window.location.href),
          selectedText: (window.getSelection()?.toString() || '').slice(0, 2000),
          bodyText: (document.body?.innerText || '').replace(/\s{3,}/g, '\n\n').slice(0, 4000),
          inputs,
          buttons,
        };
      },
    });
    return result[0]?.result || {};
  } catch (err) {
    console.warn('[RS] getPageContext failed:', err.message);
    return { url: tab?.url || '', title: tab?.title || '', pageType: 'generic', inputs: [], buttons: [] };
  }
}

// \u2500\u2500 Voice command \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function handleVoiceCommand(payload, tab) {
  let transcript = payload.transcript || '';
  let recordingId = null;

  if (!transcript && payload.audioBase64) {
    const backend = await getBackendUrl();
    const sttRes = await fetch(`${backend}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: payload.audioBase64, mimeType: payload.mimeType || 'audio/webm' }),
    });
    if (!sttRes.ok) throw new Error(`STT error ${sttRes.status}`);
    const d = await sttRes.json();
    transcript = d.transcript || '';
    recordingId = d.recordingId || null;
  }

  if (!transcript.trim()) throw new Error('Empty transcript');

  const [screenshotBase64, context, backend] = await Promise.all([
    captureScreenshot(tab),
    getPageContext(tab),
    getBackendUrl(),
  ]);

  const res = await fetch(`${backend}/api/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: currentSessionId || `sess_${Date.now()}`,
      transcript, pageContext: context, vapiRecording: recordingId, screenshotBase64,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Backend ${res.status}: ${t.slice(0, 200)}`);
  }
  return await res.json();
}

// \u2500\u2500 Screen analysis \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nasync function handleAnalyzeScreen(tab) {
  const [screenshotBase64, context, backend] = await Promise.all([
    captureScreenshot(tab), getPageContext(tab), getBackendUrl(),
  ]);
  if (!screenshotBase64) return { responseText: 'Screenshot capture failed.' };
  const res = await fetch(`${backend}/api/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: currentSessionId || `sess_${Date.now()}`,
      transcript: 'Analyze this screen: describe the main content, key interactive elements (forms, buttons, links), the page purpose, and suggest the single most useful action I could take right now.',
      pageContext: context, vapiRecording: null, screenshotBase64,
    }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  return await res.json();
}

// \u2500\u2500 TTS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nasync function synthesizeSpeech(text) {
  const backend = await getBackendUrl();
  const res = await fetch(`${backend}/api/tts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  return await res.json();
}
