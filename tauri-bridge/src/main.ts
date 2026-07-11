// SyncBridge Webview Entrypoint
import { listen } from '@tauri-apps/api/event';

const statusBadge = document.getElementById('bridge-status-badge');
const statusText  = document.getElementById('bridge-status-text');
const sessionSpan = document.getElementById('active-sessions');
const logEl       = document.getElementById('activity-log');

function appendLog(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  if (!logEl) return;
  const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${now}</span><span class="log-msg ${type}">${msg}</span>`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

// Listen to bridge_status events emitted by Rust
listen<{ status: string; sessions: number; message?: string }>('bridge_status', (event) => {
  const { status, sessions, message } = event.payload;

  if (statusText) statusText.textContent = status.toUpperCase();
  if (sessionSpan) sessionSpan.textContent = String(sessions);

  if (statusBadge) {
    statusBadge.className = `status-badge ${status === 'active' ? 'active' : 'error'}`;
  }

  if (message) {
    const type = status === 'active' ? 'success' : status === 'error' ? 'error' : 'info';
    appendLog(message, type);
  }
});

// Verify local HTTPS is reachable (proxy health check from webview)
async function checkBridgeHealth() {
  try {
    const res = await fetch('https://local-syncboard.luiskobayashi.com:4401/detect-penpot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(3000),
    });
    if (res.status === 200 || res.status === 422) {
      if (statusText) statusText.textContent = 'ACTIVE';
      if (statusBadge) statusBadge.className = 'status-badge active';
      appendLog('Bridge server confirmed reachable on port 4401.', 'success');
    }
  } catch {
    if (statusText) statusText.textContent = 'ERROR';
    if (statusBadge) statusBadge.className = 'status-badge error';
    appendLog('Bridge server not reachable — SSL certificate may be missing.', 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  appendLog('SyncBridge starting…', 'info');
  setTimeout(checkBridgeHealth, 1500);
});
