# PII Detection System - Test Verification Plan

## Test Cases for Verification

### 1. Structured ID Validation (Checksum Required)

**Test Case 1.1: Valid ABN**
```
Input: "Client ABN is 83 914 571 673"
Expected: Detects ABN with checksum validation
Verify: Only valid ABNs are detected
```

**Test Case 1.2: Invalid ABN (Bad Checksum)**
```
Input: "Client ABN is 12 345 678 901"
Expected: NO detection (checksum fails)
Verify: Invalid ABNs are rejected
```

**Test Case 1.3: Valid TFN**
```
Input: "TFN is 123 456 782"
Expected: Detects TFN with checksum validation
Verify: Only valid TFNs are detected
```

**Test Case 1.4: Invalid TFN (Bad Checksum)**
```
Input: "TFN is 111 111 111"
Expected: NO detection (checksum fails)
Verify: Invalid TFNs are rejected
```

**Test Case 1.5: Valid Medicare**
```
Input: "Medicare number recorded as 2951 64037 1"
Expected: Detects Medicare with checksum validation
Verify: Only valid Medicare numbers are detected
```

**Test Case 1.6: Valid Credit Card (Luhn Check)**
```
Input: "Credit card 4532 1488 0343 6467"
Expected: Detects credit card with Luhn validation
Verify: Only valid credit cards are detected
```

**Test Case 1.7: Invalid Credit Card (Bad Luhn)**
```
Input: "Credit card 1234 5678 9012 3456"
Expected: NO detection (Luhn check fails)
Verify: Invalid credit cards are rejected
```

---

### 2. PERSON vs ORG Reconciliation

**Test Case 2.1: Organization with Pty Ltd**
```
Input: "Statement issued by Arcadia Wealth Pty Ltd"
Expected: Detected as ORG (not PERSON)
Verify: Business suffixes trigger ORG classification
```

**Test Case 2.2: Person Name with Organization Context**
```
Input: "Statement issued by Arcadia Wealth Pty Ltd for Mr Daniel O'Rourke"
Expected: ORG=1 (Arcadia Wealth Pty Ltd), PERSON=1 (Daniel O'Rourke)
Verify: Both types detected correctly with reconciliation
```

**Test Case 2.3: Multiple Business Entities**
```
Input: "Meeting between Smith Consulting Pty Ltd and Jones Trust"
Expected: Both detected as ORG
Verify: Business suffixes work for multiple patterns
```

---

### 3. Irreversible Redaction Mode

**Test Case 3.1: Irreversible Mode - No Mapping Created**
```
Steps:
1. Check "Irreversible redaction" checkbox
2. Enter text with PII
3. Click "Detect PII"
4. Click "Redact Selected"
Expected: 
- Placeholders show as [REDACTED_LABEL]
- No mapping stored
- "Export Mapping" shows alert "Irreversible mode: no mapping to export"
- "Export Encrypted" shows same alert
Verify: Mapping is not created and cannot be exported
```

**Test Case 3.2: Irreversible Mode - Manual Redaction Disabled**
```
Steps:
1. Check "Irreversible redaction" checkbox
2. Perform redaction
3. Try to select text in output
4. Click "Manual Redact"
Expected: Button is disabled
Verify: Manual redaction unavailable in irreversible mode
```

**Test Case 3.3: Reversible Mode - Mapping Created**
```
Steps:
1. UNCHECK "Irreversible redaction" checkbox
2. Enter text with PII
3. Detect and redact
Expected:
- Placeholders use deterministic/random format
- Mapping is stored
- "Export Mapping" and "Export Encrypted" work
Verify: Mapping is created and can be exported
```

---

### 4. Deterministic Placeholders

**Test Case 4.1: Deterministic Mode (Same Value → Same Token)**
```
Steps:
1. CHECK "Deterministic placeholders" checkbox
2. Enter: "John Smith called. Later John Smith emailed."
3. Detect and redact
Expected: Both "John Smith" instances get SAME placeholder
Verify: Duplicate values map to identical tokens
```

