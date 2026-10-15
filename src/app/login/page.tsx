"use client";

import { ArrowLeft, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { sendLoginCode, useSession, verifyLoginCode } from "@/lib/data";

// S01. En mode local, aucun e-mail n'est envoyé : n'importe quel code à 6 chiffres est accepté.
export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Connexion";
  }, []);

  useEffect(() => {
    if (session?.profile) router.replace(session.workspace ? "/home" : "/onboarding");
  }, [session, router]);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendLoginCode(email.trim().toLowerCase());
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await verifyLoginCode(email.trim().toLowerCase(), code.trim());
      router.replace(res.needsWorkspace ? "/onboarding" : "/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code incorrect.");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[340px]">
        <div aria-hidden className="mb-6 flex size-10 items-center justify-center rounded-md bg-fg text-lg font-bold text-bg">
          E
        </div>
        <h1 className="text-h2 font-semibold">{step === "email" ? "Pensez, notez, partagez." : "Vérifiez vos e-mails"}</h1>
        <p className="mt-1 text-sm text-muted">
          {step === "email" ? "Connectez-vous à votre espace de travail." : `Saisissez le code envoyé à ${email}.`}
        </p>

        {step === "email" ? (
          <form onSubmit={submitEmail} className="mt-6 flex flex-col gap-3" noValidate>
            <Input
              label="Adresse e-mail"
              type="email"
              autoComplete="email"
              autoFocus
              required
              placeholder="nom@entreprise.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error ?? undefined}
            />
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!email.trim()} icon={<Mail className="size-4" />}>
              Continuer avec l&apos;e-mail
            </Button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="mt-6 flex flex-col gap-3" noValidate>
            <Input
              label="Code de connexion"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              error={error ?? undefined}
              hint="Version locale : aucun e-mail n'est envoyé, tout code à 6 chiffres fonctionne."
            />
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={code.length !== 6}>
              Se connecter
            </Button>
            <Button
              variant="ghost"
              icon={<ArrowLeft className="size-4" />}
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              Changer d&apos;adresse
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
