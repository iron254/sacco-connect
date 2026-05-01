import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowUpRight, Wallet, PiggyBank, HeartHandshake, HandCoins, ShieldAlert, Sparkles } from "lucide-react";

const wallets = [
  { id: "savings", label: "Main Savings", icon: PiggyBank, balance: 0, currency: "KES", tone: "primary" as const },
  { id: "shares", label: "Share Capital", icon: Wallet, balance: 0, currency: "KES", tone: "gold" as const },
  { id: "benevolent", label: "Benevolent Fund", icon: HeartHandshake, balance: 0, currency: "KES", tone: "muted" as const },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [nokCount, setNokCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));
    supabase.from("next_of_kin").select("id", { count: "exact", head: true }).eq("user_id", user.id).then(({ count }) => setNokCount(count || 0));
  }, [user]);

  const onboardingSteps = [
    { label: "Account created", done: true },
    { label: "Personal details", done: !!profile?.national_id },
    { label: "KYC documents", done: profile?.kyc_status === "submitted" || profile?.kyc_status === "verified" },
    { label: "Next of kin added", done: nokCount > 0 },
  ];
  const completed = onboardingSteps.filter(s => s.done).length;
  const progress = (completed / onboardingSteps.length) * 100;
  const allDone = completed === onboardingSteps.length;

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
          <Button variant="outline" size="sm" disabled>Deposit (coming soon)</Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {wallets.map(w => (
            <Card key={w.id} className={`relative overflow-hidden p-6 shadow-card ${w.tone === "primary" ? "bg-gradient-primary text-primary-foreground" : ""}`}>
              <div className="flex items-start justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-md ${w.tone === "primary" ? "bg-primary-foreground/15" : w.tone === "gold" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                  <w.icon className="h-5 w-5" />
                </div>
                <span className={`text-xs uppercase tracking-wider ${w.tone === "primary" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{w.currency}</span>
              </div>
              <div className="mt-8">
                <p className={`text-xs uppercase tracking-widest ${w.tone === "primary" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{w.label}</p>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{w.balance.toLocaleString()}.<span className="text-xl opacity-60">00</span></p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick actions placeholder */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-lg font-semibold">Recent activity</h4>
            <Button variant="ghost" size="sm" disabled>View all</Button>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-12 text-center">
            <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No transactions yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Once you make your first contribution, it'll appear here.</p>
          </div>
        </Card>

        <Card className="p-6 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-accent" />
            <h4 className="font-display text-lg font-semibold">Loan eligibility</h4>
          </div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Available to borrow</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">KES 0</p>
          <p className="mt-2 text-sm text-muted-foreground">Loan products unlock once you complete KYC and start saving. You'll be able to borrow up to 3× your share capital.</p>
          <Button className="mt-4 w-full" variant="outline" disabled>Explore loans (Phase 3)</Button>
        </Card>
      </div>
    </div>
  );
}
