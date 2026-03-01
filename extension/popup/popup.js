document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      statusEl.textContent = `Active on: ${new URL(tab.url).hostname}`;
    }
  } catch {
    statusEl.textContent = 'Ready';
  }
});
