import type { Entity } from './types';

/**
 * Attempts to rescue a misaligned span by searching in a small window around the expected position.
 * Returns corrected start/end if found, null otherwise.
 */
export function rescueSpan(
  doc: string,
  e: { start: number; end: number; text: string },
  windowSize = 96
): { start: number; end: number } | null {
  // If exact match already, keep it
  if (doc.slice(e.start, e.end) === e.text) {
    return { start: e.start, end: e.end };
  }

  // Search a small neighborhood around the expected start
  const left = Math.max(0, e.start - windowSize);
  const right = Math.min(doc.length, e.end + windowSize);
  const hood = doc.slice(left, right);
  const idx = hood.indexOf(e.text);
  
  if (idx >= 0) {
    const start = left + idx;
    const end = start + e.text.length;
    return { start, end };
  }
  
  return null;
}

/**
 * Redacts text by replacing entities with placeholders, using self-healing span rescue.
 * Entities MUST be sorted in descending order by start position.
 */
export function redactText(
  text: string,
  entities: Entity[],
  getPlaceholder: (entity: Entity) => string
): string {
  let output = text;
  
  // Process in descending order to maintain correct indices
  for (const e of entities) {
    // Attempt to rescue the span if it doesn't match exactly
    const fixed = rescueSpan(output, { start: e.start, end: e.end, text: e.text }, 96);
    const start = fixed ? fixed.start : e.start;
    const end = fixed ? fixed.end : e.end;

    // Sanity check — if still inconsistent, skip (don't corrupt text)
    if (output.slice(start, end) !== e.text) {
      console.warn('Span mismatch; skipping entity:', e);
      continue;
    }

    // Now safe to replace by indices
    const placeholder = getPlaceholder(e);
    output = output.slice(0, start) + placeholder + output.slice(end);
  }
  
  return output;
}
