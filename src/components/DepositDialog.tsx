import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Smartphone, CheckCircle2, XCircle, Clock } from "lucide-react";

type Wallet = { id: string; wallet_type: string; currency: string };

const baseSchema = z.object({
  wallet_id: z.string().uuid("Select a wallet"),
  amount: z.number().positive("Amount must be greater than 0").max(10_000_000, "Amount too large"),
  reference: z.string().trim().max(64).optional(),
});
type BaseData = z.infer<typeof baseSchema>;

const phoneSchema = z.string().regex(/^(?:254|\+254|0)?(7\d{8}|1\d{8})$/, "Enter a valid Kenyan phone (e.g. 0712345678)");

interface Props {
  wallets: Wallet[];
  defaultWalletId?: string;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

const labels: Record<string, string> = {
  savings: "Main Savings",
  shares: "Share Capital",
  benevolent: "Charitable Fund",
};

export function DepositDialog({ wallets, defaultWalletId, trigger, onSuccess }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [walletId, setWalletId] = useState(defaultWalletId ?? wallets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"mpesa" | "bank_transfer" | "card" | "cash">("mpesa");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "status">("form");
  const [txStatus, setTxStatus] = useState<"pending" | "completed" | "failed">("pending");
  const [statusMsg, setStatusMsg] = useState<string>("Waiting for you to enter your M-Pesa PIN…");
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanupWatchers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
  };

  const reset = () => {
    setAmount("");
    setReference("");
    setPhone("");
    setMethod("mpesa");
    setStep("form");
    setCheckoutId(null);
    setTxStatus("pending");
    setStatusMsg("Waiting for you to enter your M-Pesa PIN…");
    cleanupWatchers();
  };

  useEffect(() => () => cleanupWatchers(), []);

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    let local = digits;
    if (digits.startsWith("254")) local = "0" + digits.slice(3);
    else if (!digits.startsWith("0")) local = "0" + digits;
    return local.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
  };

