import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TOGGLE_FILE = join('/tmp', 'sapa-ai-toggle.json');

export interface ToggleState {
  aiEnabled: boolean;
  detEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

export function readToggleState(): ToggleState {
  try {
    if (existsSync(TOGGLE_FILE)) {
      const raw = readFileSync(TOGGLE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // ignore corrupt file
  }
  return { aiEnabled: true, detEnabled: true, updatedAt: new Date().toISOString(), updatedBy: 'default' };
}

export function writeToggleState(state: ToggleState): void {
  writeFileSync(TOGGLE_FILE, JSON.stringify(state, null, 2));
}

/** Check if AI is enabled via admin toggle. Default: true (enabled). */
export function isAiToggleEnabled(): boolean {
  return readToggleState().aiEnabled;
}

/** Check if Deterministic is enabled via admin toggle. Default: true (enabled). */
export function isDetToggleEnabled(): boolean {
  return readToggleState().detEnabled;
}
