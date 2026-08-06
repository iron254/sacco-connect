import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { HandCoins, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Loan = {
  id: string;
  principal: number;
  term_months: number;
  interest_rate: number;
  monthly_payment: number;
  purpose: string | null;
  status: "pending" | "approved" | "rejected" | "active" | "closed";
  created_at: string;
  rejection_reason: string | null;
  loan_type: "personal" | "business";
};

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthlyPayment(principal: number, annualRate: number, months: number) {
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

const statusTone: Record<Loan["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  active: "default",
  rejected: "destructive",
  closed: "outline",
};

export default function Loans() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [shares, setShares] = useState(0);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [principal, setPrincipal] = useState("");
  const [term, setTerm] = useState("12");
  const [purpose, setPurpose] = useState("");
  const [loanType, setLoanType] = useState<"personal" | "business">("personal");

  const RATE = 12;
  const eligibility = shares * 3;
  const principalNum = Number(principal) || 0;
  const termNum = Number(term) || 0;
  const estimated = principalNum > 0 && termNum > 0 ? monthlyPayment(principalNum, RATE, termNum) : 0;
  const overEligibility = principalNum > eligibility;

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: ws }, { data: ls }] = await Promise.all([
      supabase.from("wallets").select("balance, wallet_type").eq("user_id", user.id).eq("wallet_type", "shares").maybeSingle(),
      supabase.from("loans").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setShares(Number(ws?.balance || 0));
    setLoans((ls || []) as Loan[]);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!user) return;
    if (principalNum <= 0) return toast.error("Enter a valid amount");
    if (overEligibility) return toast.error("Amount exceeds your loan eligibility");
    setSubmitting(true);
    const { error } = await supabase.from("loans").insert({
      user_id: user.id,
      principal: principalNum,
      term_months: termNum,
      interest_rate: RATE,
      monthly_payment: Number(estimated.toFixed(2)),
      purpose: purpose || null,
      loan_type: loanType,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Loan application submitted");
    setOpen(false);
    setPrincipal(""); setTerm("12"); setPurpose(""); setLoanType("personal");
    load();
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-6 shadow-card md:col-span-2 bg-gradient-primary text-primary-foreground">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary-foreground/60">Available to borrow</p>
              <p className="mt-1 font-display text-4xl font-semibold tabular-nums">KES {fmt(eligibility)}</p>
            </div>
            <HandCoins className="h-8 w-8 text-primary-foreground/70" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" size="lg" className="mt-6" disabled={eligibility <= 0}>Apply for a loan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply for a loan</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ltype">Loan type</Label>
                  <Select value={loanType} onValueChange={(v) => setLoanType(v as "personal" | "business")}>
                    <SelectTrigger id="ltype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal loan</SelectItem>
                      <SelectItem value="business">Business loan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="amt">Amount (KES)</Label>
                  <Input id="amt" type="number" min="1" max={eligibility} value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="e.g. 50000" />
                  <p className="mt-1 text-xs text-muted-foreground">Maximum: KES {fmt(eligibility)}</p>
                </div>
                <div>
                  <Label htmlFor="term">Term (months)</Label>
                  <Input id="term" type="number" min="1" max="60" value={term} onChange={e => setTerm(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="purpose">Purpose (optional)</Label>
                  <Textarea id="purpose" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. School fees" />
                </div>
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Estimated monthly payment</span><span className="font-semibold tabular-nums">KES {fmt(estimated)}</span></div>
                  <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Interest rate (p.a.)</span><span className="tabular-nums">{RATE}%</span></div>
                </div>
                {overEligibility && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4" /> Amount exceeds your eligibility.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
                <Button onClick={submit} disabled={submitting || overEligibility || principalNum <= 0}>{submitting ? "Submitting…" : "Submit application"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>

        <Card className="p-6 shadow-card">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Your loans</p>
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums">{loans.length}</p>
          <p className="mt-2 text-sm text-muted-foreground">{loans.filter(l => l.status === "pending").length} pending review</p>
        </Card>
      </div>

      <Card className="p-6 shadow-card">
        <h4 className="font-display text-lg font-semibold mb-4">Application history</h4>
        {loans.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-12 text-center">
            <p className="text-sm font-medium">No loan applications yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Submit your first application above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Term</th>
                  <th>Monthly</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loans.map(l => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-3">{new Date(l.created_at).toLocaleDateString()}</td>
                    <td className="capitalize">{l.loan_type === "business" ? "Business" : "Personal"}</td>
                    <td className="font-medium tabular-nums">KES {fmt(l.principal)}</td>
                    <td>{l.term_months} mo</td>
                    <td className="tabular-nums">KES {fmt(l.monthly_payment)}</td>
                    <td><Badge variant={statusTone[l.status]}>{l.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
