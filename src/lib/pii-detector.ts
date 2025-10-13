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

  // Additional regex patterns for Australian-specific PII
  detectAustralianPII(text: string): PIIEntity[] {
    const patterns = [
      {
        pattern: /\b(\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/g,
        label: 'ABN'
      },
      {
        pattern: /\b(\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/g,
        label: 'TFN'
      },
      {
        pattern: /\b(\d{4}[\s-]?\d{5}[\s-]?\d{1})\b/g,
        label: 'Medicare Number'
      },
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        label: 'Email'
      },
      {
        pattern: /(?:\+61[\s-]?)?(?:0[2-9][\s-]?)?[0-9]{4}[\s-]?[0-9]{4}\b/g,
        label: 'Phone Number'
      },
      {
        pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
        label: 'Credit Card'
      },
      {
        pattern: /\b(\d{3}-?\d{3}\s+\d{6,10})\b/g,
        label: 'Bank Account'
      }
    ];

    const entities: PIIEntity[] = [];
    patterns.forEach(({ pattern, label }) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          label,
          start: match.index,
          end: match.index + match[0].length,
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
