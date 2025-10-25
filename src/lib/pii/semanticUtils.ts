// Small, synchronous “good enough” hash for deterministic IDs (browser + Node)
export function stableId(input: string, length = 6): string {
  // djb2
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
    h |= 0;
  }
  const hex = (h >>> 0).toString(16).toUpperCase();
  return hex.slice(0, Math.max(2, length));
}

export function normalizeForKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Basic YAML front matter embed/extract (no external deps)
export function embedFrontMatter(map: object, body: string): string {
  const yaml = toYaml(map);
  return `---\n${yaml}---\n\n${body}`;
}

export function extractFrontMatter(doc: string): { map: any | null; body: string } {
  const fm = /^---\n([\s\S]*?)\n---\n?\n?/;
  const m = doc.match(fm);
  if (!m) return { map: null, body: doc };
  const yaml = m[1];
  const body = doc.slice(m[0].length);
  return { map: fromYaml(yaml), body };
}

// Super-light YAML serializer for simple key/values
function toYaml(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.keys(obj).map(k => {
      const v = (obj as any)[k];
      if (v && typeof v === 'object') {
        return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
      }
      return `${pad}${k}: ${String(v)}`;
    }).join('\n') + '\n';
  }
  return `${pad}${String(obj)}\n`;
}

// Super-light YAML parser for the matching serializer (expects only scalars & nested objects)
function fromYaml(yaml: string): any {
  const lines = yaml.split(/\r?\n/).filter(Boolean);
  const root: any = {};
  const stack: Array<{ indent: number; obj: any }> = [{ indent: -1, obj: root }];

  for (const raw of lines) {
    const m = raw.match(/^(\s*)([^:]+):(?:\s*(.*))?$/);
    if (!m) continue;
    const indent = m[1].length;
    const key = m[2].trim();
    const val = (m[3] ?? '').trim();

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;

    if (val === '') {
      parent[key] = {};
      stack.push({ indent, obj: parent[key] });
    } else {
      // cast booleans/numbers if you like; keep strings for safety
      parent[key] = val;
    }
  }
  return root;
}
