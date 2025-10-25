import { pipeline, env } from '@huggingface/transformers';
import { NameDatabase } from './name-database';
import { detectStructured } from './pii/detectStructured';
import { reconcile } from './pii/reconcile';
import type { Entity } from './pii/types';

// Configure transformers to use browser cache
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface PIIEntity {
  text: string;
  label: string;
  start: number;
  end: number;
  score: number;
  metadata?: {
    calculatedDOB?: string;
    documentDate?: string;
    age?: number;
  };
}

export class BrowserPIIDetector {
  private classifier: any = null;
  private isLoading = false;
  private nameDatabase: NameDatabase;
  private readonly modelVersion = 'Xenova/bert-base-NER';

  constructor() {
    this.nameDatabase = new NameDatabase();
  }

  async initialize(onProgress?: (progress: number) => void) {
    if (this.classifier || this.isLoading) return;
    
    this.isLoading = true;
    
    // Initialize name database in parallel (silent operation)
    const nameDbPromise = this.nameDatabase.initialize((progress) => {
      if (onProgress) onProgress(progress * 0.3);
    });
    
    try {
      // Try WebGPU first for acceleration
      console.log('Attempting to load AI model with WebGPU...');
      this.classifier = await pipeline(
        'token-classification',
        this.modelVersion,
        {
          device: 'webgpu',
          progress_callback: (progress: any) => {
            if (onProgress && progress.progress !== undefined) {
              const normalizedProgress = 30 + (Math.min(100, Math.max(0, progress.progress)) * 0.7);
              onProgress(normalizedProgress);
            }
          }
        }
      );
      console.log('Successfully loaded AI model with WebGPU');
    } catch (webgpuError) {
      // Fallback to CPU
      console.warn('WebGPU failed, falling back to CPU:', webgpuError);
      try {
        this.classifier = await pipeline(
          'token-classification',
          this.modelVersion,
          {
            progress_callback: (progress: any) => {
              if (onProgress && progress.progress !== undefined) {
                const normalizedProgress = 30 + (Math.min(100, Math.max(0, progress.progress)) * 0.7);
                onProgress(normalizedProgress);
              }
            }
          }
        );
        console.log('Successfully loaded AI model with CPU');
      } catch (cpuError) {
        this.isLoading = false;
        console.error('Failed to load AI model:', cpuError);
        throw new Error(`Model initialization failed: ${cpuError instanceof Error ? cpuError.message : 'Unknown error'}`);
      }
    }
    
    await nameDbPromise;
    this.isLoading = false;
  }

  async detectPII(text: string): Promise<PIIEntity[]> {
    if (!this.classifier) {
      await this.initialize();
    }
    
    // Ensure name database is initialized before validation
    if (!this.nameDatabase['isInitialized']) {
      await this.nameDatabase.initialize();
    }

    const result = await this.classifier(text, {
      aggregation_strategy: 'simple'
    });

    const entities: PIIEntity[] = [];
    
    // Map AI NER labels to PII categories
    const aiEntities = result.map((entity: any) => ({
      text: entity.word,
      label: this.mapLabelToPII(entity.entity_group || entity.entity),
      start: entity.start,
      end: entity.end,
      score: entity.score
    })).filter((entity: PIIEntity) => {
      // Require higher confidence for AI detections
      if (entity.score < 0.75) return false;
      
      // Filter out false positives for person names
      if (entity.label === 'Person Name') {
        return this.isLikelyPersonName(entity.text);
      }
      
      return true;
    });
    
    entities.push(...aiEntities);
    
    // Supplement with name database for capitalized words AI might have missed
    const capitalizedPattern = /\b([A-Z][a-z]{2,15})\b/g;
    let match;
    
    const excludeCommonWords = new Set([
      'Balance', 'Fund', 'Super', 'Investment', 'Option', 'Proposed', 'Action',
      'Current', 'Growth', 'Balanced', 'Conservative', 'Aggressive', 'Moderate',
      'Account', 'Portfolio', 'Asset', 'Liability', 'Income', 'Expense', 'Credit',
      'Card', 'Net', 'Risk', 'Keep', 'Client', 'Model', 'Daily', 'Market', 'Plan',
      'Step', 'Fees', 'Service', 'Fee', 'Gains', 'Mix', 'Sample', 'Form', 'Total',
      'Amount', 'Value', 'Price', 'Cost', 'Rate', 'Return', 'Profit', 'Loss',
      'Stock', 'Bond', 'Cash', 'Property', 'Trust', 'Company', 'Business',
      'Australian', 'Australia', 'Sydney', 'Melbourne', 'Brisbane', 'Perth',
      'Street', 'Road', 'Avenue', 'Drive', 'Lane', 'Court', 'Place',
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December', 'Monday', 'Tuesday',
      'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      'Owner', 'Teacher', 'Manager', 'Director', 'Engineer', 'Consultant'
    ]);
    
    while ((match = capitalizedPattern.exec(text)) !== null) {
      const word = match[1];
      if (excludeCommonWords.has(word)) continue;
      
      // Check if AI already caught this
      const alreadyDetected = entities.some(e => 
        e.start <= match.index && e.end >= match.index + word.length
      );
      if (alreadyDetected) continue;
      
      // Only add if it's a first name (higher confidence)
      if (this.nameDatabase.isFirstName(word)) {
        entities.push({
          text: word,
          label: 'Person Name',
          start: match.index,
          end: match.index + word.length,
          score: 0.75
        });
      }
    }
    
    return entities;
  }

