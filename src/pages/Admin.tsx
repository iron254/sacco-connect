import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Users, Wallet, ArrowLeftRight, ShieldCheck, FileCheck2, HandCoins, FileText, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { ReportsPanel } from "@/components/ReportsPanel";

type BulkConfirm = { title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => Promise<void> } | null;

function useBulkSelection<T extends { id: string }>(rows: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [rows]);
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.id));
  const someChecked = rows.some(r => selected.has(r.id)) && !allChecked;
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map(r => r.id)));
  const clear = () => setSelected(new Set());
  return { selected, toggle, toggleAll, allChecked, someChecked, clear };
}

type Profile = { id: string; full_name: string | null; member_number: string | null; phone: string | null; kyc_status: string; created_at: string };
type WalletRow = { id: string; user_id: string; wallet_type: string; currency: string; balance: number };
type Tx = { id: string; user_id: string; tx_type: string; amount: number; currency: string; method: string; status: string; created_at: string; reference: string | null };
type Kyc = { id: string; user_id: string; doc_type: string; status: string; storage_path: string; uploaded_at: string; notes: string | null };
type RoleRow = { id: string; user_id: string; role: string };
type Loan = { id: string; user_id: string; principal: number; term_months: number; interest_rate: number; monthly_payment: number; purpose: string | null; status: "pending" | "approved" | "rejected" | "active" | "closed"; created_at: string; rejection_reason: string | null };

const roles = ["member", "teller", "credit_officer", "auditor", "admin"] as const;
const PAGE = 25;

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

async function fetchProfilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  const map = new Map<string, Profile>();
  const uniq = Array.from(new Set(ids));
  for (let i = 0; i < uniq.length; i += 500) {
    const slice = uniq.slice(i, i + 500);
    if (!slice.length) continue;
    const { data } = await supabase.from("profiles").select("id, full_name, member_number, phone, kyc_status, created_at").in("id", slice);
    (data || []).forEach(p => map.set(p.id, p as Profile));
  }
  return map;
}

export default function Admin() {
  // Summary metrics (fast)
  const [summary, setSummary] = useState<{ members: number; transactions: number; pendingKyc: number; pendingLoans: number; totalBalances: number; totals: Record<string, number> }>({
    members: 0, transactions: 0, pendingKyc: 0, pendingLoans: 0, totalBalances: 0, totals: {},
  });

  const loadSummary = useCallback(async () => {
    const [m, t, k, l, w] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("transactions").select("id", { count: "exact", head: true }),
      supabase.from("kyc_documents").select("id", { count: "exact", head: true }).in("status", ["submitted", "pending"]),
      supabase.from("loans").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.rpc("admin_wallet_totals"),
    ]);
    const totals: Record<string, number> = {};
    (w.data as { wallet_type: string; total: number }[] | null || []).forEach(r => { totals[r.wallet_type] = Number(r.total); });
    setSummary({
      members: m.count ?? 0,
      transactions: t.count ?? 0,
      pendingKyc: k.count ?? 0,
      pendingLoans: l.count ?? 0,
      totalBalances: Object.values(totals).reduce((a, b) => a + b, 0),
      totals,
    });
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Administration</p>
        <h1 className="font-display text-3xl font-semibold">Admin dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={<Users className="h-5 w-5 text-primary" />} label="Members" value={String(summary.members)} />
        <StatCard icon={<Wallet className="h-5 w-5 text-primary" />} label="Total balances" value={`KES ${fmt(summary.totalBalances)}`} />
        <StatCard icon={<ArrowLeftRight className="h-5 w-5 text-primary" />} label="Transactions" value={String(summary.transactions)} />
        <StatCard icon={<FileCheck2 className="h-5 w-5 text-primary" />} label="Pending KYC" value={String(summary.pendingKyc)} />
        <StatCard icon={<HandCoins className="h-5 w-5 text-primary" />} label="Pending loans" value={String(summary.pendingLoans)} />
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="kyc">KYC review</TabsTrigger>
          <TabsTrigger value="loans">Loans {summary.pendingLoans > 0 && <Badge variant="secondary" className="ml-1.5">{summary.pendingLoans}</Badge>}</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="reports"><FileText className="mr-1 h-3.5 w-3.5" /> Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="members"><MembersTab /></TabsContent>
        <TabsContent value="kyc"><KycTab onChange={loadSummary} /></TabsContent>
        <TabsContent value="loans"><LoansTab onChange={loadSummary} /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
        <TabsContent value="wallets"><WalletsTab totals={summary.totals} /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="reports"><ReportsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">{icon}<span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span></div>
      <p className="mt-3 font-display text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Pager({ page, setPage, total, loading }: { page: number; setPage: (n: number) => void; total: number; loading?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>{loading ? "Loading…" : `${total.toLocaleString()} total`} · Page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* -------------------- Members -------------------- */
function MembersTab() {
  const [search, setSearch] = useState("");
  const dq = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(1); }, [dq]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase.from("profiles").select("id, full_name, member_number, phone, kyc_status, created_at", { count: "exact" });
      if (dq.trim()) q = q.or(`full_name.ilike.%${dq}%,member_number.ilike.%${dq}%,phone.ilike.%${dq}%`);
      const from = (page - 1) * PAGE;
      const { data, count } = await q.order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (cancelled) return;
      setRows((data || []) as Profile[]);
      setTotal(count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dq, page]);

  return (
    <Card className="p-5">
      <Input placeholder="Search by name, member no., phone…" value={search} onChange={e => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Member</th><th>Phone</th><th>KYC</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-2.5"><div className="font-medium">{p.full_name || "—"}</div><div className="text-xs text-muted-foreground">{p.member_number || "—"}</div></td>
                <td>{p.phone || "—"}</td>
                <td><Badge variant={p.kyc_status === "verified" ? "default" : "secondary"}>{p.kyc_status}</Badge></td>
                <td className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No members found</p>}
      </div>
      <Pager page={page} setPage={setPage} total={total} loading={loading} />
    </Card>
  );
}

