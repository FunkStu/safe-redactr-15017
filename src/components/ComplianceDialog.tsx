import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export function ComplianceDialog() {
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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="h-auto p-0 text-sm">
          More info, click here
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regulatory Compliance Overview</DialogTitle>
          <DialogDescription>
            How AI Powered PII Redactr meets Australian financial and privacy regulations
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Requirement</TableHead>
              <TableHead>Function</TableHead>
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
      </DialogContent>
    </Dialog>
  );
}