  const validateForm = () => {
    const parsed = baseSchema.safeParse({
      wallet_id: walletId,
      amount: Number(amount),
      reference: reference || undefined,
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return null;
    }
    if (method === "mpesa") {
      const phoneCheck = phoneSchema.safeParse(phone);
      if (!phoneCheck.success) {
        toast({ title: "Invalid phone", description: phoneCheck.error.issues[0].message, variant: "destructive" });
        return null;
      }
    }
    return parsed.data;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = validateForm();
    if (!data) return;
    if (method === "mpesa") {
      setStep("confirm");
      return;
    }
    void submitNonMpesa(data);
  };

  const submitNonMpesa = async (data: BaseData) => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      wallet_id: data.wallet_id,
      tx_type: "deposit",
      amount: data.amount,
      currency: "KES",
      status: "pending",
      method,
      reference: data.reference,
      description: `Deposit via ${method} (awaiting verification)`,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Deposit request failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Deposit submitted for verification",
      description: `KES ${data.amount.toLocaleString()} will be credited once an administrator confirms the payment.`,
    });
    reset();
    setOpen(false);
    onSuccess?.();
  };


  const watchTransaction = (cid: string) => {
    cleanupWatchers();

    const apply = (status: string) => {
      if (status === "completed") {
        setTxStatus("completed");
        setStatusMsg("Payment received. Your wallet has been credited.");
        cleanupWatchers();
        onSuccess?.();
      } else if (status === "failed" || status === "cancelled") {
        setTxStatus("failed");
        setStatusMsg("Payment was not completed. You can try again.");
        cleanupWatchers();
      }
    };

    channelRef.current = supabase
      .channel(`tx-${cid}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "transactions",
        filter: `checkout_request_id=eq.${cid}`,
      }, (payload) => apply((payload.new as any).status))
      .subscribe();

    // Fallback poll every 4s in case realtime misses
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase.from("transactions")
        .select("status").eq("checkout_request_id", cid).maybeSingle();
      if (data?.status) apply(data.status);
    }, 4000);

    // Stop polling after 2 min
    window.setTimeout(() => {
      if (pollRef.current) {
        setTxStatus((s) => {
          if (s === "pending") setStatusMsg("Still waiting… check your phone or try again.");
          return s;
        });
      }
    }, 120000);
  };

  const confirmMpesa = async () => {
    const data = validateForm();
    if (!data || !user) return;
    setSubmitting(true);
    const { data: res, error } = await supabase.functions.invoke("mpesa-stk-push", {
      body: { wallet_id: data.wallet_id, amount: data.amount, phone },
    });
    setSubmitting(false);
    if (error || (res as any)?.error) {
      toast({ title: "STK push failed", description: (res as any)?.error || error?.message || "Try again", variant: "destructive" });
      return;
    }
    const cid = (res as any)?.checkout_request_id as string | undefined;
    setCheckoutId(cid ?? null);
    setTxStatus("pending");
    setStatusMsg("STK push sent. Enter your M-Pesa PIN on your phone…");
    setStep("status");
    if (cid) watchTransaction(cid);
  };

  const walletLabel = labels[wallets.find(w => w.id === walletId)?.wallet_type ?? ""] ?? "Wallet";
  const amountNum = Number(amount) || 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {step === "status" ? "Payment status" : step === "confirm" ? "Confirm payment" : "Make a deposit"}
          </DialogTitle>
          <DialogDescription>
            {step === "status"
              ? "We're waiting for confirmation from M-Pesa."
              : step === "confirm"
                ? "Review the details below. We'll send an M-Pesa STK push to your phone."
                : method === "mpesa"
                  ? "We'll send an M-Pesa STK push to your phone."
                  : "Funds are credited to your selected wallet immediately."}
          </DialogDescription>
        </DialogHeader>

        {step === "status" ? (
          <div className="space-y-4">
            <div className={`rounded-md border p-5 flex items-start gap-4 ${
              txStatus === "completed" ? "border-green-500/30 bg-green-500/5"
              : txStatus === "failed" ? "border-destructive/30 bg-destructive/5"
              : "border-border bg-muted/30"
            }`}>
              <div className="mt-0.5">
                {txStatus === "completed" ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : txStatus === "failed" ? (
                  <XCircle className="h-6 w-6 text-destructive" />
                ) : (
                  <Clock className="h-6 w-6 text-muted-foreground animate-pulse" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold capitalize">{txStatus}</span>
                  {txStatus === "pending" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <p className="text-sm text-muted-foreground">{statusMsg}</p>
                <p className="text-xs text-muted-foreground pt-1">
                  KES {amountNum.toLocaleString()} • {formatPhone(phone)}
                </p>
              </div>
            </div>
            <DialogFooter>
              {txStatus === "pending" ? (
                <Button type="button" variant="outline" onClick={() => { setOpen(false); }}>
                  Close
                </Button>
              ) : (
                <Button type="button" variant="gold" onClick={() => { reset(); setOpen(false); }}>
                  Done
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : step === "confirm" ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Payment method</span>
                <span className="text-sm font-medium">M-Pesa</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Phone number</span>
                <span className="text-sm font-medium">{formatPhone(phone)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Wallet</span>
                <span className="text-sm font-medium">{walletLabel}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="font-display text-lg font-semibold">KES {amountNum.toLocaleString()}</span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("form")} disabled={submitting}>Back</Button>
              <Button type="button" variant="gold" onClick={confirmMpesa} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm & pay
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wallet">Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger id="wallet"><SelectValue placeholder="Choose a wallet" /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => (
                    <SelectItem key={w.id} value={w.id}>{labels[w.wallet_type] ?? w.wallet_type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (KES)</Label>
              <Input id="amount" type="number" inputMode="decimal" min="1" step="0.01" placeholder="1000.00"
                value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">Payment method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger id="method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cash">Cash (at branch)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {method === "mpesa" ? (
              <div className="space-y-2">
                <Label htmlFor="phone">M-Pesa phone number</Label>
                <div className="relative">
                  <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="phone" type="tel" inputMode="tel" placeholder="0712 345 678" className="pl-9"
                    value={phone} onChange={e => setPhone(e.target.value)} required />
                </div>
                <p className="text-xs text-muted-foreground">Safaricom number registered for M-Pesa.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="reference">Reference (optional)</Label>
                <Input id="reference" maxLength={64} placeholder="e.g. bank slip number"
                  value={reference} onChange={e => setReference(e.target.value)} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" variant="gold" disabled={submitting || !walletId}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {method === "mpesa" ? "Review" : "Deposit"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
