import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DepositDialog } from "@/components/DepositDialog";
import { PiggyBank, Wallet as WalletIcon, HeartHandshake, ArrowDownLeft, FileText, HandCoins } from "lucide-react";

type WalletRow = { id: string; wallet_type: "savings" | "shares" | "benevolent"; currency: string; balance: number; updated_at: string };
type TxRow = { id: string; wallet_id: string; tx_type: string; amount: number; currency: string; method: string; status: string; created_at: string };

const meta = {
  savings: { label: "Main Savings", icon: PiggyBank, blurb: "Everyday savings. Earns annual interest." },
  shares: { label: "Share Capital", icon: WalletIcon, blurb: "Determines dividends and loan eligibility (3×)." },
  benevolent: { label: "Charitable Fund", icon: HeartHandshake, blurb: "Member welfare and bereavement support." },
} as const;

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Wallets() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: ws }, { data: tx }] = await Promise.all([
      supabase.from("wallets").select("id, wallet_type, currency, balance, updated_at").eq("user_id", user.id),
      supabase.from("transactions").select("id, wallet_id, tx_type, amount, currency, method, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setWallets(((ws || []) as any[]).map(w => ({ ...w, balance: Number(w.balance) })) as WalletRow[]);
    setTxs((tx || []) as TxRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const ordered = (["savings", "shares", "benevolent"] as const)
    .map(t => wallets.find(w => w.wallet_type === t))
    .filter(Boolean) as WalletRow[];

  const total = ordered.reduce((s, w) => s + w.balance, 0);
  const shares = ordered.find(w => w.wallet_type === "shares")?.balance ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Wallets</h1>
          <p className="text-sm text-muted-foreground">Your savings, share capital and charitable fund in one place.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/statements"><FileText className="mr-2 h-4 w-4" /> Statements</Link></Button>
          <DepositDialog wallets={ordered} onSuccess={load} trigger={<Button variant="gold" disabled={!ordered.length}>Deposit</Button>} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-primary p-6 text-primary-foreground shadow-card md:col-span-1">
          <p className="text-xs uppercase tracking-widest text-primary-foreground/60">Total holdings</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">KES {fmt(total)}</p>
          <p className="mt-3 text-sm text-primary-foreground/80">Loan eligibility: KES {fmt(shares * 3)}</p>
          <Button variant="gold" size="sm" className="mt-4" asChild>
            <Link to="/loans"><HandCoins className="mr-2 h-4 w-4" /> Apply for a loan</Link>
          </Button>
        </Card>

        {ordered.map(w => {
          const m = meta[w.wallet_type];
          const Icon = m.icon;
          const count = txs.filter(t => t.wallet_id === w.id).length;
          return (
            <Card key={w.id} className="p-6 shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{w.currency}</span>
              </div>
              <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">{m.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{fmt(w.balance)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{m.blurb}</p>
              <p className="mt-2 text-xs text-muted-foreground">{count} recent movement{count === 1 ? "" : "s"}</p>
              <DepositDialog
                wallets={ordered}
                defaultWalletId={w.id}
                onSuccess={load}
                trigger={<Button size="sm" variant="outline" className="mt-4 w-full">Deposit</Button>}
              />
            </Card>
          );
        })}
      </div>

      <Card className="p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="font-display text-lg font-semibold">Wallet activity</h4>
          <Button variant="ghost" size="sm" asChild><Link to="/statements">View full statement</Link></Button>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : txs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No wallet activity yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {txs.slice(0, 15).map(t => {
              const w = wallets.find(x => x.id === t.wallet_id);
              const isCredit = ["deposit", "transfer_in", "interest"].includes(t.tx_type);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isCredit ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      <ArrowDownLeft className={`h-4 w-4 ${isCredit ? "" : "rotate-180"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium capitalize">{t.tx_type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {w ? meta[w.wallet_type].label : "Wallet"} · {t.method.replace(/_/g, " ")} · {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {t.status !== "completed" && <Badge variant="secondary" className="capitalize">{t.status}</Badge>}
                    <p className={`font-display text-sm font-semibold tabular-nums ${isCredit ? "text-success" : "text-destructive"}`}>
                      {isCredit ? "+" : "−"} {t.currency} {fmt(Number(t.amount))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
