import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function AccuracyDisclaimer() {
  return (
    <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-900 dark:text-amber-100">
        Detection Accuracy Notice
      </AlertTitle>
      <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
        AI-powered detection has inherent limitations. <strong>Always review results manually</strong> before relying on redaction or restoration. False positives (non-PII flagged) and false negatives (PII missed) may occur. User is responsible for final verification and compliance.
      </AlertDescription>
    </Alert>
  );
}
