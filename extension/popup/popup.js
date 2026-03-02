const DEFAULT_BACKEND = 'https://565ybsck.run.complete.dev';

const urlInput   = document.getElementById('url-input');
const saveBtn    = document.getElementById('save-btn');
const testBtn    = document.getElementById('test-btn');
const statusDot  = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const activeUrl  = document.getElementById('active-url');

function setStatus(state, msg) {
  statusDot.className = 'dot';
  const map = { ok: 'dot-ok', err: 'dot-err', idle: 'dot-idle', checking: 'dot-checking' };
  statusDot.classList.add(map[state] || 'dot-idle');
  statusText.textContent = msg;
}

async function loadSaved() {
  const { backendUrl } = await chrome.storage.sync.get('backendUrl');
  const url = backendUrl || DEFAULT_BACKEND;
  urlInput.value = url;
  activeUrl.textContent = `Active: ${url}`;
}

async function saveUrl() {
  const url = urlInput.value.trim().replace(/\/$/, '');
  if (!url) { setStatus('err', 'URL cannot be empty'); return; }
  try { new URL(url); } catch { setStatus('err', 'Invalid URL format'); return; }
  await chrome.storage.sync.set({ backendUrl: url });
  activeUrl.textContent = `Active: ${url}`;
  setStatus('ok', 'URL saved!');
  setTimeout(() => setStatus('idle', 'URL saved — click Test to verify'), 1500);
}

async function testConnection() {
  const url = urlInput.value.trim().replace(/\/$/, '') || DEFAULT_BACKEND;
  setStatus('checking', 'Testing connection…');
  testBtn.disabled = true;
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      setStatus('err', `Got HTML instead of JSON (${res.status}) — wrong URL or deployment issue`);
      return;
    }
    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      const mocks = data.env?.mocks ? ' (mock mode)' : '';
      setStatus('ok', `Connected ✓ — ElevenLabs: ${data.env?.elevenlabs ? '✓' : '✗'} | DeployAI: ${data.env?.deployAI ? '✓' : '✗'}${mocks}`);
    } else {
      setStatus('err', `Server responded but status: ${data.status || res.status}`);
    }
  } catch (err) {
    if (err.name === 'TimeoutError') {
      setStatus('err', 'Connection timed out — check URL');
    } else {
      setStatus('err', `Cannot reach backend: ${err.message}`);
    }
  } finally {
    testBtn.disabled = false;
  }
}

saveBtn.addEventListener('click', saveUrl);
testBtn.addEventListener('click', testConnection);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveUrl(); });

document.addEventListener('DOMContentLoaded', loadSaved);
loadSaved();
