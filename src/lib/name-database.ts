// Name database for enhanced PII detection
// Uses public census/baby name data - NO client data sent externally

export class NameDatabase {
  private firstNames: Set<string> = new Set();
  private lastNames: Set<string> = new Set();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize(onProgress);
    return this.initPromise;
  }

  private async _initialize(onProgress?: (progress: number) => void): Promise<void> {
    try {
      // Check cache first
      const cachedData = this.loadFromCache();
      if (cachedData) {
        this.firstNames = new Set(cachedData.firstNames);
        this.lastNames = new Set(cachedData.lastNames);
        this.isInitialized = true;
        onProgress?.(100);
        console.log('Name database loaded from cache:', {
          firstNames: this.firstNames.size,
          lastNames: this.lastNames.size
        });
        return;
      }

      onProgress?.(10);

      // Load from public sources
      await Promise.all([
        this.loadFirstNames(onProgress),
        this.loadLastNames(onProgress)
      ]);

      // Save to cache
      this.saveToCache();
      this.isInitialized = true;
      onProgress?.(100);

      console.log('Name database initialized:', {
        firstNames: this.firstNames.size,
        lastNames: this.lastNames.size
      });
    } catch (error) {
      console.error('Failed to initialize name database:', error);
      // Fall back to minimal set
      this.loadFallbackNames();
      this.isInitialized = true;
      onProgress?.(100);
    }
  }

  private async loadFirstNames(onProgress?: (progress: number) => void): Promise<void> {
    try {
      // Using Australian top baby names + common international names
      // This is public census data, not client PII
      const response = await fetch('https://raw.githubusercontent.com/smashew/NameDatabases/master/NamesDatabases/first%20names/us.txt');
      const text = await response.text();
      
      const names = text.split('\n')
        .map(name => name.trim().toLowerCase())
        .filter(name => name.length > 1);
      
      names.forEach(name => this.firstNames.add(name));
      onProgress?.(50);
    } catch (error) {
      console.error('Failed to load first names:', error);
    }
  }

  private async loadLastNames(onProgress?: (progress: number) => void): Promise<void> {
    try {
      // Using common surnames database
      const response = await fetch('https://raw.githubusercontent.com/smashew/NameDatabases/master/NamesDatabases/surnames/us.txt');
      const text = await response.text();
      
      const names = text.split('\n')
        .map(name => name.trim().toLowerCase())
        .filter(name => name.length > 1);
      
      names.forEach(name => this.lastNames.add(name));
      onProgress?.(90);
    } catch (error) {
      console.error('Failed to load last names:', error);
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

  private loadFromCache(): { firstNames: string[]; lastNames: string[] } | null {
    try {
      const cached = localStorage.getItem('pii_name_database');
      if (!cached) return null;

      const data = JSON.parse(cached);
      const cacheDate = new Date(data.timestamp);
      const daysSinceCache = (Date.now() - cacheDate.getTime()) / (1000 * 60 * 60 * 24);

      // Refresh if older than 30 days
      if (daysSinceCache > 30) {
        console.log('Name database cache expired');
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to load cache:', error);
      return null;
    }
  }

  private saveToCache(): void {
    try {
      const data = {
        firstNames: Array.from(this.firstNames),
        lastNames: Array.from(this.lastNames),
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('pii_name_database', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
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
    localStorage.removeItem('pii_name_database');
    this.firstNames.clear();
    this.lastNames.clear();
    this.isInitialized = false;
    this.initPromise = null;
  }
}
