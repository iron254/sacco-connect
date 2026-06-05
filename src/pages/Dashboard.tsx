import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowUpRight, Wallet, PiggyBank, HeartHandshake, HandCoins, ShieldAlert, Sparkles, ArrowDownLeft, Download } from "lucide-react";
import { DepositDialog } from "@/components/DepositDialog";
import { downloadReceipt } from "@/lib/reports";

type WalletRow = { id: string; wallet_type: "savings" | "shares" | "benevolent"; currency: string; balance: number };
type TxRow = { id: string; tx_type: string; amount: number; currency: string; method: string; description: string | null; created_at: string; wallet_id: string; reference: string | null; status: string };

const walletMeta = {
  savings: { label: "Main Savings", icon: PiggyBank, tone: "primary" as const },
  shares: { label: "Share Capital", icon: Wallet, tone: "gold" as const },
  benevolent: { label: "Charitable Fund", icon: HeartHandshake, tone: "muted" as const },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [nokCount, setNokCount] = useState(0);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [{ data: prof }, { count }, { data: ws }, { data: tx }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("next_of_kin").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("wallets").select("id, wallet_type, currency, balance").eq("user_id", user.id),
      supabase.from("transactions").select("id, tx_type, amount, currency, method, description, created_at, wallet_id, reference, status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setProfile(prof);
    setNokCount(count || 0);
    setWallets((ws || []).map(w => ({ ...w, balance: Number(w.balance) })) as WalletRow[]);
    setTxs((tx || []) as TxRow[]);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const orderedWallets: WalletRow[] = (["savings", "shares", "benevolent"] as const)
    .map(t => wallets.find(w => w.wallet_type === t))
    .filter(Boolean) as WalletRow[];

  const onboardingSteps = [
    { label: "Account created", done: true },
    { label: "Personal details", done: !!profile?.national_id },
    { label: "KYC documents", done: profile?.kyc_status === "submitted" || profile?.kyc_status === "verified" },
    { label: "Next of kin added", done: nokCount > 0 },
  ];
  const completed = onboardingSteps.filter(s => s.done).length;
  const progress = (completed / onboardingSteps.length) * 100;
  const allDone = completed === onboardingSteps.length;

  const sharesBalance = orderedWallets.find(w => w.wallet_type === "shares")?.balance ?? 0;
  const eligibility = sharesBalance * 3;

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-8">
      {!allDone && (
        <Card className="overflow-hidden border-accent/40 bg-gradient-to-br from-accent-soft to-card p-6 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-xl">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-foreground">
                <Sparkles className="h-3 w-3" /> Finish setting up your account
              </div>
              <h3 className="font-display text-2xl font-semibold">You're {completed} of {onboardingSteps.length} steps in</h3>
              <p className="mt-1 text-sm text-muted-foreground">Complete onboarding to start saving, applying for loans, and earning dividends.</p>
              <Progress value={progress} className="mt-4 h-2" />
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {onboardingSteps.map(s => (
                  <li key={s.label} className="flex items-center gap-2 text-sm">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.done ? "bg-success" : "bg-muted-foreground/40"}`} />
                    <span className={s.done ? "text-foreground line-through decoration-muted-foreground/40" : "text-muted-foreground"}>{s.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="gold" size="lg" asChild>
              <Link to="/onboarding">Continue setup <ArrowUpRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Wallets */}
      <div>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Your wallets</p>
            <h3 className="font-display text-2xl font-semibold">Balances</h3>
          </div>
          <DepositDialog
            wallets={orderedWallets}
            onSuccess={loadAll}
            trigger={<Button variant="gold" size="sm" disabled={!orderedWallets.length}>Deposit</Button>}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {orderedWallets.map(w => {
            const meta = walletMeta[w.wallet_type];
            const Icon = meta.icon;
            return (
              <Card key={w.id} className={`relative overflow-hidden p-6 shadow-card ${meta.tone === "primary" ? "bg-gradient-primary text-primary-foreground" : ""}`}>
                <div className="flex items-start justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-md ${meta.tone === "primary" ? "bg-primary-foreground/15" : meta.tone === "gold" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`text-xs uppercase tracking-wider ${meta.tone === "primary" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{w.currency}</span>
                </div>
                <div className="mt-8">
                  <p className={`text-xs uppercase tracking-widest ${meta.tone === "primary" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{meta.label}</p>
                  <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{fmt(w.balance)}</p>
                </div>
                <div className="mt-4">
                  <DepositDialog
                    wallets={orderedWallets}
                    defaultWalletId={w.id}
                    onSuccess={loadAll}
                    trigger={
                      <Button size="sm" variant={meta.tone === "primary" ? "hero" : "outline"} className="w-full">
                        Deposit
                      </Button>
                    }
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Recent activity + loans */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-lg font-semibold">Recent activity</h4>
            <span className="text-xs text-muted-foreground">{txs.length} latest</span>
          </div>
          {txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-12 text-center">
              <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Once you make your first contribution, it'll appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {txs.map(t => {
                const w = wallets.find(x => x.id === t.wallet_id);
                const isCredit = ["deposit", "transfer_in", "interest"].includes(t.tx_type);
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isCredit ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        <ArrowDownLeft className={`h-4 w-4 ${isCredit ? "" : "rotate-180"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">{t.tx_type.replace("_", " ")}</p>
                        <p className="text-xs text-muted-foreground">
                          {w ? walletMeta[w.wallet_type].label : "Wallet"} · {t.method.replace("_", " ")} · {new Date(t.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className={`font-display text-sm font-semibold tabular-nums ${isCredit ? "text-success" : "text-destructive"}`}>
                        {isCredit ? "+" : "−"} {t.currency} {fmt(Number(t.amount))}
                      </p>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Download receipt"
                        onClick={() => downloadReceipt({
                          tx: t,
                          member: { full_name: profile?.full_name, member_number: profile?.member_number, email: user?.email },
                          walletLabel: w ? walletMeta[w.wallet_type].label : undefined,
                        })}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-6 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-accent" />
            <h4 className="font-display text-lg font-semibold">Loan eligibility</h4>
          </div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Available to borrow</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">KES {fmt(eligibility)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Up to 3× your share capital. Grow your share wallet to unlock more.</p>
          <Button className="mt-4 w-full" variant="outline" asChild><Link to="/loans">Explore loans</Link></Button>
        </Card>
      </div>
    </div>
  );
}
