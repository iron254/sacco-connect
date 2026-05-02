import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type Wallet = { id: string; wallet_type: string; currency: string };

const schema = z.object({
  wallet_id: z.string().uuid("Select a wallet"),
  amount: z.number().positive("Amount must be greater than 0").max(10_000_000, "Amount too large"),
  method: z.enum(["mpesa", "bank_transfer", "card", "cash"]),
  reference: z.string().trim().max(64).optional(),
});

interface Props {
  wallets: Wallet[];
  defaultWalletId?: string;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

const labels: Record<string, string> = {
  savings: "Main Savings",
  shares: "Share Capital",
  benevolent: "Benevolent Fund",
};

export function DepositDialog({ wallets, defaultWalletId, trigger, onSuccess }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [walletId, setWalletId] = useState(defaultWalletId ?? wallets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"mpesa" | "bank_transfer" | "card" | "cash">("mpesa");
  const [reference, setReference] = useState("");

  const reset = () => {
    setAmount("");
    setReference("");
    setMethod("mpesa");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsed = schema.safeParse({
      wallet_id: walletId,
      amount: Number(amount),
      method,
      reference: reference || undefined,
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      wallet_id: parsed.data.wallet_id,
      tx_type: "deposit",
      amount: parsed.data.amount,
      currency: "KES",
      status: "completed",
      method: parsed.data.method,
      reference: parsed.data.reference,
      description: `Deposit via ${parsed.data.method}`,
    });
    setSubmitting(false);

    if (error) {
      toast({ title: "Deposit failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deposit successful", description: `KES ${parsed.data.amount.toLocaleString()} added to your wallet.` });
    reset();
    setOpen(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Make a deposit</DialogTitle>
          <DialogDescription>Funds are credited to your selected wallet immediately.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="space-y-2">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input id="reference" maxLength={64} placeholder="e.g. M-Pesa code"
              value={reference} onChange={e => setReference(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" variant="gold" disabled={submitting || !walletId}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Deposit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
