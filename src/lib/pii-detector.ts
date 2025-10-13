import { pipeline, env } from '@huggingface/transformers';

// Configure transformers to use browser cache
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface PIIEntity {
  text: string;
  label: string;
  start: number;
  end: number;
  score: number;
}

export class BrowserPIIDetector {
  private classifier: any = null;
  private isLoading = false;

  async initialize(onProgress?: (progress: number) => void) {
    if (this.classifier || this.isLoading) return;
    
    this.isLoading = true;
    try {
      // Using a lightweight NER model optimized for PII detection
      this.classifier = await pipeline(
        'token-classification',
        'Xenova/bert-base-NER',
        {
          device: 'webgpu',
          progress_callback: (progress: any) => {
            if (onProgress && progress.progress !== undefined) {
              // Progress is already 0-100, just ensure it's capped
              const normalizedProgress = Math.min(100, Math.max(0, progress.progress));
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
              const normalizedProgress = Math.min(100, Math.max(0, progress.progress));
              onProgress(normalizedProgress);
            }
          }
        }
      );
    }
    this.isLoading = false;
  }

  async detectPII(text: string): Promise<PIIEntity[]> {
    if (!this.classifier) {
      await this.initialize();
    }

    const result = await this.classifier(text, {
      aggregation_strategy: 'simple'
    });

    // Map NER labels to PII categories
    return result.map((entity: any) => ({
      text: entity.word,
      label: this.mapLabelToPII(entity.entity_group || entity.entity),
      start: entity.start,
      end: entity.end,
      score: entity.score
    })).filter((entity: PIIEntity) => entity.score > 0.7); // Filter low confidence
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

  // Comprehensive patterns for Australian financial PII
  detectAustralianPII(text: string): PIIEntity[] {
    const patterns = [
      // Personal Names (common patterns in documents)
      {
        pattern: /(?:Client Name|Name|Adviser|Representative):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
        label: 'Person Name',
        group: 1
      },
      // Dates of Birth and general dates
      {
        pattern: /(?:Date of Birth|DOB|Born):\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
        label: 'Date of Birth',
        group: 1
      },
      {
        pattern: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/g,
        label: 'Date',
        group: 1
      },
      // Australian addresses
      {
        pattern: /\b(\d{1,5}\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Crescent|Cres|Parade|Pde|Boulevard|Blvd|Terrace|Tce),?\s*[A-Za-z\s]+,?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+\d{4})\b/gi,
        label: 'Address'
      },
      // Australian Business Number
      {
        pattern: /\b(?:ABN:?\s*)?(\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/g,
        label: 'ABN',
        group: 1
      },
      // Tax File Number
      {
        pattern: /\b(?:TFN:?\s*)?(\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/g,
        label: 'TFN',
        group: 1
      },
      // Medicare Number
      {
        pattern: /\b(?:Medicare:?\s*)?(\d{4}[\s-]?\d{5}[\s-]?\d{1})\b/g,
        label: 'Medicare Number',
        group: 1
      },
      // Email addresses
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        label: 'Email'
      },
      // Australian phone numbers
      {
        pattern: /\b(?:\+61[\s-]?)?0[2-9](?:[\s-]?\d){8}\b/g,
        label: 'Phone Number'
      },
      // Credit card numbers
      {
        pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
        label: 'Credit Card'
      },
      // Bank account (BSB + Account)
      {
        pattern: /\b(\d{3}[\s-]\d{3}[\s-]\d{4,10})\b/g,
        label: 'Bank Account'
      },
      // Currency amounts (for financial sensitivity)
      {
        pattern: /\$[\d,]+(?:\.\d{2})?/g,
        label: 'Currency Amount'
      },
      // Employer/Company names
      {
        pattern: /(?:Employer|Company):\s*([A-Z][A-Za-z\s&]+(?:Pty Ltd|Ltd|Pty|Limited|Inc|Corporation))/gi,
        label: 'Company Name',
        group: 1
      },
      // Super fund names and account details
      {
        pattern: /(?:Superannuation|Super|Fund):\s*([A-Z][A-Za-z\s]+)/gi,
        label: 'Super Fund',
        group: 1
      },
      // Bank/Financial institution names
      {
        pattern: /\b(ANZ|NAB|Westpac|Commonwealth Bank|CBA|Macquarie|ING|Bendigo Bank|St\.?\s*George|Bank of Melbourne|BankWest|Suncorp)\b/gi,
        label: 'Bank Name'
      },
      // Income amounts
      {
        pattern: /(?:Income|Salary|Wage):\s*\$[\d,]+/gi,
        label: 'Income Amount'
      },
      // Age (when near personal info)
      {
        pattern: /\b(?:Age|Aged):\s*(\d{1,3})\b/gi,
        label: 'Age',
        group: 1
      }
    ];

    const entities: PIIEntity[] = [];
    patterns.forEach(({ pattern, label, group }) => {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        const matchText = group !== undefined ? match[group] : match[0];
        const matchStart = group !== undefined ? match.index + match[0].indexOf(match[group]) : match.index;
        
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

  async detectAll(text: string): Promise<PIIEntity[]> {
    const [aiEntities, regexEntities] = await Promise.all([
      this.detectPII(text),
      Promise.resolve(this.detectAustralianPII(text))
    ]);

    // Merge and deduplicate
    const allEntities = [...aiEntities, ...regexEntities];
    const uniqueEntities = allEntities.filter((entity, index, self) => 
      index === self.findIndex(e => 
        e.start === entity.start && e.end === entity.end
      )
    );

    return uniqueEntities.sort((a, b) => a.start - b.start);
  }
}
