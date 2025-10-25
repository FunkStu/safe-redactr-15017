export type Label = 'PERSON' | 'ADDRESS' | 'ORG' | 'DOB' | 'PHONE' | 'EMAIL' | 'OTHER';

export interface Entity {
  label: Label;
  text: string;
  start?: number; // not needed for semantic mode, but harmless to keep
  end?: number;
}

export type PersonRedactionEntry = {
  label: 'PERSON';
  full: string;
  first: string;
  last: string;
  canonical: string;
};

export type DefaultRedactionEntry = {
  label: Exclude<Label, 'PERSON'>;
  full: string;
  canonical: string;
};

export type RedactionEntry = PersonRedactionEntry | DefaultRedactionEntry;

export type RedactionMap = Record<string, RedactionEntry>; // key = `${LABEL}_${ID}`

export type PersonVariantKey = 'FULL' | 'FIRST' | 'LAST';
export type DefaultVariantKey = 'FULL';
export type VariantKey = PersonVariantKey | DefaultVariantKey;

export interface RedactOptions {
  /**
   * If true, we will also redact standalone PERSON first names and last names to the same placeholder with :FIRST or :LAST
   * (After replacing FULL to avoid double-replacement).
   */
  redactPersonFirstLast?: boolean;

  /**
   * Embed YAML front-matter with the redaction map at the top of the redacted output.
   */
  embedFrontMatter?: boolean;

  /**
   * Case-insensitive matching (recommended true)
   */
  caseInsensitive?: boolean;
}
