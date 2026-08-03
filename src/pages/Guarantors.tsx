import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserPlus, Search, HandCoins } from "lucide-react";
import { toast } from "sonner";

type Loan = { id: string; principal: number; status: string; created_at: string; term_months: number };
type GuarantorRow = {
  id: string;
  loan_id: string;
  requester_id: string;
  guarantor_id: string;
  amount: number;
  status: "pending" | "accepted" | "declined";
  response_note: string | null;
  created_at: string;
};

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tone: Record<string, "default" | "secondary" | "destructive"> = { accepted: "default", pending: "secondary", declined: "destructive" };

export default function Guarantors() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [mine, setMine] = useState<GuarantorRow[]>([]);
  const [requests, setRequests] = useState<GuarantorRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [loanId, setLoanId] = useState("");
  const [memberNo, setMemberNo] = useState("");
  const [amount, setAmount] = useState("");
  const [found, setFound] = useState<{ id: string; full_name: string | null; member_number: string | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: ls }, { data: gs }] = await Promise.all([
      supabase.from("loans").select("id, principal, status, created_at, term_months").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("loan_guarantors").select("*").order("created_at", { ascending: false }),
    ]);
    setLoans((ls || []) as Loan[]);
    const rows = ((gs || []) as any[]).map(r => ({ ...r, amount: Number(r.amount) })) as GuarantorRow[];
    setMine(rows.filter(r => r.requester_id === user.id));
    setRequests(rows.filter(r => r.guarantor_id === user.id));

    const ids = Array.from(new Set(rows.flatMap(r => [r.requester_id, r.guarantor_id]))).filter(id => id !== user.id);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, member_number").in("id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.full_name || p.member_number || "Member"; });
      setNames(map);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const search = async () => {
    if (!memberNo.trim()) return;
    setSearching(true);
    const { data, error } = await supabase.rpc("find_member_by_number", { _member_number: memberNo.trim() });
    setSearching(false);
    if (error) return toast.error(error.message);
    const hit = (data as any[])?.[0];
    if (!hit) { setFound(null); return toast.error("No member found with that number"); }
    setFound(hit);
  };

  const request = async () => {
    if (!user) return;
    if (!loanId) return toast.error("Select a loan");
    if (!found) return toast.error("Find a member first");
    const amt = Number(amount) || 0;
    if (amt <= 0) return toast.error("Enter the amount to guarantee");
    setSubmitting(true);
    const { error } = await supabase.from("loan_guarantors").insert({
      loan_id: loanId, requester_id: user.id, guarantor_id: found.id, amount: amt,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "That member is already a guarantor on this loan" : error.message);
    toast.success("Guarantor request sent");
    setOpen(false); setLoanId(""); setMemberNo(""); setAmount(""); setFound(null);
    load();
  };

  const respond = async (id: string, status: "accepted" | "declined") => {
    const { error } = await supabase.from("loan_guarantors").update({ status, response_note: note || null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Request ${status}`);
    setNote("");
    load();
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from("loan_guarantors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Request cancelled");
    load();
  };

  const loanLabel = (id: string) => {
    const l = loans.find(x => x.id === id);
    return l ? `KES ${fmt(l.principal)} · ${l.term_months} mo` : "Loan";
  };

  const pendingIn = requests.filter(r => r.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Guarantors</h1>
          <p className="text-sm text-muted-foreground">Ask fellow members to back your loan, and respond to requests sent to you.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/loans"><HandCoins className="mr-2 h-4 w-4" /> My loans</Link></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" disabled={!loans.length}><UserPlus className="mr-2 h-4 w-4" /> Request guarantor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request a guarantor</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Loan</Label>
                  <Select value={loanId} onValueChange={setLoanId}>
                    <SelectTrigger><SelectValue placeholder="Select a loan" /></SelectTrigger>
                    <SelectContent>
                      {loans.map(l => (
                        <SelectItem key={l.id} value={l.id}>KES {fmt(l.principal)} · {l.status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="memberno">Member number</Label>
                  <div className="flex gap-2">
                    <Input id="memberno" value={memberNo} onChange={e => { setMemberNo(e.target.value); setFound(null); }} placeholder="SAC-123456" />
                    <Button type="button" variant="outline" onClick={search} disabled={searching}><Search className="h-4 w-4" /></Button>
                  </div>
                  {found && (
                    <p className="text-xs text-success">Found: {found.full_name || "Member"} ({found.member_number})</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gamt">Amount to guarantee (KES)</Label>
                  <Input id="gamt" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 20000" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={request} disabled={submitting}>{submitting ? "Sending…" : "Send request"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!loans.length && (
        <Card className="p-6 text-sm text-muted-foreground shadow-card">
          You need a loan application before you can request guarantors. <Link to="/loans" className="text-primary underline-offset-4 hover:underline">Apply for a loan</Link>.
        </Card>
      )}

      <Card className="p-6 shadow-card">
        <h4 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="h-5 w-5" /> Requests for you
          {pendingIn.length > 0 && <Badge variant="secondary">{pendingIn.length} pending</Badge>}
        </h4>
        {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          : requests.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No one has asked you to guarantee a loan.</p>
          : (
            <ul className="divide-y divide-border">
              {requests.map(r => (
                <li key={r.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{names[r.requester_id] || "Member"}</p>
                      <p className="text-xs text-muted-foreground">
                        Guarantee KES {fmt(r.amount)} · requested {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={tone[r.status]} className="capitalize">{r.status}</Badge>
                      {r.status === "pending" && (
                        <>
                          <Button size="sm" onClick={() => respond(r.id, "accepted")}>Accept</Button>
                          <Button size="sm" variant="outline" onClick={() => respond(r.id, "declined")}>Decline</Button>
                        </>
                      )}
                    </div>
                  </div>
                  {r.status === "pending" && (
                    <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note with your response" rows={2} />
                  )}
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card className="p-6 shadow-card">
        <h4 className="mb-4 font-display text-lg font-semibold">Guarantors on your loans</h4>
        {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          : mine.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">You haven't requested any guarantors yet.</p>
          : (
            <ul className="divide-y divide-border">
              {mine.map(r => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-sm font-medium">{names[r.guarantor_id] || "Member"}</p>
                    <p className="text-xs text-muted-foreground">{loanLabel(r.loan_id)} · KES {fmt(r.amount)} guaranteed</p>
                    {r.response_note && <p className="mt-1 text-xs italic text-muted-foreground">"{r.response_note}"</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={tone[r.status]} className="capitalize">{r.status}</Badge>
                    {r.status === "pending" && <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>Cancel</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}
