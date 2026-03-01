// Service worker for Resident Secretary
// Voice pipeline: ElevenLabs STT + TTS (Vapi removed)

let currentSessionId = null;
let overlayActive = false;

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VOICE_COMMAND') {
    handleVoiceCommand(message.payload, sender.tab)
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
});

async function handleVoiceCommand(payload, tab) {
  // If raw audio sent, transcribe via ElevenLabs STT first
  let transcript = payload.transcript;
  let recordingId = null;

  if (!transcript && payload.audioBase64) {
    const sttResult = await fetch(`${getBackendUrl()}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: payload.audioBase64, mimeType: payload.mimeType || 'audio/webm' })
    });
    const sttData = await sttResult.json();
    transcript = sttData.transcript;
    recordingId = sttData.recordingId; // chain this through agents
  }

  const context = await getPageContext(tab);
  const response = await fetch(`${getBackendUrl()}/api/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: currentSessionId,
      transcript,
      pageContext: context,
      vapiRecording: recordingId // now carries ElevenLabs recording ID
    })
  });
  if (!response.ok) throw new Error(`Backend error: ${response.status}`);
  return await response.json();
}

async function synthesizeSpeech(text) {
  const response = await fetch(`${getBackendUrl()}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error(`TTS error: ${response.status}`);
  return await response.json(); // { audioBase64: string }
}

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
    return { url: tab.url, title: tab.title, pageType: 'generic' };
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

function getBackendUrl() {
  return 'http://localhost:3000';
}
