"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/data";

// Aiguillage selon la session (chargée par la couche de données) : connexion, onboarding ou accueil.
export default function Root() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session === undefined || window.location.pathname !== "/") return;
    router.replace(!session.profile ? "/login" : session.workspace ? "/home" : "/onboarding");
  }, [session, router]);
  return null;
}
