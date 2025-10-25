import { Entity, Label, RedactionMap, RedactionEntry } from './semanticTypes';
import { normalizeForKey, stableId } from './semanticUtils';

function buildRedactionEntry(text: string, label: Label, canonical: string): RedactionEntry {
  if (label === 'PERSON') {
    const parts = text.trim().split(/\s+/);
    const first = parts[0] ?? text;
    const last = parts.length > 1 ? parts.slice(1).join(' ') : '';
    return { label: 'PERSON', full: text, first, last, canonical };
  }
  return { label, full: text, canonical };
}

export function createRedactionMap(entities: Entity[]): RedactionMap {
  const map: RedactionMap = {};

  for (const e of entities) {
    const canonical = normalizeForKey(e.text);
    // ID derived ONLY from normalized full value (not label), so repetitions map consistently.
    const id = stableId(canonical, 6);
    const key = `${e.label}_${id}`;

    if (!map[key]) {
      map[key] = buildRedactionEntry(e.text, e.label, canonical);
    }
  }

  return map;
}