  private isLikelyPersonName(text: string): boolean {
    // Remove common punctuation and normalize
    const normalized = text.trim().replace(/[.,!?;:]/g, '');
    const words = normalized.split(/\s+/);
    
    console.log('🔍 Validating:', text, '| Words:', words);
    
    // CRITICAL: Blacklist common business/financial terms the AI incorrectly labels as names
    const businessBlacklist = new Set([
      'card', 'credit', 'debit', 'account', 'balance', 'fund', 'funds',
      'plan', 'service', 'services', 'analysis', 'action', 'adviser', 'advisor',
      'client', 'mortgage', 'retain', 'current', 'growth', 'model', 'balanced',
      'considerations', 'market', 'implementation', 'capital', 'gains',
      'remuneration', 'ongoing', 'disclosures', 'proceed', 'form', 'solutions',
      'school', 'secondary', 'long', 'dear', 'fees', 'july', 'august', 'january',
      'representative', 'authorised', 'authorized', 'orion', 'advice', 'engineering',
      'street', 'strategic', 'pty', 'ltd'
    ]);
    
    // If ANY word is a blacklisted business term, reject immediately
    const hasBlacklistedWord = words.some(word => businessBlacklist.has(word.toLowerCase()));
    console.log('  Blacklist check:', hasBlacklistedWord, '| Checking:', words.map(w => w.toLowerCase()));
    if (hasBlacklistedWord) {
      console.log('  ❌ REJECTED: Contains blacklisted word');
      return false;
    }
    
    // Filter out words that are clearly not names (all lowercase, numbers, etc.)
    const cleanWords = words.filter(word => {
      // Must start with capital letter
      if (!/^[A-Z]/.test(word)) return false;
      // Must not contain numbers
      if (/\d/.test(word)) return false;
      // Must be reasonable length for a name (2-20 chars)
      if (word.length < 2 || word.length > 20) return false;
      return true;
    });
    
    if (cleanWords.length === 0) return false;
    
    const titles = new Set(['mr', 'mrs', 'ms', 'dr', 'miss', 'prof', 'sir', 'dame']);
    
    // Single word: MUST be in name database
    if (cleanWords.length === 1) {
      const word = cleanWords[0];
      return this.nameDatabase.isFirstName(word) || this.nameDatabase.isLastName(word);
    }
    
    // Two words: STRICT validation
    if (cleanWords.length === 2) {
      const [first, second] = cleanWords;
      
      // Title + Name: second word MUST be in database
      if (titles.has(first.toLowerCase())) {
        return this.nameDatabase.isFirstName(second) || this.nameDatabase.isLastName(second);
      }
      
      // First + Last: BOTH words must be in database
      const firstValid = this.nameDatabase.isFirstName(first);
      const secondValid = this.nameDatabase.isLastName(second) || this.nameDatabase.isFirstName(second);
      
      return firstValid && secondValid;
    }
    
    // Three or more words: ALL non-title words must be in database
    let validCount = 0;
    let requiredCount = 0;
    
    for (const word of cleanWords) {
      // Skip titles
      if (titles.has(word.toLowerCase())) continue;
      
      requiredCount++;
      if (this.nameDatabase.isFirstName(word) || this.nameDatabase.isLastName(word)) {
        validCount++;
      }
    }
    
    // ALL non-title words must be valid names
    return requiredCount > 0 && validCount === requiredCount;
  }