/* -------------------- KYC -------------------- */
function KycTab({ onChange }: { onChange: () => void }) {
  const [statusF, setStatusF] = useState<string>("submitted");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Kyc[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, Profile>>(new Map());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [confirm, setConfirm] = useState<BulkConfirm>(null);
  const [busy, setBusy] = useState(false);
  const { selected, toggle, toggleAll, allChecked, someChecked, clear } = useBulkSelection(rows);

  useEffect(() => { setPage(1); }, [statusF]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase.from("kyc_documents").select("id, user_id, doc_type, status, storage_path, uploaded_at, notes", { count: "exact" });
      if (statusF !== "all") q = q.eq("status", statusF as any);
      const from = (page - 1) * PAGE;
      const { data, count } = await q.order("uploaded_at", { ascending: false }).range(from, from + PAGE - 1);
      if (cancelled) return;
      const list = (data || []) as Kyc[];
      setRows(list); setTotal(count ?? 0);
      setMemberMap(await fetchProfilesByIds(list.map(k => k.user_id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [statusF, page, tick]);

  const setKycStatus = async (id: string, status: "verified" | "rejected") => {
    const { error } = await supabase.from("kyc_documents").update({ status }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: `Document ${status}` });
    setTick(t => t + 1); onChange();
  };
  const viewDoc = async (path: string) => {
    const { data } = await supabase.storage.from("member-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const bulkUpdate = async (status: "verified" | "rejected") => {
    setBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from("kyc_documents").update({ status }).in("id", ids);
    setBusy(false);
    if (error) { toast({ title: "Bulk update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${ids.length} document(s) ${status}` });
    clear(); setConfirm(null); setTick(t => t + 1); onChange();
  };

  const askBulk = (status: "verified" | "rejected") => setConfirm({
    title: status === "verified" ? "Verify selected documents?" : "Reject selected documents?",
    description: `This will mark ${selected.size} KYC document(s) as ${status}. This action can be reversed by changing status again.`,
    confirmLabel: status === "verified" ? "Verify all" : "Reject all",
    destructive: status === "rejected",
    onConfirm: () => bulkUpdate(status),
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">{selected.size} selected</span>
            <Button size="sm" onClick={() => askBulk("verified")}>Verify</Button>
            <Button size="sm" variant="destructive" onClick={() => askBulk("rejected")}>Reject</Button>
            <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={toggleAll} />
          Select all on page
        </label>
      )}
      <div className="space-y-3">
        {rows.map(k => {
          const m = memberMap.get(k.user_id);
          return (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="flex items-center gap-3">
                <Checkbox checked={selected.has(k.id)} onCheckedChange={() => toggle(k.id)} />
                <div>
                  <div className="font-medium">{m?.full_name || "Unknown"} <span className="text-xs text-muted-foreground">· {m?.member_number}</span></div>
                  <div className="text-xs text-muted-foreground">{k.doc_type} · uploaded {new Date(k.uploaded_at).toLocaleString()}</div>
                </div>
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
        {!loading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No documents</p>}
      </div>
      <Pager page={page} setPage={setPage} total={total} loading={loading} />
      <ConfirmBulkDialog confirm={confirm} busy={busy} onClose={() => setConfirm(null)} />
    </Card>
  );
}

function ConfirmBulkDialog({ confirm, busy, onClose }: { confirm: BulkConfirm; busy: boolean; onClose: () => void }) {
  return (
    <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => { e.preventDefault(); confirm?.onConfirm(); }}
            className={confirm?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* -------------------- Loans -------------------- */
function LoansTab({ onChange }: { onChange: () => void }) {
  const [statusF, setStatusF] = useState<string>("pending");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Loan[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, Profile>>(new Map());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [rejectFor, setRejectFor] = useState<Loan | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => { setPage(1); }, [statusF]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase.from("loans").select("*", { count: "exact" });
      if (statusF !== "all") q = q.eq("status", statusF as any);
      const from = (page - 1) * PAGE;
      const { data, count } = await q.order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (cancelled) return;
      const list = (data || []).map((x: any) => ({ ...x, principal: Number(x.principal), monthly_payment: Number(x.monthly_payment) })) as Loan[];
      setRows(list); setTotal(count ?? 0);
      setMemberMap(await fetchProfilesByIds(list.map(l => l.user_id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [statusF, page, tick]);

  const approveLoan = async (l: Loan) => {
    const { error } = await supabase.from("loans").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", l.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Loan approved" });
    setTick(t => t + 1); onChange();
  };
  const submitReject = async () => {
    if (!rejectFor) return;
    if (!rejectReason.trim()) return toast({ title: "Reason required", variant: "destructive" });
    const { error } = await supabase.from("loans").update({ status: "rejected", rejection_reason: rejectReason.trim() }).eq("id", rejectFor.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Loan rejected" });
    setRejectFor(null); setRejectReason("");
    setTick(t => t + 1); onChange();
  };

  return (
    <>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <Select value={statusF} onValueChange={setStatusF}>
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
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Applied</th><th>Member</th><th>Amount</th><th>Term</th><th>Monthly</th><th>Purpose</th><th>Status</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {rows.map(l => {
                const m = memberMap.get(l.user_id);
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
          {!loading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No loans</p>}
        </div>
        <Pager page={page} setPage={setPage} total={total} loading={loading} />
      </Card>

      <Dialog open={!!rejectFor} onOpenChange={(o) => { if (!o) { setRejectFor(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject loan application</DialogTitle></DialogHeader>
          {rejectFor && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-muted/50 p-3">
                <div><span className="text-muted-foreground">Member:</span> {memberMap.get(rejectFor.user_id)?.full_name || "—"}</div>
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
    </>
  );
}

/* -------------------- Transactions -------------------- */
function TransactionsTab() {
  const [statusF, setStatusF] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Tx[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, Profile>>(new Map());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(1); }, [statusF]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase.from("transactions").select("id, user_id, tx_type, amount, currency, method, status, created_at, reference", { count: "exact" });
      if (statusF !== "all") q = q.eq("status", statusF as any);
      const from = (page - 1) * PAGE;
      const { data, count } = await q.order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (cancelled) return;
      const list = (data || []).map((x: any) => ({ ...x, amount: Number(x.amount) })) as Tx[];
      setRows(list); setTotal(count ?? 0);
      setMemberMap(await fetchProfilesByIds(list.map(t => t.user_id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [statusF, page]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">When</th><th>Member</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map(t => {
              const m = memberMap.get(t.user_id);
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
        {!loading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No transactions</p>}
      </div>
      <Pager page={page} setPage={setPage} total={total} loading={loading} />
    </Card>
  );
}

/* -------------------- Wallets -------------------- */
function WalletsTab({ totals }: { totals: Record<string, number> }) {
  const [typeF, setTypeF] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, Profile>>(new Map());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(1); }, [typeF]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase.from("wallets").select("id, user_id, wallet_type, currency, balance", { count: "exact" });
      if (typeF !== "all") q = q.eq("wallet_type", typeF as "savings" | "shares" | "benevolent");
      const from = (page - 1) * PAGE;
      const { data, count } = await q.order("balance", { ascending: false }).range(from, from + PAGE - 1);
      if (cancelled) return;
      const list = (data || []).map((x: any) => ({ ...x, balance: Number(x.balance) })) as WalletRow[];
      setRows(list); setTotal(count ?? 0);
      setMemberMap(await fetchProfilesByIds(list.map(w => w.user_id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [typeF, page]);

  return (
    <Card className="p-5">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {(["savings", "shares", "benevolent"] as const).map(t => (
          <div key={t} className="rounded-md border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t === "benevolent" ? "charitable" : t}</p>
            <p className="mt-1 font-display text-xl font-semibold">KES {fmt(totals[t] || 0)}</p>
          </div>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-3">
        <Select value={typeF} onValueChange={setTypeF}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All wallets</SelectItem>
            <SelectItem value="savings">Savings</SelectItem>
            <SelectItem value="shares">Shares</SelectItem>
            <SelectItem value="benevolent">Charitable</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Member</th><th>Wallet</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {rows.map(w => {
              const m = memberMap.get(w.user_id);
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
      <Pager page={page} setPage={setPage} total={total} loading={loading} />
    </Card>
  );
}

/* -------------------- Roles -------------------- */
function RolesTab() {
  const [search, setSearch] = useState("");
  const dq = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Profile[]>([]);
  const [roleMap, setRoleMap] = useState<Map<string, string>>(new Map());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { setPage(1); }, [dq]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase.from("profiles").select("id, full_name, member_number, phone, kyc_status, created_at", { count: "exact" });
      if (dq.trim()) q = q.or(`full_name.ilike.%${dq}%,member_number.ilike.%${dq}%`);
      const from = (page - 1) * PAGE;
      const { data, count } = await q.order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (cancelled) return;
      const list = (data || []) as Profile[];
      setRows(list); setTotal(count ?? 0);
      const { data: rd } = await supabase.from("user_roles").select("user_id, role").in("user_id", list.map(p => p.id));
      const m = new Map<string, string>();
      (rd || []).forEach((r: any) => m.set(r.user_id, r.role));
      setRoleMap(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dq, page, tick]);

  const setUserRole = async (userId: string, role: typeof roles[number]) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Role updated" });
    setTick(t => t + 1);
  };

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Assign one role per user.</div>
      <Input placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Member</th><th>Current role</th><th>Change to</th></tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const current = roleMap.get(p.id) || "member";
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2.5">{p.full_name || "—"}<div className="text-xs text-muted-foreground">{p.member_number}</div></td>
                  <td><Badge variant="secondary" className="capitalize">{current.replace("_", " ")}</Badge></td>
                  <td>
                    <Select value={current} onValueChange={(v) => setUserRole(p.id, v as typeof roles[number])}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {roles.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      </div>
      <Pager page={page} setPage={setPage} total={total} loading={loading} />
    </Card>
  );
}
