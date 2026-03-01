// popup.js — Resident Secretary v1.2
// Handles toolbar-click activation: detects tab, injects if needed, toggles overlay.
// This runs in the popup context (NOT the service worker), so it's always available.

document.addEventListener('DOMContentLoaded', async () => {
  const btn       = document.getElementById('activate-btn');
  const btnText   = document.getElementById('btn-text');
  const btnIcon   = document.getElementById('btn-icon');
  const pageName  = document.getElementById('page-name');
  const pageDot   = document.getElementById('page-dot');
  const statusMsg = document.getElementById('status-msg');

  let activeTab = null;
  let overlayIsOpen = false;

  function showError(msg) {
    statusMsg.textContent = msg;
    statusMsg.className = 'error';
    btn.disabled = false;
    btnText.textContent = 'Activate on this page';
    btnIcon.textContent = '\u26A1';
    btn.classList.remove('close-mode');
  }

  function showInfo(msg) {
    statusMsg.textContent = msg;
    statusMsg.className = 'info';
  }

  // ── Detect active tab ────────────────────────────────────────────────────
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    if (!tab?.url) {
      pageName.textContent = 'No page detected';
      showError('Could not detect the active tab.');
      return;
    }

    const BLOCKED = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];
    if (BLOCKED.some(p => tab.url.startsWith(p))) {
      pageDot.classList.add('off');
      pageName.textContent = 'Restricted page';
      showError("Can't activate here \u2014 navigate to a regular website first.");
      return;
    }

    try {
      pageName.textContent = new URL(tab.url).hostname || tab.url;
    } catch {
      pageName.textContent = tab.url.slice(0, 50);
    }

    // ── Check if overlay is already open ──────────────────────────────────
    try {
      const res = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: 'GET_OVERLAY_STATUS' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 600)),
      ]);
      if (res?.visible) {
        overlayIsOpen = true;
        btnText.textContent = 'Close Assistant';
        btnIcon.textContent = '\u2715';
        btn.classList.add('close-mode');
      }
    } catch { /* not loaded yet, that's fine */ }

    btn.disabled = false;

  } catch (e) {
    pageName.textContent = 'Error';
    showError('Tab detection failed: ' + e.message);
    return;
  }

  // ── Activate / Close button ──────────────────────────────────────────────
  btn.addEventListener('click', async () => {
    if (!activeTab?.id) return;
    btn.disabled = true;
    statusMsg.className = '';

    // ── Close path ──
    if (overlayIsOpen) {
      btnText.textContent = 'Closing\u2026';
      try {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'HIDE_OVERLAY' });
      } catch { /* already closed */ }
      window.close();
      return;
    }

    // ── Open path ──
    btnText.textContent = 'Activating\u2026';
    btnIcon.textContent = '\u23F3';

    try {
      // Step 1: Check if content script is alive (PING with timeout)
      let loaded = false;
      try {
        const pong = await Promise.race([
          chrome.tabs.sendMessage(activeTab.id, { type: 'PING' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 700)),
        ]);
        loaded = !!pong?.pong;
      } catch { /* not loaded or timed out */ }

      // Step 2: Inject CSS + JS if content script isn't loaded yet
      if (!loaded) {
        showInfo('Injecting assistant\u2026');
        try {
          await chrome.scripting.insertCSS({
            target: { tabId: activeTab.id },
            files: ['overlay.css'],
          });
        } catch { /* already injected or failed — continue anyway */ }
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content_script.js'],
          });
        } catch { /* already injected or failed — continue anyway */ }
        // Wait for script to initialize
        await new Promise(r => setTimeout(r, 400));
      }

      // Step 3: Show overlay
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await chrome.tabs.sendMessage(activeTab.id, { type: 'SHOW_OVERLAY', sessionId });

      // Close popup — overlay is now on the page
      window.close();

    } catch (e) {
      showError(`Failed: ${e.message}. Try refreshing the page and clicking again.`);
    }
  });
});
