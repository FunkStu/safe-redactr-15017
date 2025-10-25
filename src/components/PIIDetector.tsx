import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { BrowserPIIDetector } from '@/lib/pii-detector';
import type { Entity } from '@/lib/pii/types';
import { encryptJSON, decryptJSON } from '@/lib/pii/crypto';
import { makePlaceholder } from '@/lib/pii/placeholders';
import { Download, Upload, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { ComplianceDialog } from '@/components/ComplianceDialog';
import { AccuracyDisclaimer } from '@/components/AccuracyDisclaimer';
import { TermsOfUse } from '@/components/TermsOfUse';

export function PIIDetector() {
  const [inputText, setInputText] = useState('');
  const [detectedEntities, setDetectedEntities] = useState<Entity[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [redactedText, setRedactedText] = useState('');
  const [selectedEntities, setSelectedEntities] = useState<Set<number>>(new Set());
  const [redactionMap, setRedactionMap] = useState<Map<string, string>>(new Map());
  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [irreversible, setIrreversible] = useState(false);
  const [deterministic, setDeterministic] = useState(true);
  const detectorRef = useRef<BrowserPIIDetector | null>(null);
  const redactedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    detectorRef.current = new BrowserPIIDetector();
  }, []);

  const handleInitialize = async () => {
    if (!detectorRef.current) return;
    
    setIsInitializing(true);
    setInitProgress(0);
    try {
      await detectorRef.current.initialize((progress) => {
        setInitProgress(Math.round(progress));
      });
      toast({
        title: 'AI Model Ready',
        description: 'PII detection model loaded successfully',
        duration: 3000,
      });
    } catch (error) {
      console.error('Initialization error:', error);
      setInitProgress(0);
      toast({
        title: 'Initialization Failed',
        description: error instanceof Error ? error.message : 'Failed to load AI model. Check console for details.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const handleDetect = async () => {
    if (!inputText.trim()) {
      toast({
        title: 'No Text',
        description: 'Please enter text to analyze',
        variant: 'destructive',
      });
      return;
    }

    setIsDetecting(true);
    try {
      if (!detectorRef.current) {
        throw new Error('Detector not initialized');
      }

      const entities = await detectorRef.current.detectAll(inputText);
      setDetectedEntities(entities);
      setSelectedEntities(new Set(entities.map((_, i) => i)));
      
      toast({
        title: 'Detection Complete',
        description: `Found ${entities.length} potential PII items`,
        duration: 3000,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to detect PII';
      toast({
        title: 'Detection Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const toggleEntity = (index: number) => {
    const newSelected = new Set(selectedEntities);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedEntities(newSelected);
  };

  const handleRedact = () => {
    let result = inputText;
    const entitiesToRedact = detectedEntities
      .filter((_, i) => selectedEntities.has(i))
      .sort((a, b) => b.start - a.start); // Reverse order to maintain indices

    const newRedactionMap = new Map<string, string>();
    entitiesToRedact.forEach((entity) => {
      const placeholder = irreversible
        ? `[REDACTED_${entity.label}]`
        : makePlaceholder(entity.label, entity.text, deterministic);
      
      if (!irreversible) {
        newRedactionMap.set(placeholder, entity.text);
      }
      result = result.substring(0, entity.start) + placeholder + result.substring(entity.end);
    });

    if (!irreversible) {
      setRedactionMap(newRedactionMap);
    }
    setRedactedText(result);
    toast({
      title: 'Redaction Complete',
      description: irreversible 
        ? `Permanently redacted ${entitiesToRedact.length} items`
        : `Redacted ${entitiesToRedact.length} items`,
      duration: 3000,
    });
  };

  const handleUnredact = () => {
    let result = redactedText;
    redactionMap.forEach((originalText, placeholder) => {
      result = result.split(placeholder).join(originalText);
    });
    
    setRedactedText(result);
    toast({
      title: 'Unredaction Complete',
      description: `Restored ${redactionMap.size} items`,
      duration: 3000,
    });
  };

  const handleTextSelection = () => {
    const textarea = redactedTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = redactedText.substring(start, end);

    if (text.length > 0) {
      setSelectedText(text);
      setSelectionStart(start);
      setSelectionEnd(end);
    }
  };

  const handleManualRedact = () => {
    if (!selectedText || selectionStart === selectionEnd) {
      toast({
        title: 'No Text Selected',
        description: 'Please select text in the redacted area to manually redact',
        variant: 'destructive',
      });
      return;
    }

    const manualIndex = redactionMap.size + 1;
    const placeholder = `[REDACTED_MANUAL_${String(manualIndex).padStart(3, '0')}]`;
    
    const newRedactionMap = new Map(redactionMap);
    newRedactionMap.set(placeholder, selectedText);
    
    const newRedactedText = 
      redactedText.substring(0, selectionStart) + 
      placeholder + 
      redactedText.substring(selectionEnd);
    
    setRedactionMap(newRedactionMap);
    setRedactedText(newRedactedText);
    setSelectedText('');
    setSelectionStart(0);
    setSelectionEnd(0);
    
    toast({
      title: 'Manual Redaction Added',
      description: `"${selectedText}" has been redacted`,
      duration: 3000,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(redactedText);
    toast({
      title: 'Copied',
      description: 'Redacted text copied to clipboard',
      duration: 2000,
    });
  };

  const handleExportMapping = () => {
    if (redactionMap.size === 0) {
      toast({
        title: 'No Mapping',
        description: 'No redaction mapping available to export',
        variant: 'destructive',
      });
      return;
    }

    const mappingData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      mapping: Object.fromEntries(redactionMap),
    };

    const blob = new Blob([JSON.stringify(mappingData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redaction-mapping-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Mapping Exported',
      description: 'Redaction mapping saved securely',
      duration: 3000,
    });
  };

  const handleImportMapping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File size validation (1MB max for JSON to prevent JSON bomb attacks)
    const MAX_FILE_SIZE = 1 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File Too Large',
        description: 'Maximum file size is 1MB for JSON files',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    // File type validation
    if (!file.name.endsWith('.json')) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a JSON file',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        
        // Additional size validation
        if (content.length > MAX_FILE_SIZE) {
          throw new Error('Content exceeds size limit');
        }

        // Pre-parse depth validation to prevent JSON bomb attacks
        const nestingLevel = (content.match(/{/g) || []).length;
        if (nestingLevel > 100) {
          throw new Error('JSON structure too deeply nested (max 100 levels)');
        }

        // Check for excessive array/object count
        const objectCount = (content.match(/[{[]/g) || []).length;
        if (objectCount > 10000) {
          throw new Error('JSON structure too complex (max 10,000 elements)');
        }
        
        const data = JSON.parse(content);
        
        if (!data.mapping || typeof data.mapping !== 'object') {
          throw new Error('Invalid mapping format');
        }

        // Sanitize and validate each entry
        const validatedMap = new Map<string, string>();
        let invalidCount = 0;

        Object.entries(data.mapping).forEach(([key, value]) => {
          if (typeof key === 'string' && typeof value === 'string') {
            // Limit length and trim
            const sanitizedKey = key.substring(0, 500).trim();
            const sanitizedValue = value.substring(0, 1000).trim();
            
            if (sanitizedKey && sanitizedValue) {
              validatedMap.set(sanitizedKey, sanitizedValue);
            } else {
              invalidCount++;
            }
          } else {
            invalidCount++;
          }
        });

        if (validatedMap.size === 0) {
          throw new Error('No valid mappings found');
        }

        setRedactionMap(validatedMap);
        toast({
          title: 'Mapping Imported',
          description: `Loaded ${validatedMap.size} mappings${invalidCount > 0 ? ` (${invalidCount} invalid skipped)` : ''}`,
          duration: 3000,
        });
      } catch (error) {
        toast({
          title: 'Import Failed',
          description: error instanceof Error ? error.message : 'Invalid file format',
          variant: 'destructive',
        });
      }
    };
    
    reader.onerror = () => {
      toast({
        title: 'Read Failed',
        description: 'Failed to read file',
        variant: 'destructive',
      });
    };
    
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportEncryptedMapping = async () => {
    if (irreversible) {
      toast({
        title: 'Not Available',
        description: 'Irreversible mode: no mapping to export.',
        variant: 'destructive',
      });
      return;
    }
    
    if (redactionMap.size === 0) {
      toast({
        title: 'No Mapping',
        description: 'No redaction mapping available to export',
        variant: 'destructive',
      });
      return;
    }
    
    const pass = prompt('Set a passphrase to encrypt the mapping:');
    if (!pass) return;
    
    try {
      const mappingData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        mapping: Object.fromEntries(redactionMap),
      };
      
      const blob = await encryptJSON(mappingData, pass);
      const url = URL.createObjectURL(new Blob([JSON.stringify(blob)], {type:'application/json'}));
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = `mapping-${Date.now()}.piimap.json`; 
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Encrypted Mapping Exported',
        description: 'Mapping has been encrypted and saved',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Failed to encrypt mapping',
        variant: 'destructive',
      });
    }
  };

  const handleImportEncryptedMapping = async () => {
    const file = await new Promise<File | null>(resolve => {
      const inp = document.createElement('input'); 
      inp.type='file'; 
      inp.accept='.json,.piimap.json';
      inp.onchange = () => resolve(inp.files?.[0] ?? null); 
      inp.click();
    });
    
    if (!file) return;
    
    const pass = prompt('Enter the mapping passphrase:'); 
    if (!pass) return;
    
    try {
      const content = await file.text();
      const blob = JSON.parse(content);
      const mappingData = await decryptJSON(blob, pass);
      
      if (!mappingData.mapping || typeof mappingData.mapping !== 'object') {
        throw new Error('Invalid mapping format');
      }
      
      const validatedMap = new Map<string, string>();
      Object.entries(mappingData.mapping).forEach(([key, value]) => {
        if (typeof key === 'string' && typeof value === 'string') {
          validatedMap.set(key, value);
        }
      });
      
      if (validatedMap.size === 0) {
        throw new Error('No valid mappings found');
      }
      
      setRedactionMap(validatedMap);
      toast({
        title: 'Encrypted Mapping Imported',
        description: `Loaded ${validatedMap.size} mappings`,
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to decrypt or import mapping',
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File size validation (10MB max)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File Too Large',
        description: 'Maximum file size is 10MB',
        variant: 'destructive',
      });
      return;
    }

    // File type validation (check MIME type if available)
    if (file.type && !file.type.startsWith('text/')) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a text file',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        
        // Validate content size
        if (content.length > MAX_FILE_SIZE) {
          toast({
            title: 'Content Too Large',
            description: 'File content exceeds 10MB limit',
            variant: 'destructive',
          });
          return;
        }
        
        // Basic content validation (detect binary data)
        const nonPrintableCount = (content.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g) || []).length;
        if (nonPrintableCount > content.length * 0.1) {
          toast({
            title: 'Invalid Content',
            description: 'File appears to contain binary data',
            variant: 'destructive',
          });
          return;
        }
        
        setInputText(content);
        toast({
          title: 'File Loaded',
          description: `Loaded ${content.length} characters`,
          duration: 2000,
        });
      } catch (error) {
        toast({
          title: 'Load Failed',
          description: 'Failed to process file',
          variant: 'destructive',
        });
      }
    };
    
    reader.onerror = () => {
      toast({
        title: 'Read Failed',
        description: 'Failed to read file',
        variant: 'destructive',
      });
    };
    
    reader.readAsText(file);
  };

  const getLabelColor = (label: string) => {
    const colors: { [key: string]: string } = {
      'PERSON': 'bg-red-500',
      'EMAIL': 'bg-orange-500',
      'PHONE': 'bg-yellow-500',
      'ABN': 'bg-green-500',
      'TFN': 'bg-blue-500',
      'MEDICARE': 'bg-indigo-500',
      'CREDIT_CARD': 'bg-purple-500',
      'BANK_ACCT': 'bg-pink-500',
      'BSB': 'bg-pink-600',
      'LOC': 'bg-cyan-500',
      'ORG': 'bg-teal-500',
      'ADDRESS': 'bg-blue-600',
      'AFSL': 'bg-green-600',
      'AR': 'bg-green-700',
      'DOB': 'bg-red-600',
    };
    return colors[label] || 'bg-gray-500';
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                <CardTitle>AI Powered PII Redactr</CardTitle>
              </div>
              <CardDescription className="mt-1.5">
                100% local processing - no data leaves your browser. Compliant with Australian financial regulations. <ComplianceDialog />
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <TermsOfUse />
              {initProgress > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      const { runEval } = await import('@/lib/pii/evaluate/harness');
                      toast({
                        title: 'Running Evaluation',
                        description: 'Testing detection accuracy...',
                        duration: 2000,
                      });
                      const res = await runEval();
                      console.table(res);
                      const passing = res.filter(r => r.ok).length;
                      toast({
                        title: 'Evaluation Complete',
                        description: `${passing}/${res.length} tests passing`,
                        duration: 5000,
                      });
                      alert(`Eval complete: ${passing}/${res.length} passing\n\nCheck console for details.`);
                    } catch (error) {
                      toast({
                        title: 'Evaluation Failed',
                        description: error instanceof Error ? error.message : 'Unknown error',
                        variant: 'destructive',
                      });
                    }
                  }}
                  className="text-xs"
                >
                  Run Eval
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isInitializing && initProgress === 0 && (
            <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/50">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">AI Model Not Loaded</p>
                <p className="text-xs text-muted-foreground">Initialize the AI model to start detecting PII (one-time download ~50MB)</p>
              </div>
              <Button onClick={handleInitialize}>
                Initialize AI Model
              </Button>
            </div>
          )}

          {isInitializing && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Downloading AI model... {initProgress}%</p>
              <Progress value={initProgress} />
            </div>
          )}

          {initProgress > 0 && !isInitializing && (
            <>
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <p className="text-sm font-medium text-green-600 dark:text-green-400">AI Model Ready</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">To Redact</h3>
                  <ol className="text-sm space-y-1 text-muted-foreground list-decimal list-inside">
                    <li>Paste text or upload your file</li>
                    <li>Click Redact PII</li>
                    <li>Check output and manually redact as needed</li>
                    <li>Export Mapping and store safely</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">To Unredact</h3>
                  <ol className="text-sm space-y-1 text-muted-foreground list-decimal list-inside">
                    <li>Import previous mapping</li>
                    <li>Paste redacted text</li>
                    <li>Check output</li>
                  </ol>
                </div>
              </div>
            </>
          )}

          {initProgress > 0 && !isInitializing && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <h3 className="font-semibold text-sm">Redaction Settings</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={irreversible} 
                    onChange={e => setIrreversible(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span>Irreversible redaction (no mapping; permanent)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={deterministic} 
                    onChange={e => setDeterministic(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                    disabled={irreversible}
                  />
                  <span className={irreversible ? 'text-muted-foreground' : ''}>
                    Deterministic placeholders (same value → same token)
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Input Text</label>
              <div className="flex gap-2">
                <label htmlFor="file-upload">
                  <Button variant="outline" size="sm" asChild>
                    <span className="cursor-pointer flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload File
                    </span>
                  </Button>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
                <label htmlFor="mapping-upload-top">
                  <Button variant="outline" size="sm" asChild>
                    <span className="cursor-pointer flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Import Mapping
                    </span>
                  </Button>
                  <input
                    id="mapping-upload-top"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportMapping}
                  />
                </label>
              </div>
            </div>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste or type text containing potential PII..."
              className="min-h-[200px] font-mono text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleDetect} 
              disabled={!inputText.trim() || isDetecting || initProgress === 0}
              className="flex-1 bg-[#003878] hover:bg-[#003878]/90 text-white"
            >
              {isDetecting ? 'Detecting PII...' : 'Detect PII'}
            </Button>
            {redactionMap.size > 0 && inputText.trim() && (
              <Button 
                onClick={() => {
                  let result = inputText;
                  redactionMap.forEach((originalText, placeholder) => {
                    result = result.split(placeholder).join(originalText);
                  });
                  setRedactedText(result);
                  toast({
                    title: 'Unredaction Complete',
                    description: `Restored ${redactionMap.size} items - check output below`,
                    duration: 3000,
                  });
                }}
                variant="secondary"
                className="flex-1"
              >
                Unredact
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {detectedEntities.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Detected PII ({detectedEntities.length} items)</CardTitle>
              <CardDescription>
                Review and select items to redact. AI-detected items are marked with confidence scores.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {detectedEntities.map((entity, index) => (
                  <div
                    key={index}
                    onClick={() => toggleEntity(index)}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedEntities.has(index) 
                        ? 'bg-primary/10 border-primary' 
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedEntities.has(index)}
                        onChange={() => toggleEntity(index)}
                        className="h-4 w-4"
                      />
                      <Badge className={getLabelColor(entity.label)}>
                        {entity.label}
                      </Badge>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {entity.text}
                      </code>
                    </div>
                    {entity.score !== undefined && entity.score < 1 && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(entity.score * 100)}% confidence
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={handleRedact} className="flex-1">
                  Redact Selected ({selectedEntities.size})
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedEntities(new Set(detectedEntities.map((_, i) => i)))}
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedEntities(new Set())}
                >
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>

          {redactedText && (
            <Card>
              <CardHeader>
                <CardTitle>Output</CardTitle>
                <CardDescription>
                  Review the results below
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AccuracyDisclaimer />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Redacted Output</label>
                    {selectedText && (
                      <Badge variant="outline" className="text-xs">
                        {selectedText.length} characters selected
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    ref={redactedTextareaRef}
                    value={redactedText}
                    onChange={(e) => setRedactedText(e.target.value)}
                    onSelect={handleTextSelection}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    onClick={handleManualRedact} 
                    variant="secondary"
                    disabled={!selectedText || irreversible}
                    title={irreversible ? "Manual redaction not available in irreversible mode" : ""}
                  >
                    Manual Redact
                  </Button>
                  <Button onClick={handleCopy} className="flex-1" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Copy Text
                  </Button>
                  {redactionMap.size > 0 && (
                    <>
                      <Button onClick={handleExportMapping} className="flex-1" variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Export Mapping
                      </Button>
                      <Button onClick={handleExportEncryptedMapping} className="flex-1" variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Export Encrypted
                      </Button>
                      <Button onClick={handleUnredact} className="flex-1" variant="outline">
                        Unredact
                      </Button>
                    </>
                  )}
                  <label htmlFor="mapping-upload" className="flex-1">
                    <Button variant="outline" className="w-full" asChild>
                      <span className="cursor-pointer flex items-center justify-center gap-2">
                        <Upload className="h-4 w-4" />
                        Import Mapping
                      </span>
                    </Button>
                    <input
                      id="mapping-upload"
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleImportMapping}
                    />
                  </label>
                  <Button 
                    onClick={handleImportEncryptedMapping} 
                    className="flex-1" 
                    variant="outline"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Encrypted
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
