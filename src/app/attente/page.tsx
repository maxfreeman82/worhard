"use client";

import { Hourglass } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { destination, recheckAccess, signOut, useSession } from "@/lib/data";

// Compte créé, en attente de validation par l'enseignant. La page vérifie d'elle-même toutes les 10 s.
const CHECK_MS = 10_000;

export default function WaitingPage() {
  const router = useRouter();
  const session = useSession();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    document.title = "En attente de validation";
  }, []);

  // Validé (ou déconnecté) : on part vers la bonne page.
  useEffect(() => {
    if (session === undefined || window.location.pathname !== "/attente") return;
    const to = destination(session);
    if (to !== "/attente") router.replace(to);
  }, [session, router]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void recheckAccess();
    }, CHECK_MS);
    return () => clearInterval(id);
  }, []);

  const name = session?.profile?.name?.split(" ")[0];

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[380px] flex-col items-start gap-4">
        <span aria-hidden className="flex size-10 items-center justify-center rounded-md bg-surface text-muted">
          <Hourglass className="size-5" />
        </span>
        <h1 className="text-h2 font-semibold">{name ? `Merci, ${name} !` : "Merci !"} Votre demande est envoyée.</h1>
        <p className="text-sm text-muted">
          Votre enseignant doit valider votre accès à l&apos;espace de la classe. Cette page s&apos;ouvrira d&apos;elle-même dès que c&apos;est
          fait ; vous pouvez aussi revenir plus tard et vous connecter avec {session?.profile?.email ?? "votre adresse"} et votre mot de passe.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={checking}
            onClick={async () => {
              setChecking(true);
              await recheckAccess();
              setChecking(false);
            }}
          >
            Vérifier maintenant
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
          >
            Se déconnecter
          </Button>
        </div>
      </div>
    </main>
  );
}
