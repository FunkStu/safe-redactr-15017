export const RX = {
  ABN: /(?<!\d)\d{2}\s?\d{3}\s?\d{3}\s?\d{3}(?!\d)/g,
  TFN: /(?<!\d)\d{3}\s?\d{3}\s?\d{3}(?!\d)/g,
  MEDICARE: /(?<!\d)\d{4}\s?\d{5}\s?\d(?!\d)/g,
  AFSL_AR: /\b(?:AFSL|A\.?F\.?S\.?L\.?|Authorised\s+Representative(?:\s+Number)?|AR)\s*[:#-]?\s*(\d{6,8})\b/gi,
  DOB: /\b(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}\b/g,
  EMAIL: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,
  PHONE: /\b(?:\+?61\s?|0)([2-478])\s?\d{2,4}\s?\d{3}\s?\d{3}\b/g,
  CREDIT_CARD: /\b(?:\d[ -]?){12,19}\b/g,
  ADDRESS: /\b\d+\s+[A-Z][a-zA-Z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Close|Lane|Way|Place|Cres|Court|Ct|Drive|Dr|Parade)\b.*?(?:NSW|QLD|VIC|WA|SA|TAS|ACT|NT)\s*\d{4}\b/g,
  ORG_SUFFIX: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Pty\s+Ltd|Ltd|Trust|Fund|Super|Superannuation|Bank|Council|Department)\b/g,
};
