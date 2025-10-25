import { BrowserPIIDetector } from '@/lib/pii-detector';
import { FIXTURES } from './fixtures';

export async function runEval() {
  const detector = new BrowserPIIDetector();
  await detector.initialize();
  
  const results = [];
  for (const f of FIXTURES) {
    const ents = await detector.detectAll(f.text);
    const counts: Record<string, number> = {};
    for (const e of ents) counts[e.label] = (counts[e.label] || 0) + 1;
    const ok = Object.entries(f.expect).every(([k,v]) => counts[k]===v);
    results.push({ id: f.id, ok, counts, expect: f.expect });
  }
  return results;
}
