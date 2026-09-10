import { DEFAULT_DEMO_SEED } from './data.ts';

const storageKey = 'walter-demo-v1';

function readSettings(): { asOf: string; seed: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (
      Number.isInteger(saved?.seed) &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(saved?.asOf)
    ) {
      return saved;
    }
  } catch {
    /* A fresh demo also works when browser storage is unavailable. */
  }
  return {
    asOf: new Date().toISOString().slice(0, 7),
    seed: DEFAULT_DEMO_SEED,
  };
}

export function saveSettings(settings: { asOf: string; seed: number }) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    /* Storage is optional; the default seed still gives a stable demo. */
  }
}

export const settings = readSettings();
