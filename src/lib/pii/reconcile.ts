import type { Entity } from './types';

const THRESH: Record<string, number> = { PERSON: 0.80, ORG: 0.85, LOC: 0.80, ADDRESS: 0.85 };

export function normalizeEntity(e: Entity): Entity | null {
  let t = e.text.replace(/\s+/g,' ').trim();

  // Business suffix → ORG
  if (/\b(Pty\s+Ltd|Ltd|Trust|Unit\s+Trust|Superannuation\s+Fund)\b/i.test(t))
    return { ...e, label:'ORG', text:t };

  // Reject ALLCAPS single token as PERSON (likely codes)
  if (e.label==='PERSON' && /^\p{Lu}{2,}$/u.test(t)) return null;

  // Keep honorifics but normalise spacing
  t = t.replace(/\b(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, '$1 ');
  return { ...e, text: t };
}

export function filterByConfidence(e: Entity): boolean {
  if (e.source === 'regex') return true;
  const thr = THRESH[e.label] ?? 0.80;
  return (e.score ?? 0) >= thr;
}

// Prefer validated regex over model hits on overlap
export function reconcile(entities: Entity[]): Entity[] {
  const norm = entities.map(normalizeEntity).filter(Boolean).filter(filterByConfidence) as Entity[];
  norm.sort((a,b)=> a.start - b.start);

  const out: Entity[] = [];
  for (const e of norm) {
    const i = out.findIndex(o => !(e.end <= o.start || e.start >= o.end));
    if (i === -1) { out.push(e); continue; }
    const o = out[i];
    if (e.source==='regex' && o.source==='model') out[i] = e; // regex wins
  }

  const seen = new Set<string>();
  return out.filter(e => {
    const k = `${e.start}:${e.end}:${e.label}:${e.text.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
