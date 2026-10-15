import Link from "next/link";

// Remplacée par l'app (connexion → espace de travail) dans /replica-build.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-[708px] flex-col justify-center gap-3 px-6">
      <h1 className="text-title font-bold">Espace de travail</h1>
      <p className="text-muted">L&apos;app arrive. En attendant, le système de design :</p>
      <Link href="/design" className="text-accent underline underline-offset-2">
        Voir les composants
      </Link>
    </main>
  );
}
