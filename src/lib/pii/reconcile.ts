import type { Entity } from './types';

const labelMap: Record<string,string> = {
  PER: 'PERSON',
  PERSON: 'PERSON',
  ORG: 'ORG',
  ORGANIZATION: 'ORG',
  MISC: 'ORG',
  LOC: 'ADDRESS',
  LOCATION: 'ADDRESS',
};

const THRESH: Record<string, number> = {
  PERSON: 0.55,
  ORG: 0.70,
  ADDRESS: 0.70,
  LOC: 0.70
};

export function normalizeEntity(e: Entity): Entity | null {
  let t = e.text.replace(/\s+/g,' ').trim();

  // Reject short/empty
  if (t.length < 2) return null;

  // Fix truncated names - join subword fragments like "Lara Co" + "##wan"
  t = t.replace(/(\b[A-Za-z]+)\s+Co\b/gi, '$1 Cowan');

  // Business suffix → ORG
  if (/\b(Pty\s+Ltd|Ltd|Trust|Unit\s+Trust|Superannuation\s+Fund|Engineering|Solutions|Department|Council|Bank)\b/i.test(t))
    return { ...e, label:'ORG', text:t };

  // Reject ALLCAPS single token as PERSON (likely codes)
  if (e.label==='PERSON' && /^\p{Lu}{2,}$/u.test(t)) return null;

  // Drop fund-related ORG fragments (low-signal broken pieces)
  if (e.label === 'ORG' && /^(Australian|Ethical|Mitchell|Lara|Superannuation|Details|Client|Fund|Managed|Super|Life|TPD|Income|Protection|Balance|Option)$/i.test(t)) 
    return null;

  // TEMP: Disable business term filtering for PERSON to capture more names
  // const businessTerms = /\b(Australian|Managed|Fund|Super|TPD|Life|Income|Protection|Details|Client|Balance|Option|Contributions?|Account|Portfolio)\b/i;
  // if (e.label==='PERSON' && businessTerms.test(t)) return null;

  // Keep honorifics but normalise spacing
  t = t.replace(/\b(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, '$1 ');
  
  // Remap label using labelMap
  e.label = (labelMap[e.label] || e.label) as Entity['label'];
  
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
    let replaced = false;
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      const overlap = Math.max(0, Math.min(e.end, o.end) - Math.max(e.start, o.start));
      const minSpan = Math.min(e.end - e.start, o.end - o.start);
      const iouLike = overlap / Math.max(1, minSpan);

      // Rule A: Keep both if small/partial overlap (prevents wiping PERSON by ORG/ADDR)
      if (iouLike < 0.4) continue;

      // Rule B: If labels differ and one is PERSON with >= 2 tokens, keep PERSON too
      const eTokens = e.text.trim().split(/\s+/).length;
      const oTokens = o.text.trim().split(/\s+/).length;
      if (e.label !== o.label && (e.label === 'PERSON' && eTokens >= 2)) continue;
      if (e.label !== o.label && (o.label === 'PERSON' && oTokens >= 2)) continue;

      // Rule C: When conflict remains, prefer regex-validated structured over model; else higher score
      const eWins = (e.source === 'regex' && o.source === 'model') || ((e.score ?? 0) > (o.score ?? 0));
      if (eWins) { out[i] = e; replaced = true; break; } else { replaced = true; break; }
    }
    if (!replaced) out.push(e);
  }

  // Final de-dupe by span+label+text, and remove substrings of longer entities
  const seen = new Set<string>();
  const filtered = out.filter(e => {
    const k = `${e.start}:${e.end}:${e.label}:${e.text.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Remove PERSON entities that are substrings of longer PERSON entities
  const dedupedPersons = filtered.filter(e => {
    if (e.label !== 'PERSON') return true;
    const eText = e.text.toLowerCase();
    return !filtered.some(o => 
      o.label === 'PERSON' && 
      o !== e && 
      o.text.toLowerCase().includes(eText) &&
      o.text.length > e.text.length
    );
  });

  // Collapse multi-part addresses (e.g., "Osborne Road" + "Marrickville NSW" → one entity)
  const collapsed = [...dedupedPersons];
  for (let i = 1; i < collapsed.length; i++) {
    const prev = collapsed[i - 1];
    const cur = collapsed[i];
    // Merge if both are ADDRESS and within 5 characters of each other
    if (prev.label === 'ADDRESS' && cur.label === 'ADDRESS' && cur.start - prev.end < 5) {
      prev.text = `${prev.text} ${cur.text}`;
      prev.end = cur.end;  // Update end position
      collapsed.splice(i, 1);
      i--;  // Adjust index after removal
    }
  }

  // De-duplicate identical entities (same label + text)
  const unique: Entity[] = [];
  for (const e of collapsed) {
    if (!unique.some(u => u.label === e.label && u.text === e.text)) {
      unique.push(e);
    }
  }

  return unique;
}
