import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, Upload, Trash2, Building2, User as UserIcon, Sparkles, ShieldCheck } from "lucide-react";

const personalSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  national_id: z.string().trim().min(4).max(40),
  date_of_birth: z.string().min(1),
  address: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
});

const nokSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  national_id: z.string().trim().max(40).optional().or(z.literal("")),
  allocation_percentage: z.number().min(1).max(100),
});

const tiers = [
  { id: "individual", label: "Individual", desc: "For working adults building personal savings.", icon: UserIcon },
  { id: "youth", label: "Youth", desc: "Ages 18–25. Lower minimums, financial education.", icon: Sparkles },
  { id: "corporate", label: "Corporate", desc: "Registered businesses and chamas.", icon: Building2 },
] as const;

const docTypes = [
  { id: "national_id_front", label: "National ID — front" },
  { id: "national_id_back", label: "National ID — back" },
  { id: "selfie", label: "Selfie holding ID" },
  { id: "signature", label: "Signature specimen" },
] as const;

type Step = 0 | 1 | 2 | 3 | 4;

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState<"individual" | "youth" | "corporate">("individual");
  const [personal, setPersonal] = useState({ full_name: "", phone: "", national_id: "", date_of_birth: "", address: "", city: "", country: "Kenya" });
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>({});
  const [nok, setNok] = useState({ full_name: "", relationship: "", phone: "", email: "", national_id: "", allocation_percentage: 100 });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setTier((data.membership_tier as any) || "individual");
        setPersonal({
          full_name: data.full_name || "",
          phone: data.phone || "",
          national_id: data.national_id || "",
          date_of_birth: data.date_of_birth || "",
          address: data.address || "",
          city: data.city || "",
          country: data.country || "Kenya",
        });
      }
    });
    supabase.from("kyc_documents").select("doc_type, storage_path").eq("user_id", user.id).then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach((d: any) => { map[d.doc_type] = d.storage_path; });
      setUploadedDocs(map);
    });
  }, [user]);

  const steps = ["Membership tier", "Personal details", "KYC documents", "Next of kin", "Review"];

  const saveTier = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").update({ membership_tier: tier }).eq("id", user.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    setStep(1);
  };

  const savePersonal = async () => {
    if (!user) return;
    const parsed = personalSchema.safeParse(personal);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setLoading(true);
    const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    setStep(2);
  };

  const handleUpload = async (docType: string, file: File) => {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Max file size is 10MB");
    setLoading(true);
    const path = `${user.id}/${docType}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("member-documents").upload(path, file, { upsert: true });
    if (upErr) { setLoading(false); return toast.error(upErr.message); }
    // remove old record of same type
    await supabase.from("kyc_documents").delete().eq("user_id", user.id).eq("doc_type", docType as any);
    const { error: insErr } = await supabase.from("kyc_documents").insert({ user_id: user.id, doc_type: docType as any, storage_path: path });
    setLoading(false);
    if (insErr) return toast.error(insErr.message);
    setUploadedDocs({ ...uploadedDocs, [docType]: path });
    toast.success("Uploaded");
  };

  const submitKyc = async () => {
    if (!user) return;
    const required = docTypes.filter(d => d.id !== "signature");
    const missing = required.filter(d => !uploadedDocs[d.id]);
    if (missing.length) return toast.error(`Please upload: ${missing.map(m => m.label).join(", ")}`);
    setLoading(true);
    await supabase.from("profiles").update({ kyc_status: "submitted" }).eq("id", user.id);
    setLoading(false);
    setStep(3);
  };

  const saveNok = async () => {
    if (!user) return;
    const parsed = nokSchema.safeParse(nok);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setLoading(true);
    const { error } = await supabase.from("next_of_kin").insert([{ user_id: user.id, ...parsed.data }]);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Beneficiary added");
    setStep(4);
  };

  const finish = async () => {
    if (!user) return;
    setLoading(true);
    await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    setLoading(false);
    toast.success("Welcome to Umoja SACCO!");
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="container flex h-20 items-center justify-between">
          <Logo />
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>Save & exit</Button>
        </div>
      </header>

      <div className="container max-w-3xl py-10">
        {/* Stepper */}
        <ol className="mb-10 flex items-center gap-2 overflow-x-auto">
          {steps.map((label, i) => (
            <li key={label} className="flex flex-1 min-w-[120px] items-center gap-2">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`hidden text-sm sm:inline ${i === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {i < steps.length - 1 && <div className={`h-px flex-1 ${i < step ? "bg-success" : "bg-border"}`} />}
            </li>
          ))}
        </ol>

        <Card className="p-8 shadow-elevated">
          {step === 0 && (
            <>
              <h2 className="font-display text-2xl font-semibold">Choose your membership tier</h2>
              <p className="mt-1 text-sm text-muted-foreground">You can upgrade later as your needs change.</p>
              <RadioGroup value={tier} onValueChange={(v) => setTier(v as any)} className="mt-6 grid gap-3">
                {tiers.map(t => (
                  <Label key={t.id} htmlFor={t.id} className={`flex cursor-pointer items-start gap-4 rounded-lg border p-5 transition-base ${tier === t.id ? "border-primary bg-accent-soft/40 shadow-card" : "border-border hover:border-primary/40"}`}>
                    <RadioGroupItem value={t.id} id={t.id} className="mt-1" />
                    <div className={`flex h-10 w-10 items-center justify-center rounded-md ${tier === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <t.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-display text-base font-semibold">{t.label}</div>
                      <div className="text-sm text-muted-foreground">{t.desc}</div>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
              <div className="mt-8 flex justify-end">
                <Button onClick={saveTier} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Continue <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="font-display text-2xl font-semibold">Personal details</h2>
              <p className="mt-1 text-sm text-muted-foreground">Used for your member record. Kept strictly confidential.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Full name</Label><Input value={personal.full_name} onChange={e => setPersonal({ ...personal, full_name: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={personal.phone} onChange={e => setPersonal({ ...personal, phone: e.target.value })} placeholder="+254 7…" /></div>
                <div><Label>National ID / Passport</Label><Input value={personal.national_id} onChange={e => setPersonal({ ...personal, national_id: e.target.value })} /></div>
                <div><Label>Date of birth</Label><Input type="date" value={personal.date_of_birth} onChange={e => setPersonal({ ...personal, date_of_birth: e.target.value })} /></div>
                <div><Label>City</Label><Input value={personal.city} onChange={e => setPersonal({ ...personal, city: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Address</Label><Textarea value={personal.address} onChange={e => setPersonal({ ...personal, address: e.target.value })} rows={2} /></div>
                <div><Label>Country</Label><Input value={personal.country} onChange={e => setPersonal({ ...personal, country: e.target.value })} /></div>
              </div>
              <div className="mt-8 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                <Button onClick={savePersonal} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Continue <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-2xl font-semibold">Upload KYC documents</h2>
              <p className="mt-1 text-sm text-muted-foreground">Clear photos or scans, max 10MB each. Required for SASRA compliance.</p>
              <div className="mt-6 space-y-3">
                {docTypes.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-md ${uploadedDocs[doc.id] ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                        {uploadedDocs[doc.id] ? <Check className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="font-medium">{doc.label}</div>
                        <div className="text-xs text-muted-foreground">{uploadedDocs[doc.id] ? "Uploaded" : "Not uploaded"}</div>
                      </div>
                    </div>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(doc.id, f); }} />
                      <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                        {uploadedDocs[doc.id] ? "Replace" : "Upload"}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={submitKyc} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Submit & continue <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-2xl font-semibold">Add a next of kin</h2>
              <p className="mt-1 text-sm text-muted-foreground">Required by SACCO regulations. You can add more beneficiaries later.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Full name</Label><Input value={nok.full_name} onChange={e => setNok({ ...nok, full_name: e.target.value })} /></div>
                <div><Label>Relationship</Label><Input value={nok.relationship} onChange={e => setNok({ ...nok, relationship: e.target.value })} placeholder="Spouse, sibling…" /></div>
                <div><Label>Phone</Label><Input value={nok.phone} onChange={e => setNok({ ...nok, phone: e.target.value })} /></div>
                <div><Label>Email (optional)</Label><Input type="email" value={nok.email} onChange={e => setNok({ ...nok, email: e.target.value })} /></div>
                <div><Label>National ID (optional)</Label><Input value={nok.national_id} onChange={e => setNok({ ...nok, national_id: e.target.value })} /></div>
                <div className="sm:col-span-2">
                  <Label>Allocation %</Label>
                  <Input type="number" min={1} max={100} value={nok.allocation_percentage} onChange={e => setNok({ ...nok, allocation_percentage: Number(e.target.value) })} />
                  <p className="mt-1 text-xs text-muted-foreground">Percentage of your savings/shares this beneficiary should receive.</p>
                </div>
              </div>
              <div className="mt-8 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={saveNok} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Continue <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h2 className="font-display text-2xl font-semibold">All set, {personal.full_name?.split(" ")[0] || "member"}!</h2>
              <p className="mt-2 text-sm text-muted-foreground">Your KYC is now under review. Most applications are verified within one business day. You can already explore your dashboard.</p>
              <div className="mt-6 grid gap-3 rounded-lg border border-border bg-muted/40 p-5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Membership tier</span><span className="font-medium capitalize">{tier}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">National ID</span><span className="font-medium">{personal.national_id}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Documents uploaded</span><span className="font-medium">{Object.keys(uploadedDocs).length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Next of kin</span><span className="font-medium">{nok.full_name}</span></div>
              </div>
              <div className="mt-8 flex justify-end">
                <Button variant="gold" size="lg" onClick={finish} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Go to dashboard</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
