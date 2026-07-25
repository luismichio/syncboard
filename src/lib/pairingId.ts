const PAIRING_ID_STORAGE_KEY = 'syncboard_pairing_id';
const PAIRING_ID_PREFIX = 'sb_';
const PAIRING_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PAIRING_LENGTH = 16;

function generateSecurePairingId(): string {
  const randomBytes = new Uint8Array(PAIRING_LENGTH);
  window.crypto.getRandomValues(randomBytes);

  let id = PAIRING_ID_PREFIX;
  for (let i = 0; i < randomBytes.length; i++) {
    id += PAIRING_CHARS[randomBytes[i] % PAIRING_CHARS.length];
  }

  return id;
}

function generateFallbackPairingId(): string {
  return (
    PAIRING_ID_PREFIX +
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
  );
}

export function getOrCreatePairingId(): string {
  if (typeof window === 'undefined') return '';

  const existing = localStorage.getItem(PAIRING_ID_STORAGE_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  let newId: string;
  try {
    newId = generateSecurePairingId();
  } catch {
    newId = generateFallbackPairingId();
  }

  localStorage.setItem(PAIRING_ID_STORAGE_KEY, newId);
  return newId;
}

export function rotatePairingId(): string {
  let newId: string;
  try {
    newId = generateSecurePairingId();
  } catch {
    newId = generateFallbackPairingId();
  }

  localStorage.setItem(PAIRING_ID_STORAGE_KEY, newId);
  return newId;
}
