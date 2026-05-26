import { CalcResult, PartsMaster } from './types';
import { DEFAULT_PARTS_MASTER } from './scaffold';

const MASTER_KEY = 'scaffold:master';
const PROJECT_PREFIX = 'scaffold:project:';

export function getMaster(): PartsMaster {
  if (typeof window === 'undefined') return DEFAULT_PARTS_MASTER;
  try {
    const raw = localStorage.getItem(MASTER_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_PARTS_MASTER;
  } catch {
    return DEFAULT_PARTS_MASTER;
  }
}

export function saveMaster(master: PartsMaster): void {
  localStorage.setItem(MASTER_KEY, JSON.stringify(master));
}

export function resetMaster(): void {
  localStorage.removeItem(MASTER_KEY);
}

export function saveProject(result: CalcResult): void {
  const key = PROJECT_PREFIX + Date.now();
  localStorage.setItem(key, JSON.stringify({ ...result, savedAt: new Date().toISOString() }));
}

export function listProjects(): CalcResult[] {
  const results: CalcResult[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PROJECT_PREFIX)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) results.push(JSON.parse(raw));
      } catch {}
    }
  }
  return results
    .sort((a, b) => new Date(b.savedAt!).getTime() - new Date(a.savedAt!).getTime())
    .slice(0, 5);
}
