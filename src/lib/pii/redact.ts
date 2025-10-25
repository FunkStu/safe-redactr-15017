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
    // verify entity text still matches expected slice
    const spanText = output.slice(e.start, e.end);
    if (!spanText || !e.text || spanText.trim() !== e.text.trim()) {
      // optional safety rescue if needed:
      const i = output.indexOf(e.text);
      if (i === -1) continue;
      e.start = i;
      e.end = i + e.text.length;
    }

    const token = deterministic
      ? `${e.label}_${btoa(e.text).slice(0, 6).toUpperCase()}`
      : `${e.label}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    map.set(token, e.text);
    output =
      output.slice(0, e.start) +
      `[${token}]` +
      output.slice(e.end);
  }

  return { redactedText: output, redactionMap: map };
}
