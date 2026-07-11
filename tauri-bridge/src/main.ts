// SyncBridge Webview Entrypoint
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

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

// Proactively pull initial status on load to prevent event timing race conditions
async function initStatus() {
  try {
    const initial = await invoke<{ status: string; sessions: number }>('get_bridge_status');
    if (statusText) statusText.textContent = initial.status.toUpperCase();
    if (sessionSpan) sessionSpan.textContent = String(initial.sessions);
    if (statusBadge) {
      statusBadge.className = `status-badge ${initial.status === 'active' ? 'active' : 'error'}`;
    }
    appendLog('Connected to bridge core.', 'success');
  } catch (err) {
    appendLog('Failed to fetch bridge core status: ' + err, 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  appendLog('SyncBridge starting…', 'info');
  initStatus();
});
