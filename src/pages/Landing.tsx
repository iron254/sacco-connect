import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ShieldCheck, Banknote, Users, TrendingUp, FileText, Bell } from "lucide-react";
import heroImg from "@/assets/hero-banking.jpg";

const features = [
  { icon: Banknote, title: "Multi-wallet savings", desc: "Separate balances for savings, shares and benevolent funds — always reconciled." },
  { icon: TrendingUp, title: "Loan multipliers", desc: "See exactly how much you can borrow against your share capital in real time." },
  { icon: Users, title: "Digital guarantorship", desc: "Request and approve loan guarantees in-app — no more paper forms." },
  { icon: FileText, title: "Instant statements", desc: "Generate audit-ready PDF statements for any date range in seconds." },
  { icon: Bell, title: "Live notifications", desc: "Stay informed about repayments, dividends and AGM resolutions." },
  { icon: ShieldCheck, title: "Bank-grade security", desc: "Every transaction is logged with a full audit trail and role-based access." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="absolute top-0 z-10 w-full">
        <div className="container flex h-20 items-center justify-between">
          <Logo variant="light" />
          <nav className="flex items-center gap-3">
            <Button variant="hero" asChild><Link to="/auth">Sign in</Link></Button>
            <Button variant="gold" asChild><Link to="/auth?mode=signup">Become a member</Link></Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImg} alt="Co-operative members at a SACCO branch" className="h-full w-full object-cover" width={1536} height={1024} />
          <div className="absolute inset-0 bg-gradient-hero" />
        </div>
        <div className="container relative grid min-h-[640px] items-center gap-8 py-32 lg:grid-cols-2">
          <div className="max-w-xl text-primary-foreground">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-4 py-1.5 text-xs uppercase tracking-widest backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Trusted since 1968
            </div>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Your savings.<br /><span className="text-accent">Your dividends.</span><br />Your co-operative.
            </h1>
            <p className="mt-6 max-w-md text-lg text-primary-foreground/80">
              Manage your shares, contributions and loans with the confidence of a traditional SACCO and the convenience of a modern bank.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button variant="gold" size="lg" asChild>
                <Link to="/auth?mode=signup">Open a member account</Link>
              </Button>
              <Button variant="hero" size="lg" asChild>
                <Link to="/auth">Member sign-in</Link>
              </Button>
            </div>
            <div className="mt-12 grid grid-cols-3 gap-6 border-t border-primary-foreground/15 pt-8">
              {[["48K+", "Active members"], ["KES 12B", "Assets under mgmt"], ["14.2%", "2025 dividend"]].map(([v, l]) => (
                <div key={l}>
                  <div className="font-display text-2xl text-accent">{v}</div>
                  <div className="text-xs uppercase tracking-wider text-primary-foreground/60">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm uppercase tracking-widest text-accent">A single source of truth</p>
          <h2 className="mt-3 font-display text-4xl font-semibold">Everything a SACCO member needs, in one place</h2>
          <p className="mt-4 text-muted-foreground">Built for transparency, designed for trust. Every shilling accounted for, every action logged.</p>
        </div>
        <div className="mt-16 grid gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card p-8 transition-base hover:bg-accent-soft">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-primary/5 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-primary-foreground">
        <div className="container py-20 text-center">
          <h2 className="font-display text-4xl font-semibold">Join 48,000+ members building wealth together</h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-foreground/75">Membership starts from KES 1,000. Apply online in minutes.</p>
          <Button variant="gold" size="lg" className="mt-8" asChild>
            <Link to="/auth?mode=signup">Begin your application</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border bg-background">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
          <Logo />
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Umoja SACCO Society Ltd. Regulated by SASRA.</p>
        </div>
      </footer>
    </div>
  );
}
