import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { HandCoins, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
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
  approved_at: string | null;
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

const PURPOSE_CATEGORIES = [
  "School fees",
  "Medical",
  "Business stock or expansion",
  "Asset purchase",
  "Home improvement",
  "Emergency",
  "Debt consolidation",
  "Other",
] as const;

const RATE = 12;
const MIN_SHARES = 1000;
const MULTIPLIER = 3;
const MAX_TERM = 60;

function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

type Repayment = { id: string; loan_id: string; installment_no: number; amount: number; status: string; paid_at: string };

function schedule(loan: Loan, paidNos: Set<number>) {
  const start = new Date(loan.approved_at || loan.created_at);
  const now = new Date();
  const items = Array.from({ length: loan.term_months }, (_, i) => {
    const no = i + 1;
    const due = addMonths(start, no);
    return { no, due, amount: loan.monthly_payment, paid: paidNos.has(no), overdue: !paidNos.has(no) && due <= now };
  });
  const total = loan.monthly_payment * loan.term_months;
  const paidCount = items.filter(i => i.paid).length;
  const paid = loan.monthly_payment * paidCount;
  const outstanding = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const next = items.find(i => !i.paid) || null;
  return { items, total, paid, outstanding, pct, paidCount, nextDue: next?.due ?? null, next };
}


export default function Loans() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [shares, setShares] = useState(0);
  const [kyc, setKyc] = useState<string>("pending");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [principal, setPrincipal] = useState("");
  const [term, setTerm] = useState("12");
  const [purposeCategory, setPurposeCategory] = useState<string>("School fees");
  const [purposeDetails, setPurposeDetails] = useState("");
  const [loanType, setLoanType] = useState<"personal" | "business">("personal");
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [savingsWalletId, setSavingsWalletId] = useState<string | null>(null);
  const [payingKey, setPayingKey] = useState<string | null>(null);

  const eligibility = shares * MULTIPLIER;
  const principalNum = Number(principal) || 0;
  const termNum = Number(term) || 0;
  const estimated = principalNum > 0 && termNum > 0 ? monthlyPayment(principalNum, RATE, termNum) : 0;
  const overEligibility = principalNum > eligibility;

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: ws }, { data: ls }, { data: prof }, { data: rp }] = await Promise.all([
      supabase.from("wallets").select("id, balance, wallet_type").eq("user_id", user.id).in("wallet_type", ["shares", "savings"]),
      supabase.from("loans").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("kyc_status").eq("id", user.id).maybeSingle(),
      supabase.from("loan_repayments").select("id, loan_id, installment_no, amount, status, paid_at").eq("user_id", user.id),
    ]);
    const wallets = (ws || []) as { id: string; balance: number; wallet_type: string }[];
    setShares(Number(wallets.find(w => w.wallet_type === "shares")?.balance || 0));
    setSavingsWalletId(wallets.find(w => w.wallet_type === "savings")?.id ?? null);
    setLoans((ls || []) as Loan[]);
    setKyc(prof?.kyc_status || "pending");
    setRepayments(((rp || []) as any[]).map(r => ({ ...r, amount: Number(r.amount) })) as Repayment[]);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const repay = async (loan: Loan, instalment: { no: number; due: Date; amount: number }) => {
    if (!user) return;
    if (!savingsWalletId) return toast.error("Savings wallet not found");
    const key = `${loan.id}-${instalment.no}`;
    setPayingKey(key);
    const { data: tx, error: txErr } = await supabase.from("transactions").insert({
      user_id: user.id,
      wallet_id: savingsWalletId,
      tx_type: "deposit",
      amount: Number(instalment.amount.toFixed(2)),
      method: "mpesa",
      status: "pending",
      description: `Loan repayment · instalment ${instalment.no} of ${loan.term_months}`,
    }).select("id").single();
    if (txErr) { setPayingKey(null); return toast.error(txErr.message); }
    const { error } = await supabase.from("loan_repayments").insert({
      loan_id: loan.id,
      user_id: user.id,
      installment_no: instalment.no,
      amount: Number(instalment.amount.toFixed(2)),
      due_date: instalment.due.toISOString().slice(0, 10),
      status: "paid",
      transaction_id: tx.id,
    });
    setPayingKey(null);
    if (error) return toast.error(error.message.includes("duplicate") ? "That instalment is already paid" : error.message);
    toast.success(`Instalment ${instalment.no} marked paid — deposit recorded`);
    load();
  };


  const hasPending = loans.some(l => l.status === "pending");
  const activeLoans = loans.filter(l => l.status === "active" || l.status === "approved");

  const rules = useMemo(() => [
    { label: `KYC verified`, ok: kyc === "verified", hint: "Complete your KYC to borrow." },
    { label: `Minimum share capital of KES ${fmt(MIN_SHARES)}`, ok: shares >= MIN_SHARES, hint: `You hold KES ${fmt(shares)}.` },
    { label: `Borrow up to ${MULTIPLIER}× share capital`, ok: eligibility > 0, hint: `Your limit is KES ${fmt(eligibility)}.` },
    { label: "No application under review", ok: !hasPending, hint: "Wait for your pending application to be decided." },
    { label: "No more than one running loan", ok: activeLoans.length < 1, hint: "Clear your running loan first." },
    { label: `Repayment term of 1–${MAX_TERM} months`, ok: true, hint: "Longer terms lower the monthly instalment." },
  ], [kyc, shares, eligibility, hasPending, activeLoans.length]);

  const canApply = rules.every(r => r.ok);
  const detailsTooShort = purposeDetails.trim().length < 10;

  const submit = async () => {
    if (!user) return;
    if (principalNum <= 0) return toast.error("Enter a valid amount");
    if (termNum < 1 || termNum > MAX_TERM) return toast.error(`Term must be between 1 and ${MAX_TERM} months`);
    if (overEligibility) return toast.error("Amount exceeds your loan eligibility");
    if (detailsTooShort) return toast.error("Please describe what the loan will be used for");
    setSubmitting(true);
    const { error } = await supabase.from("loans").insert({
      user_id: user.id,
      principal: principalNum,
      term_months: termNum,
      interest_rate: RATE,
      monthly_payment: Number(estimated.toFixed(2)),
      purpose: `${purposeCategory} — ${purposeDetails.trim()}`,
      loan_type: loanType,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Loan application submitted");
    setOpen(false);
    setPrincipal(""); setTerm("12"); setPurposeDetails(""); setPurposeCategory("School fees"); setLoanType("personal");
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
              <Button variant="gold" size="lg" className="mt-6" disabled={!canApply}>Apply for a loan</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
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
                  <Input id="term" type="number" min="1" max={MAX_TERM} value={term} onChange={e => setTerm(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pcat">Purpose category</Label>
                  <Select value={purposeCategory} onValueChange={setPurposeCategory}>
                    <SelectTrigger id="pcat"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PURPOSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="purpose">Purpose details</Label>
                  <Textarea id="purpose" value={purposeDetails} onChange={e => setPurposeDetails(e.target.value)} placeholder="Describe exactly what the funds will be used for, e.g. Term 2 school fees for two children at Green Hills Academy." />
                  <p className="mt-1 text-xs text-muted-foreground">{detailsTooShort ? "At least 10 characters — credit officers use this to assess your application." : `${purposeDetails.trim().length} characters`}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Estimated monthly payment</span><span className="font-semibold tabular-nums">KES {fmt(estimated)}</span></div>
                  <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Total repayable</span><span className="tabular-nums">KES {fmt(estimated * termNum)}</span></div>
                </div>
                {overEligibility && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4" /> Amount exceeds your eligibility.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
                <Button onClick={submit} disabled={submitting || overEligibility || principalNum <= 0 || detailsTooShort}>{submitting ? "Submitting…" : "Submit application"}</Button>
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
        <h4 className="font-display text-lg font-semibold">Loan eligibility rules</h4>
        <p className="mt-1 text-sm text-muted-foreground">All rules must be met before an application can be submitted.</p>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {rules.map(r => (
            <li key={r.label} className="flex items-start gap-3 rounded-md border border-border p-3">
              {r.ok
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.hint}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {activeLoans.length > 0 && (
        <Card className="p-6 shadow-card">
          <h4 className="font-display text-lg font-semibold">Repayment status</h4>
          <div className="mt-4 space-y-6">
            {activeLoans.map(l => {
              const r = repayment(l);
              return (
                <div key={l.id} className="rounded-md border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{l.loan_type === "business" ? "Business" : "Personal"} loan · KES {fmt(l.principal)}</p>
                      <p className="text-xs text-muted-foreground">{l.term_months} months at {l.interest_rate}% p.a. · {r.paidInstalments} of {l.term_months} instalments due to date</p>
                    </div>
                    <Badge variant={statusTone[l.status]}>{l.status}</Badge>
                  </div>
                  <Progress value={r.pct} className="mt-4" />
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Monthly instalment</p><p className="font-medium tabular-nums">KES {fmt(l.monthly_payment)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Repaid to date</p><p className="font-medium tabular-nums text-success">KES {fmt(r.paid)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-medium tabular-nums">KES {fmt(r.outstanding)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Next due</p><p className="font-medium">{r.nextDue ? r.nextDue.toLocaleDateString() : "Fully scheduled"}</p></div>
                  </div>
                  {l.purpose && <p className="mt-3 text-xs text-muted-foreground">Purpose: {l.purpose}</p>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
                  <th>Purpose</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loans.map(l => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="py-3">{new Date(l.created_at).toLocaleDateString()}</td>
                    <td className="capitalize">{l.loan_type === "business" ? "Business" : "Personal"}</td>
                    <td className="font-medium tabular-nums">KES {fmt(l.principal)}</td>
                    <td>{l.term_months} mo</td>
                    <td className="tabular-nums">KES {fmt(l.monthly_payment)}</td>
                    <td className="max-w-[220px] text-xs text-muted-foreground">{l.purpose || "—"}</td>
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
