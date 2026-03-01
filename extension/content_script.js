// Content script for Resident Secretary
// Handles overlay injection, DOM capture, and browser action execution

let overlayElement = null;
let overlayState = 'idle';
let sessionId = null;
let currentAction = null;
let vapiActive = false;

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
  requestMicPermission();
}

function hideOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
    overlayState = 'idle';
  }
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
          <div class="rs-mic-indicator" id="rs-mic-indicator" title="Click to activate voice"></div>
          <p class="rs-status-text" id="rs-status-text">Click mic to start</p>
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
  document.getElementById('rs-mic-indicator')?.addEventListener('click', toggleVoice);
  document.getElementById('rs-send-btn')?.addEventListener('click', sendTextCommand);
  document.getElementById('rs-text-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendTextCommand();
  });
  document.getElementById('rs-approve-btn')?.addEventListener('click', () => approveAction(true));
  document.getElementById('rs-reject-btn')?.addEventListener('click', () => approveAction(false));
}

function updateOverlayState(state, data = {}) {
  overlayState = state;
  const statusText = document.getElementById('rs-status-text');
  const micIndicator = document.getElementById('rs-mic-indicator');
  const responseDiv = document.getElementById('rs-response');
  const responseText = document.getElementById('rs-response-text');
  const approvalBanner = document.getElementById('rs-approval-banner');

  micIndicator?.classList.remove('listening', 'processing', 'responding', 'error');

  const states = {
    idle: () => { if (statusText) statusText.textContent = 'Click mic to start'; },
    listening: () => {
      if (statusText) statusText.textContent = 'Listening...';
      micIndicator?.classList.add('listening');
    },
    processing: () => {
      if (statusText) statusText.textContent = 'Processing...';
      micIndicator?.classList.add('processing');
    },
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

async function requestMicPermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    updateOverlayState('error', { error: 'Microphone permission denied' });
  }
}

async function toggleVoice() {
  if (!vapiActive) {
    updateOverlayState('listening');
    vapiActive = true;
    // TODO: Initialize Vapi WebRTC session
  } else {
    vapiActive = false;
    updateOverlayState('idle');
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
  if (response.error) {
    updateOverlayState('error', { error: response.error });
    return;
  }
  if (response.requiresApproval) {
    currentAction = response.action;
    updateOverlayState('action_pending', { description: response.actionDescription });
  } else if (response.action) {
    updateOverlayState('processing');
    await executeBrowserAction(response.action);
    updateOverlayState('result', { text: response.responseText });
  } else {
    updateOverlayState('responding', { text: response.responseText });
  }
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

async function executeBrowserAction(action) {
  switch (action.type) {
    case 'fill_field': {
      const el = document.querySelector(action.selector);
      if (!el) throw new Error(`Element not found: ${action.selector}`);
      el.focus();
      el.value = action.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }
    case 'click': {
      const el = document.querySelector(action.selector);
      if (!el) throw new Error(`Element not found: ${action.selector}`);
      el.click();
      return { success: true };
    }
    case 'copy_clipboard':
      await navigator.clipboard.writeText(action.text);
      return { success: true };
    case 'inject_overlay': {
      const container = document.createElement('div');
      container.id = 'rs-injected-overlay';
      container.innerHTML = action.html;
      document.body.appendChild(container);
      return { success: true };
    }
    case 'navigate':
      window.location.href = action.url;
      return { success: true };
    case 'open_tab':
      window.open(action.url, '_blank');
      return { success: true };
    case 'scroll_to':
      if (action.selector) {
        document.querySelector(action.selector)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: action.y || 0, left: action.x || 0, behavior: 'smooth' });
      }
      return { success: true };
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