  private mapLabelToPII(label: string): string {
    const mapping: { [key: string]: string } = {
      'PER': 'Person Name',
      'PERSON': 'Person Name',
      'LOC': 'Location',
      'LOCATION': 'Location',
      'ORG': 'Organization',
      'ORGANIZATION': 'Organization',
      'MISC': 'Miscellaneous'
    };
    return mapping[label.toUpperCase()] || label;
  }


  private async detectNER(text: string): Promise<Entity[]> {
    if (!this.classifier) {
      await this.initialize();
    }

    try {
      // 1) Try library aggregation
      let raw = await this.classifier(text, { aggregation_strategy: 'simple' });

      // 2) Decide if output still looks tokenized (tiny tokens / ## pieces / BIO tags / incomplete names)
      const looksTokenized = Array.isArray(raw) && raw.length > 0 && raw.some((r: any) => {
        const word = r.word || '';
        const entity = r.entity_group || r.entity || '';
        
        // Check for tokenization indicators
        const hasSubwordMarker = word.startsWith('##');
        const hasBIOTag = typeof entity === 'string' && /^[BI]-/.test(entity);
        const isTinyToken = word.length <= 3;
        
        // Check for incomplete PERSON names (likely truncated by bad aggregation)
        const isPerson = entity.toUpperCase().includes('PER') || entity === 'PERSON';
        const looksIncomplete = isPerson && (
          word.length === 2 ||  // "Co", "La", etc.
          /^[A-Z][a-z]$/.test(word) ||  // Single capitalized syllable
          word.endsWith('Co') || word.endsWith('La')  // Common truncation patterns
        );
        
        return hasSubwordMarker || hasBIOTag || isTinyToken || looksIncomplete;
      });

      // 3) If empty OR still tokenized, do manual merge on raw tokens
      if (!Array.isArray(raw) || raw.length === 0 || looksTokenized) {
        const tokens = await this.classifier(text);
        raw = [];
        let cur: any = null;
        for (const t of tokens) {
          const tag = (t.entity_group || t.entity || '').toString();
          if (!tag) continue;

          const begins = tag.startsWith('B-');
          const inside = tag.startsWith('I-');
          const word = t.word || '';

          if (begins || !cur) {
            if (cur) raw.push(cur);
            cur = {
              word: word.replace(/^##/, ''),
              label: tag.replace(/^[BI]-/, ''),
              start: t.start ?? 0,
              end: t.end ?? 0,
              score: t.score ?? 1,
            };
          } else if (inside && cur) {
            // Always append for I- tags
            cur.word += word.startsWith('##') ? word.slice(2) : ' ' + word;
            cur.end = t.end ?? cur.end;
            cur.score = Math.max(cur.score, t.score ?? cur.score);
          } else if (word.startsWith('##') && cur) {
            // Continuation subword
            cur.word += word.slice(2);
            cur.end = t.end ?? cur.end;
          } else if (cur && tag === cur.label) {
            // Same label, likely continuation without explicit I- tag
            cur.word += word.startsWith('##') ? word.slice(2) : ' ' + word;
            cur.end = t.end ?? cur.end;
          }
        }
        if (cur) raw.push(cur);
      }

      // 4) Map to Entity
      // Map model labels to internal schema
      const labelMap: Record<string, string> = {
        PER: 'PERSON',
        ORG: 'ORG',
        LOC: 'ADDRESS',   // or 'LOC' if you prefer
        MISC: 'ORG'       // often company/brand context
      };

      const mapped = raw.map((r: any) => ({
        text: r.word || r.text || '',
        label: labelMap[(r.entity_group || r.label || '').replace(/^[BI]-/, '')] || (r.entity_group || r.label || ''),
        start: r.start ?? 0,
        end: r.end ?? 0,
        score: r.score ?? 1,
        source: 'model',
      }));

      return mapped;
    } catch (e) {
      console.error('detectNER error', e);
      return [];
    }
  }

  private mapNERLabelToEntity(label: string): Entity['label'] {
    // Map NER labels (PER, LOC, ORG, MISC) to our Entity label types
    const mapping: Record<string, Entity['label']> = {
      'PER': 'PERSON',
      'PERSON': 'PERSON',
      'LOC': 'LOC',
      'LOCATION': 'LOC',
      'ORG': 'ORG',
      'ORGANIZATION': 'ORG',
      'MISC': 'PERSON', // Default misc to person for now
    };
    return mapping[label.toUpperCase()] || 'PERSON';
  }

  async detectAll(text: string): Promise<Entity[]> {
    console.time('detectAll');
    const structured = detectStructured(text);
    console.log('counts: structured', structured.length);

    // Safe chunking by paragraphs with accurate offset tracking
    const parts = text.split(/(\n\s*\n+)/); // Capture separators
    const slices: {text:string, offset:number}[] = [];
    let offset = 0;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      // Skip empty or pure whitespace separators
      if (!part || /^\s*$/.test(part)) {
        offset += part.length;
        continue;
      }
      
      const t = part.trim();
      if (!t) {
        offset += part.length;
        continue;
      }
      
      // Find actual start of trimmed content in original part
      const trimStart = part.indexOf(t);
      const actualOffset = offset + trimStart;
      
      // Cap large paragraphs
      for (let j = 0; j < t.length; j += 3500) {
        const chunk = t.slice(j, j + 3500);
        slices.push({ text: chunk, offset: actualOffset + j });
      }
      
      offset += part.length;
    }

    let modelEntities: Entity[] = [];
    for (const s of slices) {
      const ents = await this.detectNER(s.text);
      // rebase spans to original doc
      modelEntities.push(...ents.map(e => ({ ...e, start: e.start + s.offset, end: e.end + s.offset })));
    }
    
    // --- TEMP DEBUG ---
    (window as any)._modelEntities = modelEntities;
    console.log('👁️  MODEL ENTITIES (raw)', modelEntities.length);
    console.table(modelEntities.map((e:any)=>({
      text: e.text,
      label: e.label,
      score: e.score?.toFixed(2),
      start: e.start,
      end: e.end
    })));
    // --- END DEBUG ---
    
    console.log('counts: model raw', modelEntities.length);

    const all = [...structured, ...modelEntities];
    console.log('counts: combined pre-reconcile', all.length);

    const reconciled = reconcile(all);
    console.log('counts: reconciled', reconciled.length);
    
    // DEBUG: Verify entity positions match text
    console.log('🔍 ENTITY POSITION VERIFICATION:');
    reconciled.forEach((e, i) => {
      const actualText = text.substring(e.start, e.end);
      const matches = actualText === e.text;
      if (!matches) {
        console.warn(`❌ Entity ${i} mismatch:`, {
          expected: e.text,
          actual: actualText,
          start: e.start,
          end: e.end
        });
      }
    });
    
    console.timeEnd('detectAll');

    return reconciled;
  }

