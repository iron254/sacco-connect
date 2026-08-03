import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText } from "lucide-react";
import { downloadCSV, downloadReceipt, downloadStatementPDF } from "@/lib/reports";

type WalletRow = { id: string; wallet_type: "savings" | "shares" | "benevolent"; currency: string; balance: number };
type TxRow = { id: string; wallet_id: string; tx_type: string; amount: number; currency: string; method: string; status: string; reference: string | null; description: string | null; created_at: string };

const walletLabels: Record<string, string> = {
  savings: "Main Savings",
  shares: "Share Capital",
  benevolent: "Charitable Fund",
};

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function Statements() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{ full_name: string | null; member_number: string | null } | null>(null);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletFilter, setWalletFilter] = useState("all");
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(() => iso(new Date()));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const start = new Date(`${from}T00:00:00`).toISOString();
    const end = new Date(`${to}T23:59:59`).toISOString();
    let q = supabase.from("transactions")
      .select("id, wallet_id, tx_type, amount, currency, method, status, reference, description, created_at")
      .eq("user_id", user.id)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500);
    if (walletFilter !== "all") q = q.eq("wallet_id", walletFilter);

    const [{ data: prof }, { data: ws }, { data: tx }] = await Promise.all([
      supabase.from("profiles").select("full_name, member_number").eq("id", user.id).maybeSingle(),
      supabase.from("wallets").select("id, wallet_type, currency, balance").eq("user_id", user.id),
      q,
    ]);
    setProfile(prof as any);
    setWallets(((ws || []) as any[]).map(w => ({ ...w, balance: Number(w.balance) })) as WalletRow[]);
    setTxs((tx || []) as TxRow[]);
    setLoading(false);
  }, [user, from, to, walletFilter]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const inflow = txs.filter(t => ["deposit", "transfer_in", "interest"].includes(t.tx_type) && t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
    const outflow = txs.filter(t => ["withdrawal", "transfer_out", "fee"].includes(t.tx_type) && t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
    return { inflow, outflow, net: inflow - outflow };
  }, [txs]);

  const walletName = (id: string) => {
    const w = wallets.find(x => x.id === id);
    return w ? walletLabels[w.wallet_type] : "Wallet";
  };

  const rangeLabel = `${new Date(from).toLocaleDateString()} – ${new Date(to).toLocaleDateString()}`;

  const exportPDF = () => downloadStatementPDF({
    member: { full_name: profile?.full_name, member_number: profile?.member_number, email: user?.email },
    rangeLabel,
    wallets: wallets.map(w => ({ label: walletLabels[w.wallet_type], balance: w.balance, currency: w.currency })),
    transactions: txs.map(t => ({ created_at: t.created_at, wallet: walletName(t.wallet_id), tx_type: t.tx_type, method: t.method, amount: Number(t.amount), currency: t.currency, status: t.status })),
  });

  const exportCSV = () => downloadCSV(
    `statement-${from}-to-${to}.csv`,
    ["Date", "Wallet", "Type", "Method", "Amount", "Currency", "Status", "Reference"],
    txs.map(t => [new Date(t.created_at).toLocaleString(), walletName(t.wallet_id), t.tx_type, t.method, Number(t.amount), t.currency, t.status, t.reference || ""]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Statements</h1>
        <p className="text-sm text-muted-foreground">Filter your transaction history and download an official statement.</p>
      </div>

      <Card className="p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Wallet</Label>
            <Select value={walletFilter} onValueChange={setWalletFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All wallets</SelectItem>
                {wallets.map(w => <SelectItem key={w.id} value={w.id}>{walletLabels[w.wallet_type]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={exportPDF} disabled={!txs.length}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
            <Button className="flex-1" variant="outline" onClick={exportCSV} disabled={!txs.length}><Download className="mr-2 h-4 w-4" /> CSV</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5 shadow-card">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Money in</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-success">KES {fmt(totals.inflow)}</p>
        </Card>
        <Card className="p-5 shadow-card">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Money out</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-destructive">KES {fmt(totals.outflow)}</p>
        </Card>
        <Card className="p-5 shadow-card">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Net movement</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">KES {fmt(totals.net)}</p>
        </Card>
      </div>

      <Card className="p-6 shadow-card">
        <h4 className="mb-4 font-display text-lg font-semibold">{txs.length} transaction{txs.length === 1 ? "" : "s"} · {rangeLabel}</h4>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : txs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No transactions in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Wallet</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {txs.map(t => (
                  <tr key={t.id} className="border-b border-border/60">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{walletName(t.wallet_id)}</td>
                    <td className="py-2 pr-4 capitalize">{t.tx_type.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-4 capitalize">{t.method.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{t.currency} {fmt(Number(t.amount))}</td>
                    <td className="py-2 pr-4 capitalize">{t.status}</td>
                    <td className="py-2 text-right">
                      <Button size="icon" variant="ghost" title="Download receipt" onClick={() => downloadReceipt({
                        tx: t as any,
                        member: { full_name: profile?.full_name, member_number: profile?.member_number, email: user?.email },
                        walletLabel: walletName(t.wallet_id),
                      })}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </td>
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
