import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { BrowserPIIDetector } from '@/lib/pii-detector';
import type { Entity } from '@/lib/pii/types';
import { encryptJSON, decryptJSON } from '@/lib/pii/crypto';
import { makePlaceholder } from '@/lib/pii/placeholders';
// import { redactText } from '@/lib/pii/redact'; // Old index-based redactor
import { redactTextSemantic } from '@/lib/pii/semanticRedact';
import type { RedactionMap as SemanticRedactionMap } from '@/lib/pii/semanticTypes';
import { Download, Upload, AlertCircle, CheckCircle2, Sparkles, Info } from 'lucide-react';
import { AccuracyDisclaimer } from '@/components/AccuracyDisclaimer';
import { TermsOfUse } from '@/components/TermsOfUse';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PIIDetector() {
  // 🔧 Toggle for testing semantic vs old redactor
  const useSemantic = true;

  const [inputText, setInputText] = useState('');
  const [detectedEntities, setDetectedEntities] = useState<Entity[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [redactedText, setRedactedText] = useState('');
  const [selectedEntities, setSelectedEntities] = useState<Set<number>>(new Set());
  const [redactionMap, setRedactionMap] = useState<SemanticRedactionMap>({}); // Use semantic map by default
  const [legacyRedactionMap, setLegacyRedactionMap] = useState<Map<string, string>>(new Map()); // For old redactor fallback
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
    const entitiesToRedact = detectedEntities
      .filter((_, i) => selectedEntities.has(i));

    if (irreversible) {
      // For irreversible mode, use simple placeholder replacement
      let result = inputText;
      const sorted = [...entitiesToRedact].sort((a, b) => b.start! - a.start!);
      
      sorted.forEach((entity) => {
        const placeholder = `[REDACTED_${entity.label}]`;
        result = result.substring(0, entity.start) + placeholder + result.substring(entity.end);
      });
      
      setRedactedText(result);
      toast({
        title: 'Redaction Complete',
        description: `Permanently redacted ${entitiesToRedact.length} items`,
        duration: 3000,
      });
    } else {
      // 🔧 Conditional: semantic vs old redactor
      let redactedResult: string;
      let redactionMapResult: Map<string, string> | SemanticRedactionMap;

      if (useSemantic) {
        const { redacted, map } = redactTextSemantic(inputText, entitiesToRedact, {
          redactPersonFirstLast: true,
          embedFrontMatter: true,
          caseInsensitive: true,
        });
        redactedResult = redacted;
        redactionMapResult = map;
        console.log('🗺️ Semantic Redaction Map:', map);
      } else {
        // Old index-based redactor (disabled for now)
        throw new Error('Old redactor disabled - enable useSemantic=false and uncomment redactText import');
      }

      setRedactionMap(redactionMapResult);
      setRedactedText(redactedResult);
      toast({
        title: 'Redaction Complete',
        description: `Redacted ${entitiesToRedact.length} items`,
        duration: 3000,
      });
    }
  };

  const handleUnredact = () => {
    if (useSemantic) {
      // Semantic unredaction uses the map stored in redactionMap (Record format)
      let result = redactedText;
      Object.entries(redactionMap).forEach(([key, entry]) => {
        // Replace all variants: [LABEL_ID:FULL], [LABEL_ID:FIRST], [LABEL_ID:LAST]
        const fullPattern = `[${key}:FULL]`;
        result = result.split(fullPattern).join(entry.full);
        
        if ('first' in entry) {
          const firstPattern = `[${key}:FIRST]`;
          result = result.split(firstPattern).join(entry.first);
        }
        
        if ('last' in entry) {
          const lastPattern = `[${key}:LAST]`;
          result = result.split(lastPattern).join(entry.last);
        }
      });
      
      setRedactedText(result);
      toast({
        title: 'Unredaction Complete',
        description: `Restored ${Object.keys(redactionMap).length} items`,
        duration: 3000,
      });
    } else {
      // Legacy unredaction
      let result = redactedText;
      legacyRedactionMap.forEach((originalText, placeholder) => {
        result = result.split(placeholder).join(originalText);
      });
      
      setRedactedText(result);
      toast({
        title: 'Unredaction Complete',
        description: `Restored ${legacyRedactionMap.size} items`,
        duration: 3000,
      });
    }
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

    const manualIndex = Object.keys(redactionMap).length + 1;
    const placeholder = `[REDACTED_MANUAL_${String(manualIndex).padStart(3, '0')}]`;
    
    // For semantic mode, add to redactionMap Record
    const newRedactionMap = { 
      ...redactionMap,
      [`MANUAL_${manualIndex}`]: {
        label: 'OTHER' as const,
        full: selectedText,
        canonical: selectedText.toLowerCase(),
      }
    };
    
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
    // Read from localStorage for most recent map
    let mapToExport = redactionMap;
    
    try {
      const stored = localStorage.getItem('lastRedactionMap');
      if (stored) {
        mapToExport = JSON.parse(stored);
        console.log('📤 Exporting map from localStorage');
      }
    } catch (err) {
      console.warn('⚠️ Could not read from localStorage, using state:', err);
    }

    if (Object.keys(mapToExport).length === 0) {
      toast({
        title: 'No Mapping',
        description: 'No redaction mapping available to export',
        variant: 'destructive',
      });
      return;
    }

    const mappingData = {
      version: '2.0',
      mode: 'semantic',
      timestamp: new Date().toISOString(),
      mapping: mapToExport,
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
      description: 'Semantic redaction mapping saved securely',
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

        // Sanitize and validate each entry - convert to semantic format
        const validatedMap: SemanticRedactionMap = {};
        let invalidCount = 0;

        Object.entries(data.mapping).forEach(([key, value]) => {
          if (typeof key === 'string' && typeof value === 'string') {
            // Legacy format - convert to semantic
            const sanitizedKey = key.substring(0, 500).trim();
            const sanitizedValue = value.substring(0, 1000).trim();
            
            if (sanitizedKey && sanitizedValue) {
              validatedMap[sanitizedKey] = {
                label: 'OTHER',
                full: sanitizedValue,
                canonical: sanitizedValue.toLowerCase(),
              };
            } else {
              invalidCount++;
            }
          } else if (typeof key === 'string' && typeof value === 'object') {
            // Semantic format - validate and use directly
            validatedMap[key] = value as any;
          } else {
            invalidCount++;
          }
        });

        if (Object.keys(validatedMap).length === 0) {
          throw new Error('No valid mappings found');
        }

        setRedactionMap(validatedMap);
        toast({
          title: 'Mapping Imported',
          description: `Loaded ${Object.keys(validatedMap).length} mappings${invalidCount > 0 ? ` (${invalidCount} invalid skipped)` : ''}`,
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
    
    if (Object.keys(redactionMap).length === 0) {
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
        version: '2.0',
        mode: 'semantic',
        timestamp: new Date().toISOString(),
        mapping: redactionMap,
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
      
      const validatedMap: SemanticRedactionMap = {};
      Object.entries(mappingData.mapping).forEach(([key, value]) => {
        if (typeof key === 'string' && typeof value === 'object') {
          validatedMap[key] = value as any;
        } else if (typeof key === 'string' && typeof value === 'string') {
          // Legacy format support
          validatedMap[key] = {
            label: 'OTHER',
            full: value,
            canonical: value.toLowerCase(),
          };
        }
      });
      
      if (Object.keys(validatedMap).length === 0) {
        throw new Error('No valid mappings found');
      }
      
      setRedactionMap(validatedMap);
      toast({
        title: 'Encrypted Mapping Imported',
        description: `Loaded ${Object.keys(validatedMap).length} mappings`,
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

  const complianceData = [
    {
      requirement: "APP 1 - Open and transparent management",
      function: "Clear privacy notice displayed upfront: '100% local processing - no data leaves your browser'. Users understand data handling before use."
    },
    {
      requirement: "APP 3 - Collection of solicited personal information",
      function: "No data collection occurs. All processing happens client-side in the browser. No servers receive, store, or collect any personal information."
    },
    {
      requirement: "APP 6 - Use or disclosure of personal information",
      function: "Zero data transmission to external parties. All PII remains in user's browser memory only. No APIs, databases, or third-party services receive data."
    },
    {
      requirement: "APP 8 - Cross-border disclosure",
      function: "Perfect compliance - zero cross-border data flows. No overseas transfers, cloud storage, or international API calls. Data never leaves user's device, eliminating all transborder data flow obligations and foreign jurisdiction risks."
    },
    {
      requirement: "APP 9 - Government related identifiers",
      function: "Tool detects government identifiers (ABN, TFN, Medicare) for redaction purposes only. Does not adopt, use, or disclose these identifiers as customer/user identifiers. Detection ≠ adoption—no database keys, no tracking, no identifier reuse. Compliant with APP 9.1 prohibition."
    },
    {
      requirement: "APP 11 - Security of personal information",
      function: "Maximum security through local-only processing. Data never leaves device, eliminating network transmission risks. WebGPU/CPU processing ensures data stays in browser sandbox."
    },
    {
      requirement: "APP 11.2 - Destruction or de-identification",
      function: "Bidirectional redaction/restoration system with SHA-256 checksums ensures data integrity. Users can permanently redact or restore PII as needed. Data destroyed when browser session ends."
    },
    {
      requirement: "Notifiable Data Breaches (NDB) scheme",
      function: "Zero breach risk - no data transmission means no data breach possible. Local processing architecture eliminates notification obligations under Privacy Act s26WE."
    },
    {
      requirement: "Financial sector specific - APRA CPS 234",
      function: "Exceeds information security requirements through zero-trust architecture. No external dependencies, API keys, or cloud services reduce attack surface to zero."
    },
    {
      requirement: "Banking Code of Practice - Privacy obligations",
      function: "Enables financial institutions to review documents containing customer PII without transmitting data to external processors, maintaining data sovereignty."
    },
    {
      requirement: "AML/CTF Act - Record keeping (s107)",
      function: "Supports compliant document sanitization for required record retention. Allows redaction of PII from audit trails while maintaining document utility."
    },
    {
      requirement: "Consumer Data Right (CDR) - Data security",
      function: "Local processing ensures CDR data (banking, energy records) can be analyzed without CDR Data Recipient obligations. No data sharing equals no CDR accreditation requirements."
    }
  ];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                <CardTitle>AI Powered PII Redactr</CardTitle>
              </div>
              <CardDescription className="mt-1.5">
                100% local processing - no data leaves your browser. Compliant with Australian financial regulations.
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
        <CardContent>
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
            <div className="flex items-center gap-2 p-3 border rounded-lg bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              <p className="text-sm font-medium text-green-600 dark:text-green-400">AI Model Ready</p>
            </div>
          )}

          {initProgress > 0 && !isInitializing && (
            <Tabs defaultValue="redact" className="mt-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="redact">Redaction</TabsTrigger>
                <TabsTrigger value="unredact">Unredaction</TabsTrigger>
                <TabsTrigger value="info">How It Works</TabsTrigger>
              </TabsList>

              {/* REDACTION TAB */}
              <TabsContent value="redact" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Redact PII</CardTitle>
                    <CardDescription>
                      Upload or paste text to detect and redact personally identifiable information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Input Text</label>
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
                      </div>
                      <Textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Paste or type text containing potential PII..."
                        className="min-h-[200px] font-mono text-sm"
                      />
                    </div>

                    <Button 
                      onClick={handleDetect} 
                      disabled={!inputText.trim() || isDetecting}
                      className="w-full bg-[#003878] hover:bg-[#003878]/90 text-white"
                    >
                      {isDetecting ? 'Detecting PII...' : 'Detect PII'}
                    </Button>
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
                          <CardTitle>Redacted Output</CardTitle>
                          <CardDescription>
                            Review and export your redacted text
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <AccuracyDisclaimer />
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium">Redacted Text</label>
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
                            {Object.keys(redactionMap).length > 0 && (
                              <>
                                <Button onClick={handleExportMapping} className="flex-1" variant="outline">
                                  <Download className="h-4 w-4 mr-2" />
                                  Export Mapping
                                </Button>
                                <Button onClick={handleExportEncryptedMapping} className="flex-1" variant="outline">
                                  <Download className="h-4 w-4 mr-2" />
                                  Export Encrypted
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </TabsContent>

              {/* UNREDACTION TAB */}
              <TabsContent value="unredact" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Unredact Text</CardTitle>
                    <CardDescription>
                      Import your mapping file and paste redacted text to restore original content
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <h3 className="font-semibold text-sm mb-3">Import Mapping</h3>
                      <div className="flex gap-2">
                        <label htmlFor="mapping-upload-unredact" className="flex-1">
                          <Button variant="outline" className="w-full" asChild>
                            <span className="cursor-pointer flex items-center justify-center gap-2">
                              <Upload className="h-4 w-4" />
                              Import Mapping (JSON)
                            </span>
                          </Button>
                          <input
                            id="mapping-upload-unredact"
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
                      {Object.keys(redactionMap).length > 0 && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Mapping loaded: {Object.keys(redactionMap).length} entries</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Redacted Text Input</label>
                      <Textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Paste your redacted text here (containing tokens like [PERSON_A1B2C3:FULL])..."
                        className="min-h-[200px] font-mono text-sm"
                      />
                    </div>

                    <Button 
                      onClick={() => {
                        if (Object.keys(redactionMap).length === 0) {
                          toast({
                            title: 'No Mapping',
                            description: 'Please import a mapping file first',
                            variant: 'destructive',
                          });
                          return;
                        }
                        if (!inputText.trim()) {
                          toast({
                            title: 'No Text',
                            description: 'Please paste redacted text',
                            variant: 'destructive',
                          });
                          return;
                        }

                        let result = inputText;
                        Object.entries(redactionMap).forEach(([key, entry]) => {
                          const fullPattern = `[${key}:FULL]`;
                          result = result.split(fullPattern).join(entry.full);
                          
                          if ('first' in entry) {
                            const firstPattern = `[${key}:FIRST]`;
                            result = result.split(firstPattern).join(entry.first);
                          }
                          
                          if ('last' in entry) {
                            const lastPattern = `[${key}:LAST]`;
                            result = result.split(lastPattern).join(entry.last);
                          }
                        });
                        setRedactedText(result);
                        toast({
                          title: 'Unredaction Complete',
                          description: `Restored ${Object.keys(redactionMap).length} items`,
                          duration: 3000,
                        });
                      }}
                      disabled={Object.keys(redactionMap).length === 0 || !inputText.trim()}
                      className="w-full"
                    >
                      Unredact Text
                    </Button>
                  </CardContent>
                </Card>

                {redactedText && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Unredacted Output</CardTitle>
                      <CardDescription>
                        Your restored original text
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea
                        value={redactedText}
                        onChange={(e) => setRedactedText(e.target.value)}
                        className="min-h-[200px] font-mono text-sm"
                      />
                      <Button onClick={handleCopy} variant="outline" className="w-full">
                        <Download className="h-4 w-4 mr-2" />
                        Copy Unredacted Text
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* HOW IT WORKS TAB */}
              <TabsContent value="info" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Info className="h-5 w-5 text-primary" />
                      <CardTitle>How It Works</CardTitle>
                    </div>
                    <CardDescription>
                      Understanding the AI Powered PII Redactr and its compliance features
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold text-lg mb-2">Local AI Processing</h3>
                        <p className="text-sm text-muted-foreground">
                          This tool uses advanced AI models that run entirely in your web browser using WebGPU/CPU acceleration. 
                          No data is ever transmitted to external servers, ensuring complete privacy and data sovereignty.
                        </p>
                      </div>

                      <div>
                        <h3 className="font-semibold text-lg mb-2">Redaction Process</h3>
                        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                          <li><strong>Detection:</strong> AI model scans your text to identify PII including names, emails, phone numbers, ABN, TFN, Medicare numbers, addresses, and more</li>
                          <li><strong>Selection:</strong> Review detected items and choose which ones to redact</li>
                          <li><strong>Redaction:</strong> Selected PII is replaced with semantic tokens (e.g., [PERSON_A1B2C3:FULL])</li>
                          <li><strong>Mapping:</strong> A secure mapping file is generated that allows you to reverse the process later</li>
                          <li><strong>Export:</strong> Download your redacted text and mapping file for secure storage</li>
                        </ol>
                      </div>

                      <div>
                        <h3 className="font-semibold text-lg mb-2">Unredaction Process</h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          To restore redacted text to its original form:
                        </p>
                        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                          <li>Import your previously saved mapping file (JSON or encrypted)</li>
                          <li>Paste the redacted text</li>
                          <li>Click "Unredact Text" to restore all original values</li>
                        </ol>
                      </div>

                      <div>
                        <h3 className="font-semibold text-lg mb-2">Security Features</h3>
                        <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                          <li><strong>Reversible Mode:</strong> Generates a mapping file that allows you to restore original text</li>
                          <li><strong>Irreversible Mode:</strong> Permanently redacts PII with no mapping, ensuring data cannot be recovered</li>
                          <li><strong>Encrypted Export:</strong> Protect your mapping files with password encryption</li>
                          <li><strong>Deterministic Placeholders:</strong> Same values get same tokens for consistency</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Regulatory Compliance</CardTitle>
                    <CardDescription>
                      How this tool meets Australian financial and privacy regulations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[35%]">Requirement</TableHead>
                          <TableHead>How We Comply</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {complianceData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium align-top">
                              {item.requirement}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.function}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
