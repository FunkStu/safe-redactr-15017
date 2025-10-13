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

  // Smart patterns for Australian financial PII - conservative approach
  detectAustralianPII(text: string): PIIEntity[] {
    const entities: PIIEntity[] = [];
    
    // 1. ACTUAL PERSON NAMES - only after specific labels
    const namePattern = /(?:Client Name|Name|Adviser Name|Representative Name|Signed by|Prepared for):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi;
    let match;
    while ((match = namePattern.exec(text)) !== null) {
      const name = match[1];
      const start = match.index + match[0].indexOf(name);
      entities.push({
        text: name,
        label: 'Person Name',
        start,
        end: start + name.length,
        score: 1.0
      });
    }
    
    // 2. COMPLETE ADDRESSES - capture full address in one entity
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
    
    // 3. GOVERNMENT IDs
    const patterns = [
      {
        pattern: /\b(?:ABN:?\s*)?(\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/g,
        label: 'ABN'
      },
      {
        pattern: /\b(?:TFN:?\s*)?(\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/g,
        label: 'TFN'
      },
      {
        pattern: /\b(?:Medicare:?\s*)?(\d{4}[\s-]?\d{5}[\s-]?\d{1})\b/g,
        label: 'Medicare Number'
      }
    ];
    
    // 4. CONTACT INFORMATION
    const contactPatterns = [
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        label: 'Email'
      },
      {
        pattern: /\b(?:\+61[\s-]?)?0[2-9](?:[\s-]?\d){8}\b/g,
        label: 'Phone Number'
      }
    ];
    
    // 5. FINANCIAL ACCOUNT NUMBERS (actual PII)
    const accountPatterns = [
      {
        pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
        label: 'Credit Card'
      },
      {
        pattern: /\b(\d{3}[\s-]\d{3}[\s-]\d{4,10})\b/g,
        label: 'Bank Account'
      }
    ];
    
    // 6. DATES OF BIRTH (actual PII)
    const dobPattern = /(?:Date of Birth|DOB|Born):\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi;
    while ((match = dobPattern.exec(text)) !== null) {
      const dob = match[1];
      const start = match.index + match[0].indexOf(dob);
      entities.push({
        text: dob,
        label: 'Date of Birth',
        start,
        end: start + dob.length,
        score: 1.0
      });
    }
    
    // Execute all patterns
    [...patterns, ...contactPatterns, ...accountPatterns].forEach(({ pattern, label }) => {
      let match;
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

  async detectAll(text: string): Promise<PIIEntity[]> {
    // Run regex patterns first (fast)
    const regexEntities = this.detectAustralianPII(text);
    
    // Filter out AI-detected entities that overlap with addresses
    // This prevents the AI from breaking up addresses we've already captured
    const addressRanges = regexEntities
      .filter(e => e.label === 'Address')
      .map(e => ({ start: e.start, end: e.end }));
    
    const aiEntities = await this.detectPII(text);
    const filteredAIEntities = aiEntities.filter(entity => {
      // Skip if this entity is within an address range
      return !addressRanges.some(addr => 
        entity.start >= addr.start && entity.end <= addr.end
      );
    });

    // Merge without duplicates
    const allEntities = [...filteredAIEntities, ...regexEntities];
    
    const uniqueEntities = allEntities.filter((entity, index, self) => 
      index === self.findIndex(e => 
        e.start === entity.start && 
        e.end === entity.end && 
        e.label === entity.label
      )
    );

    return uniqueEntities.sort((a, b) => a.start - b.start);
  }
}