**Test Case 4.2: Random Mode (Same Value → Different Tokens)**
```
Steps:
1. UNCHECK "Deterministic placeholders" checkbox
2. Enter: "John Smith called. Later John Smith emailed."
3. Detect and redact
Expected: Each "John Smith" gets DIFFERENT random placeholder
Verify: Duplicate values get unique tokens
```

---

### 5. Encrypted Mapping Export/Import

**Test Case 5.1: Export Encrypted Mapping**
```
Steps:
1. Perform reversible redaction
2. Click "Export Encrypted"
3. Enter passphrase "test123"
4. Check downloaded file
Expected:
- File named mapping-[timestamp].piimap.json
- Contains encrypted blob with v, alg, kdf, iv, salt, ct fields
- Content is NOT readable plaintext
Verify: Mapping is encrypted with AES-GCM + PBKDF2
```

**Test Case 5.2: Import Encrypted Mapping - Correct Passphrase**
```
Steps:
1. Clear current mapping
2. Click "Import Encrypted"
3. Select encrypted .piimap.json file
4. Enter correct passphrase "test123"
5. Click "Unredact"
Expected:
- Toast shows "Encrypted Mapping Imported"
- Mapping loads successfully
- Unredaction restores original text
Verify: Decryption works with correct passphrase
```

**Test Case 5.3: Import Encrypted Mapping - Wrong Passphrase**
```
Steps:
1. Click "Import Encrypted"
2. Select encrypted .piimap.json file
3. Enter wrong passphrase "wrongpass"
Expected:
- Toast shows "Import Failed" with error
- Mapping is NOT loaded
Verify: Wrong passphrase is rejected
```

**Test Case 5.4: Export/Import Round-trip**
```
Steps:
1. Create redacted text with mapping
2. Export encrypted mapping with passphrase "secure123"
3. Clear page and paste redacted text
4. Import encrypted mapping with "secure123"
5. Click "Unredact"
Expected: Original text is fully restored
Verify: Full encryption round-trip works correctly
```

---

### 6. Evaluation Tests

**Test Case 6.1: Run Evaluation Suite**
```
Steps:
1. Initialize AI Model
2. Click "Run Eval" button (top right, only visible after init)
3. Check console and alert
Expected:
- Console shows table with test results
- Alert shows "Eval complete: X/4 passing"
- Tests include:
  - abn-tfn-valid: ABN=1, TFN=1
  - org-vs-person: ORG=1, PERSON=1
  - medicare: MEDICARE=1
  - email-phone-dob: EMAIL=1, PHONE=1, DOB=1
Verify: All 4 test fixtures pass
```

**Test Case 6.2: Console Output Format**
```
Expected Console Table Columns:
- id: Test fixture ID
- ok: boolean (true if passed)
- counts: Object with detected label counts
- expect: Object with expected label counts
Verify: Results are clearly formatted and readable
```

---

## Verification Checklist

- [ ] All valid structured IDs detected with checksum validation
- [ ] Invalid structured IDs rejected (checksum failures)
- [ ] ORG vs PERSON reconciliation works for business suffixes
- [ ] Irreversible mode produces no mapping
- [ ] Irreversible mode shows correct alerts on export attempts
- [ ] Deterministic placeholders create same tokens for same values
- [ ] Random placeholders create unique tokens
- [ ] Encrypted export creates properly encrypted file
- [ ] Encrypted import works with correct passphrase
- [ ] Encrypted import rejects wrong passphrase
- [ ] Full encryption round-trip preserves data
- [ ] Eval button runs and shows results
- [ ] All 4 evaluation fixtures pass

---

## Additional Security Checks

**Headers Verification**
After deployment, verify HTTP headers:
- Content-Security-Policy includes required directives
- Cross-Origin-Opener-Policy: same-origin
- Cross-Origin-Embedder-Policy: require-corp
- X-Frame-Options: DENY

Use: Browser DevTools → Network tab → Response Headers
Or: https://securityheaders.com
