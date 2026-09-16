function storageKey(code: string): string {
  return `pulse_host_${code.toUpperCase()}`;
}

export function saveHostToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(storageKey(code), token);
  } catch {
    // private mode / quota
  }
}

export function readHostToken(code: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(code));
  } catch {
    return null;
  }
}

export function normalizeCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}
