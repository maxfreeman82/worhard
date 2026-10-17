"use client";

import { Clock, FileText, LayoutTemplate, Plus, Search, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { Kbd, Skeleton } from "@/components/ui/display";
import { BareTopBar } from "@/components/shell/bare-top-bar";
import { useShell } from "@/components/shell/shell-context";
import { usePageActions } from "@/components/shell/use-page-actions";
import { createDatabase, useRecent, useSession } from "@/lib/data";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
}

export default function HomePage() {
  const session = useSession();
  const recent = useRecent(8);
  const shell = useShell();
  const actions = usePageActions();
  const router = useRouter();
  const name = session?.profile?.name?.split(" ")[0];

  useEffect(() => {
    document.title = "Accueil";
  }, []);

  return (
    <>
      <BareTopBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-6 pb-24 pt-10 sm:px-12">
          <h1 className="text-center text-h1 font-semibold">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>

          <section aria-labelledby="recent" className="mt-10">
            <h2 id="recent" className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Clock aria-hidden className="size-3.5" />
              Consultées récemment
            </h2>
            {recent === undefined ? (
              <div className="flex gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-36" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
                Les pages que vous ouvrez apparaîtront ici.
              </p>
            ) : (
              <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                {recent.map((p) => (
                  <li key={p.id} className="shrink-0 snap-start">
                    <Link
                      href={`/p/${p.id}`}
                      className="flex h-28 w-36 flex-col justify-between overflow-hidden rounded-lg bg-bg p-3 shadow-card hover:bg-surface"
                    >
                      <span aria-hidden className="text-h2 leading-none">
                        {p.icon ?? <FileText className="size-6 text-muted" />}
                      </span>
                      <span className="line-clamp-2 text-sm font-medium">{p.title || "Sans titre"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="start" className="mt-10">
            <h2 id="start" className="mb-3 text-xs font-medium text-muted">
              Pour aller plus vite
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <QuickAction icon={<Plus className="size-5" />} title="Nouvelle page" body="Une page vide dans la section Privé." onClick={() => actions.create(null, "private")} />
              <QuickAction
                icon={<Table2 className="size-5" />}
                title="Nouvelle base de données"
                body="Tableau, Kanban, calendrier… sur les mêmes pages."
                onClick={async () => {
                  try {
                    const { page } = await createDatabase({ parentId: null, section: "private" });
                    router.push(`/p/${page.id}?new=1`);
                  } catch (e) {
                    actions.fail(e);
                  }
                }}
              />
              <QuickAction icon={<LayoutTemplate className="size-5" />} title="Partir d'un modèle" body="Compte rendu, journal, fiche projet…" onClick={() => shell.openModal("templates")} />
              <QuickAction
                icon={<Search className="size-5" />}
                title="Rechercher"
                body={
                  <>
                    Titres et contenu des pages. <Kbd>Ctrl K</Kbd>
                  </>
                }
                onClick={() => shell.openModal("search")}
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function QuickAction({ icon, title, body, onClick }: { icon: React.ReactNode; title: string; body: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col gap-2 rounded-lg border border-border p-4 text-left hover:bg-surface">
      <span aria-hidden className="text-muted">
        {icon}
      </span>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted">{body}</span>
    </button>
  );
}
