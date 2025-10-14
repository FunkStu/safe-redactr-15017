import { pipeline, env } from '@huggingface/transformers';
import { NameDatabase } from './name-database';

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
    
    // Single word: Must be in name database
    if (words.length === 1) {
      return this.nameDatabase.isFirstName(words[0]) || this.nameDatabase.isLastName(words[0]);
    }
    
    // Two words: Check if it's a valid First+Last or Title+Name pattern
    if (words.length === 2) {
      const [first, second] = words;
      
      // First + Last name pattern
      if (this.nameDatabase.isFirstName(first) && this.nameDatabase.isLastName(second)) {
        return true;
      }
      
      // Title + Name pattern (Mr./Ms./Dr. etc.)
      const titles = new Set(['mr', 'mrs', 'ms', 'dr', 'miss', 'prof', 'sir', 'dame']);
      if (titles.has(first.toLowerCase()) && 
          (this.nameDatabase.isFirstName(second) || this.nameDatabase.isLastName(second))) {
        return true;
      }
      
      return false;
    }
    
    // Three or more words: Require majority to be valid names
    const validNameWords = words.filter(word => 
      this.nameDatabase.isFirstName(word) || this.nameDatabase.isLastName(word)
    );
    
    // At least 50% of words must be valid names
    return validNameWords.length >= Math.ceil(words.length / 2);
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


  async detectAll(text: string): Promise<PIIEntity[]> {
    // Input validation to prevent ReDoS attacks
    const MAX_INPUT_LENGTH = 100000; // 100KB limit
    if (text.length > MAX_INPUT_LENGTH) {
      throw new Error(`Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters`);
    }

    // PRIMARY: AI Model - Best for unstructured data and context understanding
    const aiEntities = await this.detectPII(text);
    
    // SECONDARY: Structured data patterns (only what AI can't detect)
    const structuredEntities = this.detectStructuredData(text);
    
    // Combine all detections (AI is primary, no filtering)
    const allEntities = [...aiEntities, ...structuredEntities];
    
    // Remove exact duplicates only
    const uniqueEntities = allEntities.filter((entity, index, self) => 
      index === self.findIndex(e => 
        e.start === entity.start && 
        e.end === entity.end && 
        e.label === entity.label
      )
    );

    return uniqueEntities.sort((a, b) => a.start - b.start);
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
