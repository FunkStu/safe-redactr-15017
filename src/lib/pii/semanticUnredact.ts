import { RedactionMap, VariantKey } from './semanticTypes';
import { extractFrontMatter } from './semanticUtils';

/**
 * Unredact using placeholders of the form [LABEL_ID:VARIANT].
 * If the doc contains YAML front-matter with `redactionMap`, that wins.
 * Otherwise, you can pass a `map` argument.
 */
export function unredactTextSemantic(
  doc: string,
  mapArg?: RedactionMap
): { unredacted: string; usedMap: RedactionMap | null } {
  const { map: fm, body } = extractFrontMatter(doc);
  const map: RedactionMap | null =
    (fm && fm.redactionMap) ? (fm.redactionMap as RedactionMap) : (mapArg ?? null);

  if (!map) {
    // No map found — return body untouched.
    return { unredacted: body, usedMap: null };
  }

  // Replace ALL placeholders found in the text
  let out = body;

  // Build fast lookup:
  // key = LABEL_ID, value = { FULL, FIRST?, LAST? }
  const lookup: Record<string, Record<VariantKey, string>> = {};
  for (const [key, entry] of Object.entries(map)) {
    const variants: Record<VariantKey, string> = { FULL: entry.full } as any;
    if ('first' in entry && entry.first) variants.FIRST = (entry as any).first;
    if ('last' in entry && entry.last) variants.LAST = (entry as any).last;
    lookup[key] = variants;
  }

  // One pass per variant ensures we don't partially replace tokens inside other tokens.
  const variants: VariantKey[] = ['FULL', 'FIRST', 'LAST'];

  for (const variant of variants) {
    // Replace tokens like [PERSON_A1B2C3:FULL]
    const rx = new RegExp(String.raw`\[([A-Z]+_[A-F0-9]{2,}):${variant}\]`, 'g');
    out = out.replace(rx, (_m, labelId: string) => {
      const vset = lookup[labelId];
      if (!vset) return _m; // unknown mapping: leave token as-is
      return vset[variant] ?? vset.FULL;
    });
  }

  return { unredacted: out, usedMap: map };
}
