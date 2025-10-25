import type { Entity } from './types';

/**
 * Redacts text by replacing entities with placeholders in descending order.
 * Includes self-healing span rescue for misaligned positions.
 */
export function redactText(
  text: string,
  entities: Entity[],
  deterministic = true
): { redactedText: string; redactionMap: Map<string, string> } {
  if (!entities?.length) return { redactedText: text, redactionMap: new Map() };

  // 1️⃣ Deduplicate and sort in descending order (highest start first)
  const unique = entities.filter(
    (e, i, arr) => i === arr.findIndex(x => x.start === e.start && x.end === e.end)
  );
  const sorted = [...unique].sort((a, b) => b.start - a.start);

  // 2️⃣ Prepare output and mapping
  let output = text;
  const map = new Map<string, string>();

  // 3️⃣ Replace in descending order to avoid index drift
  for (const e of sorted) {
    // ✅ tolerant span alignment with fuzzy matching
    let start = e.start;
    let end = e.end;
    const window = 64;
    const snippet = output.slice(Math.max(0, start - window), Math.min(output.length, end + window));
    const local = snippet.indexOf(e.text);
    
    if (local !== -1) {
      start = Math.max(0, start - window) + local;
      end = start + e.text.length;
    } else if (output.slice(start, end).trim() !== e.text.trim()) {
      console.warn('Skipping unmatched entity:', e.text);
      continue;
    }

    const token = deterministic
      ? `${e.label}_${btoa(e.text).slice(0, 6).toUpperCase()}`
      : `${e.label}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    map.set(token, e.text);
    output =
      output.slice(0, start) +
      `[${token}]` +
      output.slice(end);
  }

  console.log('Redacted entities used:', Array.from(map.entries()));
  return { redactedText: output, redactionMap: map };
}
