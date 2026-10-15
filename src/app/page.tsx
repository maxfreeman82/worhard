"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/data";

// La session vit dans le navigateur : la redirection se fait côté client.
export default function Root() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session === undefined) return;
    router.replace(!session.profile ? "/login" : session.workspace ? "/home" : "/onboarding");
  }, [session, router]);
  return null;
}
