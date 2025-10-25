import { RX } from './regex-au';
import { isValidABN, isValidTFN, isValidMedicare, luhnValid } from './validators';
import type { Entity } from './types';

export function detectStructured(text: string): Entity[] {
  const out: Entity[] = [];

  const push = (m: RegExpExecArray, label: Entity['label'], ok = true) => {
    if (!ok) return;
    out.push({ text: m[0], label, start: m.index, end: m.index + m[0].length, source:'regex' });
  };

  const scan = (re: RegExp, fx: (s: string)=>boolean, label: Entity['label']) => {
    re.lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text))) push(m, label, fx(m[0]));
  };

  scan(RX.ABN,        isValidABN, 'ABN');
  scan(RX.TFN,        isValidTFN, 'TFN');
  scan(RX.MEDICARE,   isValidMedicare, 'MEDICARE');
  scan(RX.CREDIT_CARD,luhnValid, 'CREDIT_CARD');

  // AFSL/AR: only when label cue present
  RX.AFSL_AR.lastIndex = 0; { let m: RegExpExecArray | null;
    while ((m = RX.AFSL_AR.exec(text))) {
      const num = m[1];
      out.push({
        text: num,
        label: /AFSL/i.test(m[0]) ? 'AFSL' : 'AR',
        start: m.index,
        end: m.index + m[0].length,
        source:'regex'
      });
    }
  }

  // Looser items without checksums but still useful
  const loose = (re: RegExp, label: Entity['label']) => {
    re.lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text))) push(m, label, true);
  };
  loose(RX.EMAIL, 'EMAIL');
  loose(RX.PHONE, 'PHONE');
  loose(RX.DOB,   'DOB');
  loose(RX.ADDRESS, 'ADDRESS');
  loose(RX.ORG_SUFFIX, 'ORG');

  return out;
}
