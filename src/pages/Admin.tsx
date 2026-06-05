import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Users, Wallet, ArrowLeftRight, ShieldCheck, FileCheck2, HandCoins, FileText } from "lucide-react";
import { ReportsPanel } from "@/components/ReportsPanel";

type Profile = { id: string; full_name: string | null; member_number: string | null; phone: string | null; kyc_status: string; created_at: string };
type WalletRow = { id: string; user_id: string; wallet_type: string; currency: string; balance: number };
type Tx = { id: string; user_id: string; tx_type: string; amount: number; currency: string; method: string; status: string; created_at: string; reference: string | null };
type Kyc = { id: string; user_id: string; doc_type: string; status: string; storage_path: string; uploaded_at: string; notes: string | null };
type RoleRow = { id: string; user_id: string; role: string };
type Loan = { id: string; user_id: string; principal: number; term_months: number; interest_rate: number; monthly_payment: number; purpose: string | null; status: "pending" | "approved" | "rejected" | "active" | "closed"; created_at: string; rejection_reason: string | null };

const roles = ["member", "teller", "credit_officer", "auditor", "admin"] as const;

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Admin() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [kyc, setKyc] = useState<Kyc[]>([]);
  const [allRoles, setAllRoles] = useState<RoleRow[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [search, setSearch] = useState("");
  const [txStatus, setTxStatus] = useState<string>("all");
  const [loanStatus, setLoanStatus] = useState<string>("pending");
  const [rejectFor, setRejectFor] = useState<Loan | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    const [p, w, t, k, r, l] = await Promise.all([
      supabase.from("profiles").select("id, full_name, member_number, phone, kyc_status, created_at").order("created_at", { ascending: false }),
      supabase.from("wallets").select("id, user_id, wallet_type, currency, balance"),
      supabase.from("transactions").select("id, user_id, tx_type, amount, currency, method, status, created_at, reference").order("created_at", { ascending: false }).limit(200),
      supabase.from("kyc_documents").select("id, user_id, doc_type, status, storage_path, uploaded_at, notes").order("uploaded_at", { ascending: false }),
      supabase.from("user_roles").select("id, user_id, role"),
      supabase.from("loans").select("*").order("created_at", { ascending: false }),
    ]);
    setProfiles((p.data || []) as Profile[]);
    setWallets((w.data || []).map(x => ({ ...x, balance: Number(x.balance) })) as WalletRow[]);
    setTxs((t.data || []).map(x => ({ ...x, amount: Number(x.amount) })) as Tx[]);
    setKyc((k.data || []) as Kyc[]);
    setAllRoles((r.data || []) as RoleRow[]);
    setLoans((l.data || []).map(x => ({ ...x, principal: Number(x.principal), monthly_payment: Number(x.monthly_payment) })) as Loan[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = wallets.reduce<Record<string, number>>((acc, w) => {
    acc[w.wallet_type] = (acc[w.wallet_type] || 0) + w.balance;
    return acc;
  }, {});
  const totalAll = Object.values(totals).reduce((a, b) => a + b, 0);

  const memberById = (id: string) => profiles.find(p => p.id === id);
  const filteredProfiles = profiles.filter(p =>
    !search || (p.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.member_number || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || "").includes(search)
  );
  const filteredTx = txs.filter(t => txStatus === "all" || t.status === txStatus);

  const setKycStatus = async (id: string, status: "verified" | "rejected") => {
    const { error } = await supabase.from("kyc_documents").update({ status }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: `Document ${status}` });
    load();
  };

  const viewDoc = async (path: string) => {
    const { data } = await supabase.storage.from("member-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const setUserRole = async (userId: string, role: typeof roles[number]) => {
    // Remove existing roles for this user, then insert the new one
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Role updated" });
    load();
  };

  const userRole = (id: string) => allRoles.find(r => r.user_id === id)?.role || "member";

  const filteredLoans = loans.filter(l => loanStatus === "all" || l.status === loanStatus);
  const pendingLoanCount = loans.filter(l => l.status === "pending").length;

  const approveLoan = async (l: Loan) => {
    const { error } = await supabase.from("loans").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", l.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Loan approved" });
    load();
  };

  const submitReject = async () => {
    if (!rejectFor) return;
    if (!rejectReason.trim()) return toast({ title: "Reason required", variant: "destructive" });
    const { error } = await supabase.from("loans").update({ status: "rejected", rejection_reason: rejectReason.trim() }).eq("id", rejectFor.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Loan rejected" });
    setRejectFor(null); setRejectReason("");
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Administration</p>
        <h1 className="font-display text-3xl font-semibold">Admin dashboard</h1>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card className="p-5">
          <div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><span className="text-xs uppercase tracking-widest text-muted-foreground">Members</span></div>
          <p className="mt-3 font-display text-2xl font-semibold">{profiles.length}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><Wallet className="h-5 w-5 text-primary" /><span className="text-xs uppercase tracking-widest text-muted-foreground">Total balances</span></div>
          <p className="mt-3 font-display text-2xl font-semibold">KES {fmt(totalAll)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><ArrowLeftRight className="h-5 w-5 text-primary" /><span className="text-xs uppercase tracking-widest text-muted-foreground">Transactions</span></div>
          <p className="mt-3 font-display text-2xl font-semibold">{txs.length}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><FileCheck2 className="h-5 w-5 text-primary" /><span className="text-xs uppercase tracking-widest text-muted-foreground">Pending KYC</span></div>
          <p className="mt-3 font-display text-2xl font-semibold">{kyc.filter(k => k.status === "submitted" || k.status === "pending").length}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><HandCoins className="h-5 w-5 text-primary" /><span className="text-xs uppercase tracking-widest text-muted-foreground">Pending loans</span></div>
          <p className="mt-3 font-display text-2xl font-semibold">{pendingLoanCount}</p>
        </Card>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="kyc">KYC review</TabsTrigger>
          <TabsTrigger value="loans">Loans {pendingLoanCount > 0 && <Badge variant="secondary" className="ml-1.5">{pendingLoanCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="reports"><FileText className="mr-1 h-3.5 w-3.5" /> Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card className="p-5">
            <Input placeholder="Search by name, member no., phone…" value={search} onChange={e => setSearch(e.target.value)} className="mb-4 max-w-sm" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Member</th><th>Phone</th><th>KYC</th><th>Joined</th></tr>
                </thead>
                <tbody>
                  {filteredProfiles.map(p => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2.5">
                        <div className="font-medium">{p.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.member_number || "—"}</div>
                      </td>
                      <td>{p.phone || "—"}</td>
                      <td><Badge variant={p.kyc_status === "verified" ? "default" : "secondary"}>{p.kyc_status}</Badge></td>
                      <td className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProfiles.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No members found</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="kyc">
          <Card className="p-5">
            <div className="space-y-3">
              {kyc.map(k => {
                const m = memberById(k.user_id);
                return (
                  <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div>
                      <div className="font-medium">{m?.full_name || "Unknown"} <span className="text-xs text-muted-foreground">· {m?.member_number}</span></div>
                      <div className="text-xs text-muted-foreground">{k.doc_type} · uploaded {new Date(k.uploaded_at).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={k.status === "verified" ? "default" : k.status === "rejected" ? "destructive" : "secondary"}>{k.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => viewDoc(k.storage_path)}>View</Button>
                      <Button size="sm" onClick={() => setKycStatus(k.id, "verified")}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => setKycStatus(k.id, "rejected")}>Reject</Button>
                    </div>
                  </div>
                );
              })}
              {kyc.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No KYC documents submitted</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="loans">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <Select value={loanStatus} onValueChange={setLoanStatus}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{filteredLoans.length} shown</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Applied</th><th>Member</th><th>Amount</th><th>Term</th><th>Monthly</th><th>Purpose</th><th>Status</th><th className="text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {filteredLoans.map(l => {
                    const m = memberById(l.user_id);
                    return (
                      <tr key={l.id} className="border-t border-border align-top">
                        <td className="py-3 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
                        <td>{m?.full_name || "—"}<div className="text-xs text-muted-foreground">{m?.member_number}</div></td>
                        <td className="font-medium tabular-nums">KES {fmt(l.principal)}</td>
                        <td>{l.term_months} mo</td>
                        <td className="tabular-nums">KES {fmt(l.monthly_payment)}</td>
                        <td className="max-w-xs text-xs text-muted-foreground">{l.purpose || "—"}{l.rejection_reason && <div className="mt-1 text-destructive">Rejected: {l.rejection_reason}</div>}</td>
                        <td><Badge variant={l.status === "approved" || l.status === "active" ? "default" : l.status === "rejected" ? "destructive" : l.status === "closed" ? "outline" : "secondary"}>{l.status}</Badge></td>
                        <td className="text-right">
                          {l.status === "pending" && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" onClick={() => approveLoan(l)}>Approve</Button>
                              <Button size="sm" variant="destructive" onClick={() => { setRejectFor(l); setRejectReason(""); }}>Reject</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredLoans.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No loans</p>}
            </div>
          </Card>

          <Dialog open={!!rejectFor} onOpenChange={(o) => { if (!o) { setRejectFor(null); setRejectReason(""); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject loan application</DialogTitle>
              </DialogHeader>
              {rejectFor && (
                <div className="space-y-3 text-sm">
                  <div className="rounded-md bg-muted/50 p-3">
                    <div><span className="text-muted-foreground">Member:</span> {memberById(rejectFor.user_id)?.full_name || "—"}</div>
                    <div><span className="text-muted-foreground">Amount:</span> KES {fmt(rejectFor.principal)} over {rejectFor.term_months} months</div>
                  </div>
                  <div>
                    <Label htmlFor="reason">Reason for rejection</Label>
                    <Textarea id="reason" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why this loan is being rejected…" rows={4} />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
                <Button variant="destructive" onClick={submitReject}>Confirm rejection</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="transactions">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <Select value={txStatus} onValueChange={setTxStatus}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="reversed">Reversed</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{filteredTx.length} shown</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">When</th><th>Member</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filteredTx.map(t => {
                    const m = memberById(t.user_id);
                    return (
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-2.5 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                        <td>{m?.full_name || "—"}<div className="text-xs text-muted-foreground">{m?.member_number}</div></td>
                        <td className="capitalize">{t.tx_type.replace("_", " ")}</td>
                        <td className="capitalize">{t.method.replace("_", " ")}</td>
                        <td className="font-medium tabular-nums">{t.currency} {fmt(t.amount)}</td>
                        <td><Badge variant={t.status === "completed" ? "default" : t.status === "failed" ? "destructive" : "secondary"}>{t.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredTx.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No transactions</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="wallets">
          <Card className="p-5">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {(["savings", "shares", "benevolent"] as const).map(t => (
                <div key={t} className="rounded-md border border-border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">{t === "benevolent" ? "charitable" : t}</p>
                  <p className="mt-1 font-display text-xl font-semibold">KES {fmt(totals[t] || 0)}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Member</th><th>Wallet</th><th>Balance</th></tr>
                </thead>
                <tbody>
                  {wallets.map(w => {
                    const m = memberById(w.user_id);
                    return (
                      <tr key={w.id} className="border-t border-border">
                        <td className="py-2.5">{m?.full_name || "—"}<div className="text-xs text-muted-foreground">{m?.member_number}</div></td>
                        <td className="capitalize">{w.wallet_type === "benevolent" ? "charitable" : w.wallet_type}</td>
                        <td className="font-medium tabular-nums">{w.currency} {fmt(w.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card className="p-5">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Assign one role per user.</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Member</th><th>Current role</th><th>Change to</th></tr>
                </thead>
                <tbody>
                  {profiles.map(p => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2.5">{p.full_name || "—"}<div className="text-xs text-muted-foreground">{p.member_number}</div></td>
                      <td><Badge variant="secondary" className="capitalize">{userRole(p.id).replace("_", " ")}</Badge></td>
                      <td>
                        <Select value={userRole(p.id)} onValueChange={(v) => setUserRole(p.id, v as typeof roles[number])}>
                          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {roles.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
