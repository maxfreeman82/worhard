"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { createWorkspace, useSession } from "@/lib/data";

// S02 : prénom puis nom de l'espace. L'espace est créé avec quelques pages de départ.
export default function OnboardingPage() {
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [wsName, setWsName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Bienvenue";
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session.profile) router.replace("/login");
    else if (session.workspace) router.replace("/home");
  }, [session, router]);

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createWorkspace({ userName: name, workspaceName: wsName || `Espace de ${name.split(" ")[0]}` });
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de créer l'espace.");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <p className="text-xs font-medium text-muted" aria-live="polite">
          Étape {step} sur 2
        </p>
        {step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) setStep(2);
            }}
            className="mt-2 flex flex-col gap-4"
          >
            <h1 className="text-h2 font-semibold">Comment vous appelle-t-on ?</h1>
            <Input label="Prénom et nom" autoFocus autoComplete="name" placeholder="Awa Diop" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="primary" size="lg" disabled={!name.trim()}>
              Continuer
            </Button>
          </form>
        ) : (
          <form onSubmit={finish} className="mt-2 flex flex-col gap-4">
            <h1 className="text-h2 font-semibold">Nommez votre espace de travail</h1>
            <p className="text-sm text-muted">Le nom de votre équipe ou de votre entreprise. Vous pourrez le changer plus tard.</p>
            <Input
              label="Nom de l'espace"
              autoFocus
              placeholder={`Espace de ${name.split(" ")[0]}`}
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              error={error ?? undefined}
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" onClick={() => setStep(1)}>
                Retour
              </Button>
              <Button type="submit" variant="primary" size="lg" loading={busy} className="flex-1">
                Créer l&apos;espace
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
