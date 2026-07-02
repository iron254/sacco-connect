import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { downloadCSV, downloadFinancialReportPDF } from "@/lib/reports";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Summary = {
  totals: { savings: number; shares: number; benevolent: number; loans_active: number };
  period: { transactions: number; inflows: number; outflows: number; loans: number; new_members: number };
};

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EXPORT_CAP = 10000;

export function ReportsPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const range = useMemo(() => {
    const f = new Date(`${from}T00:00:00`).toISOString();
    const t = new Date(`${to}T23:59:59.999`).toISOString();
    return { f, t };
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_report_summary", { _from: range.f, _to: range.t });
      if (!cancelled) {
        if (error) toast({ title: "Failed to load summary", description: error.message, variant: "destructive" });
        else setSummary(data as unknown as Summary);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.f, range.t]);

  const rangeLabel = `Period: ${from} to ${to}`;

  const fetchTx = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, user_id, tx_type, amount, currency, method, status, created_at, reference")
      .gte("created_at", range.f).lte("created_at", range.t)
      .order("created_at", { ascending: false })
      .limit(EXPORT_CAP);
    if (error) throw error;
    return data || [];
  };
  const fetchLoans = async () => {
    const { data, error } = await supabase
      .from("loans")
      .select("id, user_id, principal, term_months, monthly_payment, status, created_at")
      .gte("created_at", range.f).lte("created_at", range.t)
      .order("created_at", { ascending: false })
      .limit(EXPORT_CAP);
    if (error) throw error;
    return data || [];
  };
  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, member_number, kyc_status, created_at")
      .gte("created_at", range.f).lte("created_at", range.t)
      .order("created_at", { ascending: false })
      .limit(EXPORT_CAP);
    if (error) throw error;
    return data || [];
  };
  const fetchProfilesByIds = async (ids: string[]) => {
    if (!ids.length) return new Map<string, { full_name: string | null; member_number: string | null }>();
    const uniq = Array.from(new Set(ids));
    const map = new Map<string, { full_name: string | null; member_number: string | null }>();
    // batch in chunks of 500 to keep URL length sane
    for (let i = 0; i < uniq.length; i += 500) {
      const slice = uniq.slice(i, i + 500);
      const { data } = await supabase.from("profiles").select("id, full_name, member_number").in("id", slice);
      (data || []).forEach(p => map.set(p.id, { full_name: p.full_name, member_number: p.member_number }));
    }
    return map;
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); }
    catch (e) { toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const exportPDF = () => run("pdf", async () => {
    const [txs, loans, members] = await Promise.all([fetchTx(), fetchLoans(), fetchMembers()]);
    const memberMap = await fetchProfilesByIds([...txs.map(t => t.user_id), ...loans.map(l => l.user_id)]);
    downloadFinancialReportPDF({
      rangeLabel,
      totals: {
        savings: summary?.totals.savings || 0,
        shares: summary?.totals.shares || 0,
        benevolent: summary?.totals.benevolent || 0,
        loansActive: summary?.totals.loans_active || 0,
      },
      members: members as any,
      transactions: txs.map(t => ({ ...t, member: memberMap.get(t.user_id)?.full_name || null })) as any,
      loans: loans.map(l => ({ ...l, member: memberMap.get(l.user_id)?.full_name || null })) as any,
    });
  });

  const exportTxCSV = () => run("tx", async () => {
    const txs = await fetchTx();
    const memberMap = await fetchProfilesByIds(txs.map(t => t.user_id));
    downloadCSV(
      `transactions-${from}-to-${to}.csv`,
      ["Date", "Member", "Member No.", "Type", "Method", "Amount", "Currency", "Status", "Reference"],
      txs.map(t => [
        new Date(t.created_at).toISOString(),
        memberMap.get(t.user_id)?.full_name || "",
        memberMap.get(t.user_id)?.member_number || "",
        t.tx_type, t.method, Number(t.amount).toFixed(2), t.currency, t.status, t.reference || "",
      ]),
    );
  });

  const exportLoansCSV = () => run("loans", async () => {
    const loans = await fetchLoans();
    const memberMap = await fetchProfilesByIds(loans.map(l => l.user_id));
    downloadCSV(
      `loans-${from}-to-${to}.csv`,
      ["Applied", "Member", "Member No.", "Principal", "Term (months)", "Monthly", "Status"],
      loans.map(l => [
        new Date(l.created_at).toISOString(),
        memberMap.get(l.user_id)?.full_name || "",
        memberMap.get(l.user_id)?.member_number || "",
        Number(l.principal).toFixed(2), l.term_months, Number(l.monthly_payment).toFixed(2), l.status,
      ]),
    );
  });

  const exportMembersCSV = () => run("members", async () => {
    const members = await fetchMembers();
    downloadCSV(
      `members-${from}-to-${to}.csv`,
      ["Joined", "Full Name", "Member No.", "KYC Status"],
      members.map(p => [
        new Date(p.created_at).toISOString(),
        p.full_name || "", p.member_number || "", p.kyc_status,
      ]),
    );
  });

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
          <SummaryStat label="Transactions" value={summary?.period.transactions ?? "—"} loading={loading} />
          <SummaryStat label="New members" value={summary?.period.new_members ?? "—"} loading={loading} />
          <SummaryStat label="Loans applied" value={summary?.period.loans ?? "—"} loading={loading} />
          <SummaryStat label="Active loan book" value={summary ? `KES ${fmt(summary.totals.loans_active)}` : "—"} loading={loading} />
        </div>
        {summary && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <SummaryStat label="Inflows" value={`KES ${fmt(summary.period.inflows)}`} />
            <SummaryStat label="Outflows" value={`KES ${fmt(summary.period.outflows)}`} />
            <SummaryStat label="Net movement" value={`KES ${fmt(summary.period.inflows - summary.period.outflows)}`} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-display text-lg font-semibold">Download reports</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Button onClick={exportPDF} disabled={busy !== null} className="justify-start">
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Financial report (PDF)
          </Button>
          <Button onClick={exportTxCSV} disabled={busy !== null} variant="outline" className="justify-start">
            {busy === "tx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Transactions (CSV)
          </Button>
          <Button onClick={exportLoansCSV} disabled={busy !== null} variant="outline" className="justify-start">
            {busy === "loans" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Loans (CSV)
          </Button>
          <Button onClick={exportMembersCSV} disabled={busy !== null} variant="outline" className="justify-start">
            {busy === "members" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} New members (CSV)
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Exports are capped at {EXPORT_CAP.toLocaleString()} rows per file. Narrow the date range for large datasets.
        </p>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, loading }: { label: string; value: string | number; loading?: boolean }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value}
      </p>
    </div>
  );
}
