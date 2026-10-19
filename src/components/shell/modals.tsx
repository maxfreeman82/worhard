"use client";

import { clsx } from "clsx";
import { CornerDownLeft, FileText, RotateCcw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, useToast } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { Modal, ModalContent } from "@/components/ui/overlay";
import {
  deleteAccount,
  deleteForever,
  movePage,
  resetEverything,
  setTrash,
  updateProfile,
  updateWorkspace,
  useChildren,
  usePage,
  useRecent,
  useSearch,
  useSession,
  useTrash,
  type PageSummary,
  type Section,
  type Theme,
} from "@/lib/data";
import { TEMPLATES } from "./templates";
import { usePageActions } from "./use-page-actions";

function PageIcon({ icon }: { icon: string | null }) {
  return (
    <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-muted">
      {icon ? <span className="text-base leading-none">{icon}</span> : <FileText className="size-4" />}
    </span>
  );
}

function relative(iso: string) {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 60) return "à l'instant";
  if (d < 3600) return `il y a ${Math.floor(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* ------------------------------------------------------------- S09 Recherche */

export function SearchModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      {open && (
        <ModalContent title="Rechercher" hideTitle size="md">
          <SearchBody onDone={() => onOpenChange(false)} />
        </ModalContent>
      )}
    </Modal>
  );
}

function SearchBody({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const hits = useSearch(q);
  const recent = useRecent(8);
  const router = useRouter();
  const listId = useId();

  const items = useMemo(
    () =>
      q.trim()
        ? (hits ?? []).map((h) => ({ page: h.page, sub: h.path.map((p) => p.title || "Sans titre").join(" / "), snippet: h.snippet }))
        : (recent ?? []).map((p) => ({ page: p, sub: relative(p.updatedAt), snippet: null as string | null })),
    [q, hits, recent],
  );

  const go = (p: PageSummary) => {
    router.push(`/p/${p.id}`);
    onDone();
  };

  return (
    <div className="-mx-5 -mb-5 -mt-3">
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search aria-hidden className="size-4 text-muted" />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          aria-label="Rechercher une page"
          placeholder="Rechercher une page…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              go(items[active].page);
            }
          }}
          className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-placeholder focus-visible:outline-none"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto p-1.5">
        {items.length > 0 && <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted">{q.trim() ? "Résultats" : "Récemment consultées"}</p>}
        <ul id={listId} role="listbox" aria-label="Pages">
          {items.map((it, i) => (
            <li
              key={it.page.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it.page)}
              className={clsx("flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5", i === active && "bg-surface-hover")}
            >
              <PageIcon icon={it.page.icon} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{it.page.title || "Sans titre"}</span>
                  {it.sub && <span className="truncate text-xs text-muted">{it.sub}</span>}
                </div>
                {it.snippet && <p className="truncate text-xs text-muted">{it.snippet}</p>}
              </div>
              {i === active && <CornerDownLeft aria-hidden className="mt-0.5 size-3.5 text-muted" />}
            </li>
          ))}
        </ul>
        {q.trim() && hits && hits.length === 0 && (
          <EmptyState icon={<Search className="size-6" />} title="Aucun résultat" body="Essayez d'autres mots, ou vérifiez la corbeille." />
        )}
        {!q.trim() && recent && recent.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted">Les pages que vous ouvrez apparaîtront ici.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- S14 Corbeille */

export function TrashModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      {open && (
        <ModalContent title="Corbeille" description="Les pages sont effacées définitivement après 30 jours." size="md">
          <TrashBody onDone={() => onOpenChange(false)} />
        </ModalContent>
      )}
    </Modal>
  );
}

function TrashBody({ onDone }: { onDone: () => void }) {
  const items = useTrash();
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const filtered = (items ?? []).filter((p) => (p.title || "Sans titre").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <Input aria-label="Filtrer la corbeille" placeholder="Filtrer par titre" value={q} onChange={(e) => setQ(e.target.value)} />
      {items && items.length === 0 ? (
        <EmptyState icon={<Trash2 className="size-8" />} title="La corbeille est vide" body="Les pages supprimées s'afficheront ici." />
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Aucune page ne correspond.</p>
      ) : (
        <ul className="-mx-2 flex max-h-[50vh] flex-col overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id} className="group flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-surface-hover">
              <PageIcon icon={p.icon} />
              <button
                type="button"
                onClick={() => {
                  router.push(`/p/${p.id}`);
                  onDone();
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm">{p.title || "Sans titre"}</span>
                <span className="block truncate text-xs text-muted">
                  {p.path ? `${p.path} · ` : ""}supprimée {p.trashedAt ? relative(p.trashedAt) : ""}
                </span>
              </button>
              {confirm === p.id ? (
                <span className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await deleteForever(p.id);
                      setConfirm(null);
                      toast({ title: "Page supprimée définitivement", tone: "info" });
                    }}
                  >
                    Confirmer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                    Annuler
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setTrash(p.id, false)}>
                    Restaurer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(p.id)} aria-label={`Supprimer définitivement ${p.title || "Sans titre"}`}>
                    <Trash2 aria-hidden className="size-4 text-danger" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- S15 Modèles */

export function TemplatesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const actions = usePageActions();
  const [selected, setSelected] = useState(0);
  const t = TEMPLATES[selected];
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      {open && (
        <ModalContent title="Modèles" description="Partir d'une structure prête à remplir." size="lg">
          <div className="flex flex-col gap-4 sm:flex-row">
            <ul className="flex shrink-0 flex-row gap-1 overflow-x-auto sm:w-52 sm:flex-col">
              {TEMPLATES.map((tpl, i) => (
                <li key={tpl.title} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-pressed={i === selected}
                    className={clsx("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-hover", i === selected && "bg-surface-hover font-medium")}
                  >
                    <span aria-hidden>{tpl.icon}</span>
                    {tpl.title}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-border p-4">
              <p className="text-h3 font-semibold">
                <span aria-hidden className="mr-2">
                  {t.icon}
                </span>
                {t.title}
              </p>
              <p className="text-sm text-muted">{t.description}</p>
              <ul className="list-disc pl-5 text-sm text-muted">
                {t.outline.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              <div className="mt-auto flex justify-end">
                <Button
                  variant="primary"
                  onClick={async () => {
                    await actions.create(null, "private", { title: t.title, icon: t.icon, content: t.content() });
                    onOpenChange(false);
                  }}
                >
                  Utiliser ce modèle
                </Button>
              </div>
            </div>
          </div>
        </ModalContent>
      )}
    </Modal>
  );
}

/* --------------------------------------------------------------- S30 Réglages */

export function SettingsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      {open && (
        <ModalContent title="Réglages" size="md">
          <SettingsBody />
        </ModalContent>
      )}
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-5 last:border-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function SettingsBody() {
  const session = useSession();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(session?.profile?.name ?? "");
  const [wsName, setWsName] = useState(session?.workspace?.name ?? "");
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const theme = session?.profile?.theme ?? "system";

  return (
    <div className="flex flex-col gap-5">
      <Group title="Mon compte">
        <Input label="E-mail" value={session?.profile?.email ?? ""} disabled readOnly />
        <Input
          label="Nom affiché"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== session?.profile?.name && updateProfile({ name: name.trim() })}
        />
      </Group>
      <Group title="Apparence">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Thème</legend>
          {(
            [
              ["system", "Comme le système"],
              ["light", "Clair"],
              ["dark", "Sombre"],
            ] as [Theme, string][]
          ).map(([v, label]) => (
            <label
              key={v}
              className={clsx(
                "flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                theme === v ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-hover",
              )}
            >
              <input type="radio" name="theme" value={v} checked={theme === v} onChange={() => updateProfile({ theme: v })} className="sr-only" />
              {label}
            </label>
          ))}
        </fieldset>
      </Group>
      <Group title="Espace de travail">
        <Input
          label="Nom de l'espace"
          value={wsName}
          onChange={(e) => setWsName(e.target.value)}
          onBlur={() => wsName.trim() && wsName !== session?.workspace?.name && updateWorkspace({ name: wsName.trim() })}
        />
      </Group>
      <Group title="Données">
        <p className="text-sm text-muted">
          Vos pages et vos fichiers sont enregistrés sur le serveur de l&apos;espace (base Neon). Oublier cet appareil ferme la session et vide son cache.
        </p>
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-danger">Les fichiers importés sur cet appareil seront effacés et vous serez déconnecté.</span>
            <Button
              variant="danger"
              onClick={async () => {
                await resetEverything();
                toast({ title: "Appareil oublié", tone: "info" });
                router.replace("/login");
              }}
            >
              Oublier cet appareil
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Annuler
            </Button>
          </div>
        ) : (
          <div>
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              Oublier cet appareil…
            </Button>
          </div>
        )}
      </Group>
      <Group title="Supprimer mon compte">
        <p className="text-sm text-muted">
          Supprime votre compte, votre profil et les espaces dont vous êtes le seul membre, avec toutes leurs pages et leurs fichiers.
          C&apos;est définitif.
        </p>
        {deleting ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await deleteAccount();
                router.replace("/login");
              } catch (err) {
                toast({ title: err instanceof Error ? err.message : "Suppression impossible.", tone: "error" });
                setBusy(false);
              }
            }}
          >
            <Input label="Tapez SUPPRIMER pour confirmer" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <div className="flex gap-2">
              <Button type="submit" variant="danger" loading={busy} disabled={typed !== "SUPPRIMER"}>
                Supprimer définitivement
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Supprimer mon compte…
            </Button>
          </div>
        )}
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------- Déplacer vers… */

export function MoveModal({ pageId, onOpenChange }: { pageId: string | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={!!pageId} onOpenChange={onOpenChange}>
      {pageId && (
        <ModalContent title="Déplacer vers…" description="Choisissez la nouvelle page parente." size="sm">
          <MoveBody pageId={pageId} onDone={() => onOpenChange(false)} />
        </ModalContent>
      )}
    </Modal>
  );
}

function MoveBody({ pageId, onDone }: { pageId: string; onDone: () => void }) {
  const page = usePage(pageId);
  const [q, setQ] = useState("");
  const hits = useSearch(q);
  const actions = usePageActions();
  const toast = useToast();

  const move = async (parentId: string | null, section: Section) => {
    try {
      await movePage(pageId, { parentId, section });
      toast({ title: "Page déplacée", tone: "success" });
      onDone();
    } catch (e) {
      actions.fail(e);
    }
  };

  const candidates = q.trim() ? (hits ?? []).map((h) => h.page).filter((p) => p.id !== pageId) : null;

  return (
    <div className="flex flex-col gap-3">
      <Input autoFocus aria-label="Chercher une page" placeholder="Chercher une page de destination" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="-mx-2 flex max-h-[45vh] flex-col overflow-y-auto">
        {candidates ? (
          candidates.length ? (
            candidates.map((p) => <MoveTarget key={p.id} page={p} onPick={() => move(p.id, p.section)} />)
          ) : (
            <p className="px-2 py-4 text-center text-sm text-muted">Aucune page ne correspond.</p>
          )
        ) : (
          <>
            <RootTarget label="Espace de travail (racine)" disabled={page?.parentId === null && page?.section === "workspace"} onPick={() => move(null, "workspace")} />
            <RootTarget label="Privé (racine)" disabled={page?.parentId === null && page?.section === "private"} onPick={() => move(null, "private")} />
            <TopLevel section="workspace" exclude={pageId} onPick={move} />
            <TopLevel section="private" exclude={pageId} onPick={move} />
          </>
        )}
      </ul>
    </div>
  );
}

function RootTarget({ label, onPick, disabled }: { label: string; onPick: () => void; disabled?: boolean }) {
  return (
    <li>
      <button type="button" disabled={disabled} onClick={onPick} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm font-medium hover:bg-surface-hover disabled:opacity-50">
        {label}
      </button>
    </li>
  );
}

function TopLevel({ section, exclude, onPick }: { section: Section; exclude: string; onPick: (id: string, s: Section) => void }) {
  const pages = useChildren(null, section);
  return (
    <>
      {(pages ?? [])
        .filter((p) => p.id !== exclude)
        .map((p) => (
          <MoveTarget key={p.id} page={p} onPick={() => onPick(p.id, section)} />
        ))}
    </>
  );
}

function MoveTarget({ page, onPick }: { page: PageSummary; onPick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPick} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-hover">
        <PageIcon icon={page.icon} />
        <span className="truncate">{page.title || "Sans titre"}</span>
      </button>
    </li>
  );
}
