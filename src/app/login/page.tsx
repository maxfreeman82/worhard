"use client";

import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { destination, signInWithPassword, signUpWithPassword, useSession } from "@/lib/data";

// S01. Connexion par e-mail et mot de passe. L'étudiant crée son compte ici ; il accède à l'espace
// quand l'enseignant a validé sa demande (page Membres). Aucun e-mail n'est envoyé.
type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = mode === "signin" ? "Connexion" : "Créer un compte";
  }, [mode]);

  // Next garde les pages visitées montées en arrière-plan : on ne redirige que si cette page est celle affichée.
  useEffect(() => {
    if (window.location.pathname !== "/login") return;
    if (session?.profile) router.replace(destination(session));
  }, [session, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = mode === "signin" ? await signInWithPassword(email, password) : await signUpWithPassword({ name, email, password });
      // L'effet ci-dessus a pu rediriger pendant l'attente : on ne navigue que si l'on est toujours ici.
      if (window.location.pathname === "/login") router.replace(destination(s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setBusy(false);
    }
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setPassword("");
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[340px]">
        <div aria-hidden className="mb-6 flex size-10 items-center justify-center rounded-md bg-fg text-lg font-bold text-bg">
          E
        </div>
        <h1 className="text-h2 font-semibold">{mode === "signin" ? "Pensez, notez, partagez." : "Créer votre compte"}</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "signin"
            ? "Connectez-vous à l'espace de votre classe."
            : "Votre enseignant validera votre accès. Vous pourrez ensuite vous connecter."}
        </p>

        <div role="group" aria-label="Connexion ou inscription" className="mt-6 grid grid-cols-2 gap-1 rounded-md bg-surface p-1">
          {(
            [
              ["signin", "Se connecter"],
              ["signup", "Créer un compte"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchTo(m)}
              className={clsx("h-8 rounded-sm text-sm", mode === m ? "bg-bg font-medium text-fg shadow-sm" : "text-muted hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3" noValidate>
          {mode === "signup" && (
            <Input label="Prénom et nom" autoComplete="name" autoFocus placeholder="Awa Diop" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <Input
            label="Adresse e-mail"
            type="email"
            autoComplete="email"
            autoFocus={mode === "signin"}
            placeholder="prenom.nom@ecole.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Mot de passe"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={mode === "signup" ? "8 caractères au minimum." : "Oublié ? Demandez un mot de passe provisoire à votre enseignant."}
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!email.trim() || !password || (mode === "signup" && !name.trim())}>
            {mode === "signin" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>
      </div>
    </main>
  );
}
