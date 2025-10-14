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

  constructor() {
    this.nameDatabase = new NameDatabase();
  }

  async initialize(onProgress?: (progress: number) => void) {
    if (this.classifier || this.isLoading) return;
    
    this.isLoading = true;
    
    // Initialize name database in parallel
    const nameDbPromise = this.nameDatabase.initialize((progress) => {
      // Name DB uses 0-30% of progress
      if (onProgress) onProgress(progress * 0.3);
    });
    
    try {
      // Using a lightweight NER model optimized for PII detection
      this.classifier = await pipeline(
        'token-classification',
        'Xenova/bert-base-NER',
        {
          device: 'webgpu',
          progress_callback: (progress: any) => {
            if (onProgress && progress.progress !== undefined) {
              // AI model uses 30-100% of progress
              const normalizedProgress = 30 + (Math.min(100, Math.max(0, progress.progress)) * 0.7);
              onProgress(normalizedProgress);
            }
          }
        }
      );
    } catch (error) {
      console.warn('WebGPU not available, falling back to CPU');
      this.classifier = await pipeline(
        'token-classification',
        'Xenova/bert-base-NER',
        {
          progress_callback: (progress: any) => {
            if (onProgress && progress.progress !== undefined) {
              const normalizedProgress = 30 + (Math.min(100, Math.max(0, progress.progress)) * 0.7);
              onProgress(normalizedProgress);
            }
          }
        }
      );
    }
    
    // Wait for name database
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
    })).filter((entity: PIIEntity) => entity.score > 0.6); // Lower threshold for AI
    
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
      { pattern: /\b(?:Medicare:?\s*)?(\d{4}[\s-]?\d{5}[\s-]?\d{1})\b/g, label: 'Medicare Number' }
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
    
    // ADDRESSES - Australian format
    const addressPattern = /\b(\d{1,5}\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Crescent|Cres|Parade|Pde|Boulevard|Blvd|Terrace|Tce),?\s*[A-Za-z\s]+,?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+\d{4})\b/gi;
    while ((match = addressPattern.exec(text)) !== null) {
      entities.push({
        text: match[1],
        label: 'Address',
        start: match.index,
        end: match.index + match[1].length,
        score: 1.0
      });
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
