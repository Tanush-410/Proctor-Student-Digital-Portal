import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "./AuthContext";
import { Button, Input, Label } from "../components/ui";
import { OtpInput } from "../components/OtpInput";
import { ApiError } from "../api/client";

export default function Login() {
  const { requestOtp, verifyOtp } = useAuth();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const expired = searchParams.get("expired") === "1";

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(email.trim().toLowerCase());
      setDevOtp(res.devOtp ?? null);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyOtp(email.trim().toLowerCase(), code.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[length:28px_28px] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] opacity-[0.15]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-900/40 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-bold text-white backdrop-blur-sm">PD</div>
          <span className="text-lg font-semibold text-white">Proctor Diary</span>
        </div>

        <div className="relative max-w-md">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Academic records, unified
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Every result, every claim,<br />one source of truth.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            Role-aware portals for Admins, Proctors, and Students — with an append-only results
            ledger, a precedence-resolved academic record, and server-enforced access control on
            every request.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-brand-200">
          <ShieldCheck className="h-4 w-4" />
          B.M.S. College of Engineering — Dept. of CSE
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-soft">PD</div>
            <h1 className="text-xl font-semibold text-slate-900">Proctor Diary</h1>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              {step === "email" ? "Sign in" : "Check your code"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {step === "email" ? "Use your college e-mail to continue." : `We've sent a code to ${email}.`}
            </p>
          </div>

          {expired && (
            <div className="animate-in mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-600/20">
              Your session expired. Please sign in again.
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleRequest} className="space-y-5">
              <div>
                <Label>College e-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="email"
                    required
                    autoFocus
                    placeholder="you@bmsce.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              {error && <p className="animate-in-fast text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" size="md" disabled={busy}>
                {busy ? "Sending..." : "Send code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              {devOtp && (
                <div className="animate-in flex items-start gap-2.5 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-inset ring-brand-600/20">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Dev mode — no mail service configured. Your code is{" "}
                    <span className="font-mono font-semibold tracking-wider">{devOtp}</span>.
                  </span>
                </div>
              )}
              <div>
                <Label>6-digit code</Label>
                <OtpInput value={code} onChange={setCode} />
              </div>
              {error && <p className="animate-in-fast text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" size="md" disabled={busy || code.length !== 6}>
                {busy ? "Verifying..." : "Verify & sign in"}
              </Button>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Use a different e-mail
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
