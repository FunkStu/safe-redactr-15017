export type Label =
  | 'PERSON' | 'ORG' | 'LOC' | 'ADDRESS'
  | 'ABN' | 'TFN' | 'MEDICARE' | 'AFSL' | 'AR'
  | 'EMAIL' | 'PHONE' | 'CREDIT_CARD' | 'BSB' | 'BANK_ACCT' | 'DOB';

export interface Entity {
  text: string;
  label: Label;
  start: number;
  end: number;
  score?: number;         // Model confidence
  source: 'regex' | 'model';
}

export interface RedactionOptions {
  mode: 'reversible' | 'irreversible';
  conservative: boolean;  // precision bias
  deterministicPlaceholders: boolean;
}
