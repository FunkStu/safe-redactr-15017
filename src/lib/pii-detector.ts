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

  // Financial document patterns + name database detection + age/DOB calculation
  detectAustralianPII(text: string): PIIEntity[] {
    const entities: PIIEntity[] = [];
    let match;
    
    // STEP 1: Extract document date for age calculations
    const documentDate = this.extractDocumentDate(text);
    console.log('Document date detected:', documentDate);
    
    // STEP 2: Detect ages and calculate potential DOBs
    const ageData: Map<string, { age: number; calculatedDOB: Date }> = new Map();
    
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
    
    // Pattern 2: Client/Adviser labels (with age extraction)
    const labeledNamePattern = /\b(?:Client|Clients|Adviser|Representative|Prepared for|Member|Partner|Applicant)s?:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s*\((\d+)\))?(?:\s*(?:,|and|&)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s*\((\d+)\))?)?/gi;
    while ((match = labeledNamePattern.exec(text)) !== null) {
      // First person
      if (match[1]) {
        const name = match[1];
        const age = match[2] ? parseInt(match[2]) : null;
        const start = match.index + match[0].indexOf(name);
        
        entities.push({
          text: name,
          label: 'Person Name',
          start,
          end: start + name.length,
          score: 1.0,
          metadata: age && documentDate ? {
            age,
            documentDate: documentDate.toISOString().split('T')[0],
            calculatedDOB: this.calculateDOBFromAge(age, documentDate).toISOString().split('T')[0]
          } : undefined
        });
        
        if (age && documentDate) {
          const calculatedDOB = this.calculateDOBFromAge(age, documentDate);
          ageData.set(name, { age, calculatedDOB });
        }
      }
      
      // Second person
      if (match[3]) {
        const name = match[3];
        const age = match[4] ? parseInt(match[4]) : null;
        const start = match.index + match[0].indexOf(name);
        
        entities.push({
          text: name,
          label: 'Person Name',
          start,
          end: start + name.length,
          score: 1.0,
          metadata: age && documentDate ? {
            age,
            documentDate: documentDate.toISOString().split('T')[0],
            calculatedDOB: this.calculateDOBFromAge(age, documentDate).toISOString().split('T')[0]
          } : undefined
        });
        
        if (age && documentDate) {
          const calculatedDOB = this.calculateDOBFromAge(age, documentDate);
          ageData.set(name, { age, calculatedDOB });
        }
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
    
    // Pattern 4: Full names with age (enhanced with DOB calculation)
    const nameAgePattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s*\((\d{2})\)/g;
    while ((match = nameAgePattern.exec(text)) !== null) {
      const name = match[1];
      const age = parseInt(match[2]);
      
      entities.push({
        text: name,
        label: 'Person Name',
        start: match.index,
        end: match.index + name.length,
        score: 1.0,
        metadata: documentDate ? {
          age,
          documentDate: documentDate.toISOString().split('T')[0],
          calculatedDOB: this.calculateDOBFromAge(age, documentDate).toISOString().split('T')[0]
        } : { age }
      });
      
      if (documentDate) {
        const calculatedDOB = this.calculateDOBFromAge(age, documentDate);
        ageData.set(name, { age, calculatedDOB });
      }
      
      // Also flag the age itself
      const ageStart = match.index + match[0].indexOf(match[2]);
      entities.push({
        text: match[2],
        label: 'Age',
        start: ageStart,
        end: ageStart + match[2].length,
        score: 1.0,
        metadata: documentDate ? {
          age,
          calculatedDOB: this.calculateDOBFromAge(age, documentDate).toISOString().split('T')[0]
        } : { age }
      });
    }
    
    // NAME DATABASE DETECTION
    const capitalizedPairPattern = /\b([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,15})\b/g;
    while ((match = capitalizedPairPattern.exec(text)) !== null) {
      const firstName = match[1];
      const lastName = match[2];
      const fullName = `${firstName} ${lastName}`;
      
      const alreadyDetected = entities.some(e => 
        e.start <= match.index && e.end >= match.index + fullName.length
      );
      if (alreadyDetected) continue;
      
      if (this.nameDatabase.isFullName(firstName, lastName)) {
        const beforeText = text.substring(Math.max(0, match.index - 50), match.index);
        const afterText = text.substring(match.index + fullName.length, Math.min(text.length, match.index + fullName.length + 50));
        const context = beforeText + afterText;
        
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
    
    // DATES OF BIRTH - Enhanced with calculated DOB matching
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
    
    // DETECT DATES MATCHING CALCULATED DOBs (within 3 years)
    if (ageData.size > 0) {
      const datePattern = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})\b/g;
      while ((match = datePattern.exec(text)) !== null) {
        const dateStr = match[0];
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        let year = parseInt(match[3]);
        
        // Convert 2-digit year to 4-digit
        if (year < 100) {
          year += year > 30 ? 1900 : 2000;
        }
        
        const detectedDate = new Date(year, month - 1, day);
        
        // Check if already marked as DOB
        const alreadyDOB = entities.some(e => 
          e.label === 'Date of Birth' && e.start === match.index
        );
        if (alreadyDOB) continue;
        
        // Check against all calculated DOBs
        for (const [name, { calculatedDOB }] of ageData.entries()) {
          if (this.isDateWithinRange(detectedDate, calculatedDOB, 3)) {
            entities.push({
              text: dateStr,
              label: 'Date of Birth',
              start: match.index,
              end: match.index + dateStr.length,
              score: 0.95,
              metadata: {
                calculatedDOB: calculatedDOB.toISOString().split('T')[0]
              }
            });
            break;
          }
        }
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

  private extractDocumentDate(text: string): Date | null {
    // Try various document date patterns
    const patterns = [
      /(?:Date|Meeting Date|Document Date|As at|As of):\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
      /(?:Dated|Prepared on):\s*(\d{1,2})\s+(\w+)\s+(\d{4})/i,
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let day: number, month: number, year: number;
        
        if (match[2].match(/[a-z]/i)) {
          // Month name format
          const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          month = monthNames.findIndex(m => match[2].toLowerCase().startsWith(m)) + 1;
          day = parseInt(match[1]);
          year = parseInt(match[3]);
        } else {
          // Numeric format
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
        }
        
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return new Date(year, month - 1, day);
        }
      }
    }
    
    // Default to today if no date found
    return new Date();
  }

  private calculateDOBFromAge(age: number, documentDate: Date): Date {
    const birthYear = documentDate.getFullYear() - age;
    // Return mid-year estimate (June 30)
    return new Date(birthYear, 5, 30);
  }

  private isDateWithinRange(date: Date, targetDate: Date, yearsRange: number): boolean {
    const yearsDiff = Math.abs(date.getFullYear() - targetDate.getFullYear());
    
    if (yearsDiff > yearsRange) return false;
    if (yearsDiff < yearsRange) return true;
    
    // Check if within the year boundary
    const monthsDiff = Math.abs(
      (date.getFullYear() * 12 + date.getMonth()) - 
      (targetDate.getFullYear() * 12 + targetDate.getMonth())
    );
    
    return monthsDiff <= yearsRange * 12;
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