  // Detect only highly structured data that AI cannot understand
  private detectStructuredData(text: string): PIIEntity[] {
    const entities: PIIEntity[] = [];
    let match;
    
    // GOVERNMENT IDs - Specific Australian formats
    const governmentPatterns = [
      { pattern: /\b(?:ABN:?\s*)?(\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/g, label: 'ABN' },
      { pattern: /\b(?:TFN:?\s*)?(\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/g, label: 'TFN' },
      { pattern: /\b(?:Medicare:?\s*)?(\d{4}[\s-]?\d{5}[\s-]?\d{1})\b/g, label: 'Medicare Number' },
      { pattern: /\b(?:AFSL|Australian Financial Services Licence)\s*:?\s*#?\s*(\d{6})\b/gi, label: 'AFSL Number' },
      { pattern: /\b(?:AR|Authorised Representative)\s*:?\s*#?\s*(\d{6})\b/gi, label: 'AR Number' }
    ];
    
    // CONTACT INFORMATION
    const contactPatterns = [
      { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, label: 'Email' },
      { pattern: /\b(?:\+61[\s-]?)?0[2-9](?:[\s-]?\d){8}\b/g, label: 'Phone Number' }
    ];
    
    // FINANCIAL ACCOUNTS
    const accountPatterns = [
      { pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, label: 'Credit Card' },
      { pattern: /\b(\d{3}[\s-]\d{3}[\s-]\d{4,10})\b/g, label: 'Bank Account' }
    ];
    
    // ADDRESSES - Australian format with limited repetitions to prevent ReDoS
    const addressPattern = /\b(\d{1,5}\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,5}\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Crescent|Cres|Parade|Pde|Boulevard|Blvd|Terrace|Tce))\b/gi;
    while ((match = addressPattern.exec(text)) !== null) {
      entities.push({
        text: match[1],
        label: 'Address',
        start: match.index,
        end: match.index + match[1].length,
        score: 1.0
      });
    }
    
    // BUSINESS NAMES - Common business entity suffixes with limited repetitions
    const businessPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\s+(?:Pty\.?\s*Ltd\.?|Limited|Pty|Ltd|Engineering|Consulting|Consultants|Solutions|Services|Group|Associates|Partners|Corporation|Corp|Company|Co\.?|Enterprises|Industries|Holdings)\b/g;
    while ((match = businessPattern.exec(text)) !== null) {
      const fullMatch = match[0];
      entities.push({
        text: fullMatch,
        label: 'Business Name',
        start: match.index,
        end: match.index + fullMatch.length,
        score: 0.85
      });
    }
    
    // SURNAMES - Detect likely surnames (capitalize words followed by common context)
    const surnamePattern = /\b(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Miss)\s+([A-Z][a-z]{2,20})\b/g;
    while ((match = surnamePattern.exec(text)) !== null) {
      const surname = match[2];
      const surnameStart = match.index + match[0].indexOf(surname);
      entities.push({
        text: surname,
        label: 'Person Name',
        start: surnameStart,
        end: surnameStart + surname.length,
        score: 0.9
      });
    }
    
    // FULL NAMES - First + Last pattern (with name database verification)
    const fullNamePattern = /\b([A-Z][a-z]{2,15})\s+([A-Z][a-z]{2,20})\b/g;
    
    while ((match = fullNamePattern.exec(text)) !== null) {
      const firstName = match[1];
      const lastName = match[2];
      
      // REQUIRE at least one word to be in the name database
      const isValidName = this.nameDatabase.isFirstName(firstName) || 
                         this.nameDatabase.isLastName(lastName) ||
                         this.nameDatabase.isFirstName(lastName);
      
      if (!isValidName) continue;
      
      // Check if AI already caught this
      const fullName = match[0];
      const alreadyDetected = entities.some(e => 
        e.start <= match.index && e.end >= match.index + fullName.length
      );
      if (!alreadyDetected) {
        entities.push({
          text: fullName,
          label: 'Person Name',
          start: match.index,
          end: match.index + fullName.length,
          score: 0.85
        });
      }
    }
    
    // DATES OF BIRTH - Only dates with birth year range (1920-2024)
    const dobPattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4}|\d{2}))\b/g;
    while ((match = dobPattern.exec(text)) !== null) {
      const dateStr = match[1];
      const yearMatch = match[2];
      let year = parseInt(yearMatch);
      
      if (year < 100) {
        year += year > 30 ? 1900 : 2000;
      }
      
      if (year >= 1920 && year <= 2024) {
        entities.push({
          text: dateStr,
          label: 'Date of Birth',
          start: match.index,
          end: match.index + dateStr.length,
          score: 0.95
        });
      }
    }
    
    // Execute all structured patterns
    [...governmentPatterns, ...contactPatterns, ...accountPatterns].forEach(({ pattern, label }) => {
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        const matchText = match[1] || match[0];
        const matchStart = match[1] ? match.index + match[0].indexOf(match[1]) : match.index;
        
        entities.push({
          text: matchText,
          label,
          start: matchStart,
          end: matchStart + matchText.length,
          score: 1.0
        });
      }
    });

    return entities;
  }
}
