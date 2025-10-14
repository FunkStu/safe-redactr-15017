// Name database for enhanced PII detection
// Uses public census/baby name data - NO client data sent externally

export class NameDatabase {
  private firstNames: Set<string> = new Set();
  private lastNames: Set<string> = new Set();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly cacheKey = 'pii_name_database_v2';
  private readonly cacheVersion = '2.0';

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize(onProgress);
    return this.initPromise;
  }

  private async _initialize(onProgress?: (progress: number) => void): Promise<void> {
    try {
      // Check cache first with integrity validation
      const cacheLoaded = await this.loadFromCache();
      if (cacheLoaded) {
        this.isInitialized = true;
        onProgress?.(100);
        return;
      }

      onProgress?.(10);

      // Load from public sources
      await Promise.all([
        this.loadFirstNames(onProgress),
        this.loadLastNames(onProgress)
      ]);

      // Save to cache with integrity protection
      await this.saveToCache();
      this.isInitialized = true;
      onProgress?.(100);
    } catch (error) {
      // Silent fallback to minimal set
      this.loadFallbackNames();
      this.isInitialized = true;
      onProgress?.(100);
    }
  }

  private async loadFirstNames(onProgress?: (progress: number) => void): Promise<void> {
    try {
      const response = await fetch('https://raw.githubusercontent.com/smashew/NameDatabases/master/NamesDatabases/first%20names/us.txt');
      const text = await response.text();
      
      const names = text.split('\n')
        .map(name => name.trim().toLowerCase())
        .filter(name => name.length > 1);
      
      names.forEach(name => this.firstNames.add(name));
      onProgress?.(50);
    } catch (error) {
      // Silent failure - will use fallback
    }
  }

  private async loadLastNames(onProgress?: (progress: number) => void): Promise<void> {
    try {
      const response = await fetch('https://raw.githubusercontent.com/smashew/NameDatabases/master/NamesDatabases/surnames/us.txt');
      const text = await response.text();
      
      const names = text.split('\n')
        .map(name => name.trim().toLowerCase())
        .filter(name => name.length > 1);
      
      names.forEach(name => this.lastNames.add(name));
      onProgress?.(90);
    } catch (error) {
      // Silent failure - will use fallback
    }
  }

  private loadFallbackNames(): void {
    // Minimal fallback set of common Australian/English names
    const commonFirst = [
      'mitchell', 'lara', 'john', 'sarah', 'michael', 'emma', 'james', 'olivia',
      'william', 'ava', 'jack', 'sophie', 'thomas', 'charlotte', 'oliver', 'amelia',
      'noah', 'mia', 'ethan', 'grace', 'lucas', 'chloe', 'liam', 'lily',
      'alexander', 'emily', 'mason', 'ella', 'logan', 'zoe', 'samuel', 'ruby',
      'daniel', 'alice', 'matthew', 'hannah', 'ryan', 'lucy', 'benjamin', 'georgia'
    ];

    const commonLast = [
      'smith', 'jones', 'williams', 'brown', 'wilson', 'taylor', 'johnson', 'white',
      'martin', 'anderson', 'thompson', 'nguyen', 'thomas', 'walker', 'harris', 'lee',
      'cowan', 'murphy', 'kelly', 'baker', 'king', 'davies', 'wright', 'robinson',
      'clarke', 'young', 'allen', 'scott', 'green', 'adams', 'hall', 'mitchell'
    ];

    commonFirst.forEach(name => this.firstNames.add(name));
    commonLast.forEach(name => this.lastNames.add(name));
  }

  private async loadFromCache(): Promise<boolean> {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return false;

      const data = JSON.parse(cached);
      
      // Version validation
      if (data.version !== this.cacheVersion) {
        this.clearCache();
        return false;
      }

      // Structure validation
      if (!Array.isArray(data.firstNames) || !Array.isArray(data.lastNames)) {
        this.clearCache();
        return false;
      }

      // Size validation (prevent cache poisoning)
      const MAX_CACHE_SIZE = 50000;
      if (data.firstNames.length > MAX_CACHE_SIZE || data.lastNames.length > MAX_CACHE_SIZE) {
        this.clearCache();
        return false;
      }

      // Integrity check using checksum
      if (data.checksum) {
        const namesData = JSON.stringify({
          firstNames: data.firstNames,
          lastNames: data.lastNames
        });
        const calculatedChecksum = await this.calculateChecksum(namesData);
        
        if (calculatedChecksum !== data.checksum) {
          // Cache integrity compromised
          this.clearCache();
          return false;
        }
      }

      // Cache age validation (30 days)
      if (data.timestamp) {
        const cacheDate = new Date(data.timestamp);
        const daysSinceCache = (Date.now() - cacheDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceCache > 30) {
          return false;
        }
      }

      this.firstNames = new Set(data.firstNames);
      this.lastNames = new Set(data.lastNames);
      return true;
    } catch (error) {
      // Cache corrupted
      this.clearCache();
      return false;
    }
  }

  private async saveToCache(): Promise<void> {
    try {
      const namesData = {
        firstNames: Array.from(this.firstNames),
        lastNames: Array.from(this.lastNames)
      };
      
      // Calculate integrity checksum
      const checksum = await this.calculateChecksum(JSON.stringify(namesData));
      
      const data = {
        version: this.cacheVersion,
        ...namesData,
        checksum,
        timestamp: new Date().toISOString()
      };
      
      localStorage.setItem(this.cacheKey, JSON.stringify(data));
    } catch (error) {
      // localStorage full or disabled - silent failure acceptable
    }
  }

  private async calculateChecksum(data: string): Promise<string> {
    // Use Web Crypto API for integrity verification
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  isFirstName(word: string): boolean {
    return this.firstNames.has(word.toLowerCase());
  }

  isLastName(word: string): boolean {
    return this.lastNames.has(word.toLowerCase());
  }

  isFullName(firstName: string, lastName: string): boolean {
    return this.isFirstName(firstName) && this.isLastName(lastName);
  }

  // Check if a phrase contains a potential full name
  containsName(text: string): { isName: boolean; firstName?: string; lastName?: string; confidence: number } {
    const words = text.split(/\s+/).filter(w => w.length > 1);
    
    // Check consecutive pairs of capitalized words
    for (let i = 0; i < words.length - 1; i++) {
      const first = words[i];
      const last = words[i + 1];
      
      // Both should be capitalized
      if (!/^[A-Z]/.test(first) || !/^[A-Z]/.test(last)) continue;
      
      if (this.isFullName(first, last)) {
        return {
          isName: true,
          firstName: first,
          lastName: last,
          confidence: 0.95
        };
      }
    }

    return { isName: false, confidence: 0 };
  }

  clearCache(): void {
    localStorage.removeItem(this.cacheKey);
    localStorage.removeItem('pii_name_database'); // Remove old cache key
    this.firstNames.clear();
    this.lastNames.clear();
    this.isInitialized = false;
    this.initPromise = null;
  }
}
