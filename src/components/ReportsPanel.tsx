import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { downloadCSV, downloadFinancialReportPDF } from "@/lib/reports";

type Profile = { id: string; full_name: string | null; member_number: string | null; kyc_status: string; created_at: string };
type WalletRow = { id: string; user_id: string; wallet_type: string; currency: string; balance: number };
type Tx = { id: string; user_id: string; tx_type: string; amount: number; currency: string; method: string; status: string; created_at: string; reference: string | null };
type Loan = { id: string; user_id: string; principal: number; term_months: number; monthly_payment: number; status: string; created_at: string };

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ReportsPanel({ profiles, wallets, txs, loans }: {
  profiles: Profile[]; wallets: WalletRow[]; txs: Tx[]; loans: Loan[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  const memberName = (id: string) => profiles.find(p => p.id === id)?.full_name || "—";
  const memberNo = (id: string) => profiles.find(p => p.id === id)?.member_number || "";

  const inRange = (iso: string) => {
    const d = new Date(iso).getTime();
    const f = new Date(from).getTime();
    const t = new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1;
    return d >= f && d <= t;
  };

  const filteredTx = useMemo(() => txs.filter(t => inRange(t.created_at)), [txs, from, to]);
  const filteredLoans = useMemo(() => loans.filter(l => inRange(l.created_at)), [loans, from, to]);
  const filteredMembers = useMemo(() => profiles.filter(p => inRange(p.created_at)), [profiles, from, to]);

  const totals = wallets.reduce<Record<string, number>>((acc, w) => {
    acc[w.wallet_type] = (acc[w.wallet_type] || 0) + Number(w.balance);
    return acc;
  }, {});
  const loansActive = loans
    .filter(l => l.status === "active" || l.status === "approved")
    .reduce((s, l) => s + Number(l.principal), 0);

  const rangeLabel = `Period: ${from} to ${to}`;

  const buildReportData = () => ({
    rangeLabel,
    totals: {
      savings: totals.savings || 0,
      shares: totals.shares || 0,
      benevolent: totals.benevolent || 0,
      loansActive,
    },
    members: filteredMembers,
    transactions: filteredTx.map(t => ({ ...t, member: memberName(t.user_id) })),
    loans: filteredLoans.map(l => ({ ...l, member: memberName(l.user_id) })),
  });

  const exportPDF = () => downloadFinancialReportPDF(buildReportData());

  const exportTxCSV = () => downloadCSV(
    `transactions-${from}-to-${to}.csv`,
    ["Date", "Member", "Member No.", "Type", "Method", "Amount", "Currency", "Status", "Reference"],
    filteredTx.map(t => [
      new Date(t.created_at).toISOString(),
      memberName(t.user_id),
      memberNo(t.user_id),
      t.tx_type,
      t.method,
      Number(t.amount).toFixed(2),
      t.currency,
      t.status,
      t.reference || "",
    ])
  );

  const exportLoansCSV = () => downloadCSV(
    `loans-${from}-to-${to}.csv`,
    ["Applied", "Member", "Member No.", "Principal", "Term (months)", "Monthly", "Status"],
    filteredLoans.map(l => [
      new Date(l.created_at).toISOString(),
      memberName(l.user_id),
      memberNo(l.user_id),
      Number(l.principal).toFixed(2),
      l.term_months,
      Number(l.monthly_payment).toFixed(2),
      l.status,
    ])
  );

  const exportMembersCSV = () => downloadCSV(
    `members-${from}-to-${to}.csv`,
    ["Joined", "Full Name", "Member No.", "KYC Status"],
    filteredMembers.map(p => [
      new Date(p.created_at).toISOString(),
      p.full_name || "",
      p.member_number || "",
      p.kyc_status,
    ])
  );

  const exportBalancesCSV = () => downloadCSV(
    `wallet-balances-${today}.csv`,
    ["Member", "Member No.", "Wallet", "Currency", "Balance"],
    wallets.map(w => [
      memberName(w.user_id),
      memberNo(w.user_id),
      w.wallet_type,
      w.currency,
      Number(w.balance).toFixed(2),
    ])
  );

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="font-display text-lg font-semibold">Report period</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose a date range, then download a financial report or export raw data.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:max-w-md">
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Transactions</p>
            <p className="mt-1 font-display text-xl font-semibold">{filteredTx.length}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">New members</p>
            <p className="mt-1 font-display text-xl font-semibold">{filteredMembers.length}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Loans applied</p>
            <p className="mt-1 font-display text-xl font-semibold">{filteredLoans.length}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Active loan book</p>
            <p className="mt-1 font-display text-xl font-semibold">KES {fmt(loansActive)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display text-lg font-semibold">Download reports</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Button onClick={exportPDF} className="justify-start" variant="default">
            <FileText className="h-4 w-4" /> Financial report (PDF)
          </Button>
          <Button onClick={exportTxCSV} variant="outline" className="justify-start">
            <FileSpreadsheet className="h-4 w-4" /> Transactions (CSV)
          </Button>
          <Button onClick={exportLoansCSV} variant="outline" className="justify-start">
            <FileSpreadsheet className="h-4 w-4" /> Loans (CSV)
          </Button>
          <Button onClick={exportMembersCSV} variant="outline" className="justify-start">
            <FileSpreadsheet className="h-4 w-4" /> New members (CSV)
          </Button>
          <Button onClick={exportBalancesCSV} variant="outline" className="justify-start">
            <Download className="h-4 w-4" /> Wallet balances snapshot (CSV)
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          The PDF report includes summary totals, inflows/outflows, transaction listing, and loan listing for the selected period.
        </p>
      </Card>
    </div>
  );
}
