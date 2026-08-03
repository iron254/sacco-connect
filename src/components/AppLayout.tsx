import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LayoutDashboard, Wallet, HandCoins, Users, FileText, Bell, Settings, LogOut, ShieldCheck, Shield, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";

const nav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { to: "/wallets", icon: Wallet, label: "Wallets" },
  { to: "/loans", icon: HandCoins, label: "Loans" },
  { to: "/guarantors", icon: Users, label: "Guarantors" },
  { to: "/statements", icon: FileText, label: "Statements" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
];

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const [profile, setProfile] = useState<{ full_name: string | null; member_number: string | null; kyc_status: string } | null>(null);

  const claimAdmin = async () => {
    const { data, error } = await supabase.rpc("claim_admin_if_none");
    if (error) return toast.error(error.message);
    if (data) { toast.success("You are now admin. Reloading…"); setTimeout(() => location.reload(), 600); }
    else toast.error("An admin already exists.");
  };

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, member_number, kyc_status").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data as any));
  }, [user]);

  const initials = (profile?.full_name || user?.email || "M").split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-20 items-center border-b border-sidebar-border px-6">
          <Logo variant="light" />
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {nav.map(({ to, icon: Icon, label, soon }) => (
            soon ? (
              <div key={to} aria-disabled="true" className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground/40">
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-sidebar-foreground/60">Soon</span>
              </div>
            ) : (
              <NavLink key={to} to={to} end className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-base",
                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}>
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
              </NavLink>
            )
          ))}
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => cn(
              "mt-4 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-base",
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
              <Shield className="h-4 w-4" />
              <span className="flex-1">Admin</span>
            </NavLink>
          )}
          {!isAdmin && (
            <button onClick={claimAdmin} className="mt-4 flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground/80">
              <Shield className="h-3.5 w-3.5" /> Claim admin (first user)
            </button>
          )}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <NavLink to="/settings" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground">
            <Settings className="h-4 w-4" /> Settings
          </NavLink>
          <button onClick={async () => { await signOut(); navigate("/"); }} className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-20 items-center justify-between border-b border-border bg-card px-6 lg:px-10">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Member</p>
            <h2 className="font-display text-lg font-semibold">{profile?.full_name || "Welcome"}</h2>
          </div>
          <div className="flex items-center gap-4">
            {profile?.kyc_status === "verified" ? (
              <span className="hidden items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success sm:inline-flex">
                <ShieldCheck className="h-3.5 w-3.5" /> KYC verified
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate("/onboarding")}>Complete KYC</Button>
            )}
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium">{profile?.member_number || "—"}</div>
                <div className="text-xs text-muted-foreground">Member no.</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                  <Avatar className="h-10 w-10 border border-border">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="text-sm font-medium">{profile?.full_name || "Member"}</div>
                    <div className="text-xs font-normal text-muted-foreground">{user?.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate("/admin")}>
                      <Shield className="mr-2 h-4 w-4" /> Admin
                    </DropdownMenuItem>
                  )}
                  {!isAdmin && (
                    <DropdownMenuItem onClick={claimAdmin}>
                      <Shield className="mr-2 h-4 w-4" /> Claim admin (first user)
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <Settings className="mr-2 h-4 w-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => { await signOut(); navigate("/"); }}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
