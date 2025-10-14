import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function TermsOfUse() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground">
          Terms of Use
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terms of Use - AI Powered PII Redactr</DialogTitle>
          <DialogDescription>
            Acceptable use and liability terms
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <section>
            <h3 className="font-semibold mb-2">1. Legitimate Use Only</h3>
            <p className="text-muted-foreground">
              This tool is provided for legitimate PII management purposes including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground ml-4 mt-1 space-y-1">
              <li>Document review and compliance verification</li>
              <li>Data sanitization for sharing or archival</li>
              <li>Privacy impact assessments</li>
              <li>Regulatory compliance workflows (Australian Privacy Principles, APRA CPS 234, etc.)</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              <strong>Prohibited uses:</strong> Unauthorized surveillance, profiling, tracking, or any use that violates individual privacy rights or applicable laws.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">2. Accuracy Limitations</h3>
            <p className="text-muted-foreground">
              AI-powered PII detection is probabilistic and not infallible. The tool may:
            </p>
            <ul className="list-disc list-inside text-muted-foreground ml-4 mt-1 space-y-1">
              <li><strong>Miss PII</strong> (false negatives): Sensitive information may not be detected</li>
              <li><strong>Flag non-PII</strong> (false positives): Non-sensitive text may be incorrectly identified</li>
              <li><strong>Misclassify</strong>: PII type labels may be inaccurate</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">3. User Responsibility</h3>
            <p className="text-muted-foreground">
              <strong>You are solely responsible for:</strong>
            </p>
            <ul className="list-disc list-inside text-muted-foreground ml-4 mt-1 space-y-1">
              <li>Manually reviewing all detection results before taking action</li>
              <li>Verifying completeness of PII redaction for your use case</li>
              <li>Ensuring compliance with applicable laws and regulations</li>
              <li>Making final decisions on what constitutes PII in your context</li>
              <li>Maintaining additional safeguards beyond this tool</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">4. No Warranty</h3>
            <p className="text-muted-foreground">
              This tool is provided "AS IS" without warranties of any kind. We do not guarantee:
            </p>
            <ul className="list-disc list-inside text-muted-foreground ml-4 mt-1 space-y-1">
              <li>100% detection accuracy or completeness</li>
              <li>Suitability for any particular compliance requirement</li>
              <li>Error-free operation or uninterrupted availability</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">5. Liability Limitation</h3>
            <p className="text-muted-foreground">
              We are not liable for any damages arising from:
            </p>
            <ul className="list-disc list-inside text-muted-foreground ml-4 mt-1 space-y-1">
              <li>Undetected PII leading to privacy breaches</li>
              <li>Over-redaction causing loss of important information</li>
              <li>Reliance on detection results without manual verification</li>
              <li>Non-compliance with regulations due to tool limitations</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">6. Data Processing</h3>
            <p className="text-muted-foreground">
              All processing occurs locally in your browser. No data is transmitted to external servers. However:
            </p>
            <ul className="list-disc list-inside text-muted-foreground ml-4 mt-1 space-y-1">
              <li>You remain the data controller for any PII processed</li>
              <li>You must ensure lawful basis for processing under applicable privacy laws</li>
              <li>Local processing does not absolve compliance obligations</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">7. Acceptance</h3>
            <p className="text-muted-foreground">
              By using this tool, you acknowledge understanding these limitations and agree to use it responsibly as part of a broader PII management strategy—not as a standalone compliance solution.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
