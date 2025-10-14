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

  // Financial document patterns + name database detection
  detectAustralianPII(text: string): PIIEntity[] {
    const entities: PIIEntity[] = [];
    let match;
    
    // PERSON NAMES - Pattern-based detection
    
    // Pattern 1: Formal salutations (Dear John Smith,)
    const salutationPattern = /\b(?:Dear|Hello|Hi)\s+([A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?)/g;
    while ((match = salutationPattern.exec(text)) !== null) {
      const name = match[1];
      entities.push({
        text: name,
        label: 'Person Name',
        start: match.index + match[0].indexOf(name),
        end: match.index + match[0].indexOf(name) + name.length,
        score: 1.0
      });
    }
    
    // Pattern 2: Client/Adviser labels
    const labeledNamePattern = /\b(?:Client|Clients|Adviser|Representative|Prepared for|Member|Partner|Applicant)s?:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s*\(\d+\))?(?:\s*(?:,|and|&)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s*\(\d+\))?)?/gi;
    while ((match = labeledNamePattern.exec(text)) !== null) {
      if (match[1]) {
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
      if (match[2]) {
        const name = match[2];
        const start = match.index + match[0].indexOf(name);
        entities.push({
          text: name,
          label: 'Person Name',
          start,
          end: start + name.length,
          score: 1.0
        });
      }
    }
    
    // Pattern 3: Names as line subjects
    const subjectNamePattern = /^([A-Z][a-z]+):\s*(?:\$|Business|Teacher|Secondary|Manager|Director|Owner)/gm;
    while ((match = subjectNamePattern.exec(text)) !== null) {
      const name = match[1];
      entities.push({
        text: name,
        label: 'Person Name',
        start: match.index,
        end: match.index + name.length,
        score: 0.95
      });
    }
    
    // Pattern 4: Full names with age
    const nameAgePattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s*\((\d{2})\)/g;
    while ((match = nameAgePattern.exec(text)) !== null) {
      const name = match[1];
      entities.push({
        text: name,
        label: 'Person Name',
        start: match.index,
        end: match.index + name.length,
        score: 1.0
      });
    }
    
    // NAME DATABASE DETECTION - Enhanced contextual detection
    // Find all capitalized word pairs (potential names)
    const capitalizedPairPattern = /\b([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,15})\b/g;
    while ((match = capitalizedPairPattern.exec(text)) !== null) {
      const firstName = match[1];
      const lastName = match[2];
      const fullName = `${firstName} ${lastName}`;
      
      // Skip if already detected by patterns
      const alreadyDetected = entities.some(e => 
        e.start <= match.index && e.end >= match.index + fullName.length
      );
      if (alreadyDetected) continue;
      
      // Check against name database
      if (this.nameDatabase.isFullName(firstName, lastName)) {
        // Additional context validation
        const beforeText = text.substring(Math.max(0, match.index - 50), match.index);
        const afterText = text.substring(match.index + fullName.length, Math.min(text.length, match.index + fullName.length + 50));
        const context = beforeText + afterText;
        
        // Exclude if it looks like a company/location (common false positives)
        const excludePatterns = /\b(Pty Ltd|Limited|Company|Corporation|Street|Road|Avenue|City|State|Country)\b/i;
        if (excludePatterns.test(context)) continue;
        
        entities.push({
          text: fullName,
          label: 'Person Name',
          start: match.index,
          end: match.index + fullName.length,
          score: 0.90
        });
      }
    }
    
    // GOVERNMENT IDs
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
    
    // ADDRESSES
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
    
    // DATES OF BIRTH
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
    
    // Execute all structured patterns
    [...governmentPatterns, ...contactPatterns, ...accountPatterns].forEach(({ pattern, label }) => {
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
    // Run both detectors in parallel for efficiency
    const [aiEntities, regexEntities] = await Promise.all([
      this.detectPII(text),
      Promise.resolve(this.detectAustralianPII(text))
    ]);
    
    // Create exclusion zones for regex-detected entities
    const exclusionZones = regexEntities.map(e => ({ 
      start: e.start, 
      end: e.end,
      label: e.label 
    }));
    
    // Filter out AI entities that overlap with structured data we already caught
    const filteredAIEntities = aiEntities.filter(entity => {
      const overlaps = exclusionZones.some(zone => {
        return !(entity.end <= zone.start || entity.start >= zone.end);
      });
      return !overlaps;
    });

    // Combine AI detections with structured data detections
    const allEntities = [...filteredAIEntities, ...regexEntities];
    
    // Remove duplicates
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
