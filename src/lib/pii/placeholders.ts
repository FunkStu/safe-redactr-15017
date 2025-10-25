import type { Label } from './types';

export function makePlaceholder(label: Label, text: string, deterministic: boolean): string {
  if (!deterministic) {
    // Random unique placeholder
    const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `[${label}_${rand}]`;
  }
  
  // Deterministic: hash the text to create consistent placeholder
  const hash = simpleHash(text.toLowerCase());
  return `[${label}_${hash}]`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 8).toUpperCase();
}
