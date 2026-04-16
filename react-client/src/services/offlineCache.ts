const STORAGE_KEY = 'scholarmind_offline_state';

interface PersistedState {
  sessions: unknown[];
  tasksById: Record<string, unknown>;
  chatMessagesBySession: Record<string, unknown[]>;
  savedAt: string;
}

export function persistState(
  sessions: unknown[],
  tasksById: Record<string, unknown>,
  chatMessagesBySession: Record<string, unknown[]>,
): void {
  try {
    const payload: PersistedState = {
      sessions,
      tasksById,
      chatMessagesBySession,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage quota exceeded or unavailable — silently skip
  }
}

export function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
