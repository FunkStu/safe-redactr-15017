import { Entity, RedactionMap, VariantKey, RedactOptions } from './semanticTypes';
import { createRedactionMap } from './semanticMap';
import { escapeRegExp, embedFrontMatter } from './semanticUtils';

/**
 * Placeholder format: [LABEL_ID:VARIANT]
 *   PERSON variants: FULL | FIRST | LAST
 *   Others: FULL
 */
function placeholder(labelAndId: string, variant: VariantKey = 'FULL') {
  return `[${labelAndId}:${variant}]`;
}

function replaceAllWordBoundary(haystack: string, needle: string, replacement: string, caseInsensitive = true) {
  if (!needle) return haystack;
  const flags = caseInsensitive ? 'gi' : 'g';
  const rx = new RegExp(`\\b${escapeRegExp(needle)}\\b`, flags);
  return haystack.replace(rx, replacement);
}

/**
 * Semantic, index-free redaction.
 * Returns redacted text + map. Optionally embeds YAML front-matter with the map.
 */
export function redactTextSemantic(
  text: string,
  entities: Entity[],
  options: RedactOptions = { redactPersonFirstLast: true, embedFrontMatter: true, caseInsensitive: true }
): { redacted: string; map: RedactionMap } {
  const map = createRedactionMap(entities);
  let out = text;

  // First pass: FULL replacements (longest strings first to avoid partial overlap issues).
  const entries = Object.entries(map).sort((a, b) => (b[1].full.length - a[1].full.length));

  for (const [key, entry] of entries) {
    const fullPh = placeholder(key, 'FULL');
    out = replaceAllWordBoundary(out, entry.full, fullPh, options.caseInsensitive);

    if (entry.label === 'PERSON' && options.redactPersonFirstLast) {
      // Replace FIRST & LAST after FULL to avoid re-replacing inside placeholders
      const first = 'first' in entry ? entry.first : '';
      const last = 'last' in entry ? entry.last : '';
      
      if (first && first !== entry.full) {
        const firstPh = placeholder(key, 'FIRST');
        out = replaceAllWordBoundary(out, first, firstPh, options.caseInsensitive);
      }
      if (last && last !== entry.full) {
        const lastPh = placeholder(key, 'LAST');
        out = replaceAllWordBoundary(out, last, lastPh, options.caseInsensitive);
      }
    }
  }

  if (options.embedFrontMatter) {
    // Keep a clean, serializable map (front matter hates functions/undefined)
    const serializable = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { ...v }]));
    out = embedFrontMatter({ redactionMap: serializable }, out);
  }

  return { redacted: out, map };
}
