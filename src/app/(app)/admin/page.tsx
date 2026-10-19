"use client";

import { clsx } from "clsx";
import { Copy, KeyRound, Lock, UserPlus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { BareTopBar } from "@/components/shell/bare-top-bar";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, Skeleton, useToast } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import {
  addMember,
  approveRequest,
  listMembers,
  refuseRequest,
  resetMemberPassword,
  removeMember,
  setMemberRole,
  useIsWorkspaceAdmin,
  useSession,
  type ClassInvite,
  type ClassMember,
  type ClassRequest,
  type ClassRole,
} from "@/lib/data";

// Admin de l'espace de classe : les étudiants créent leur compte, l'enseignant valide leur demande et choisit leur rôle.
const ROLES: { value: ClassRole; label: string; hint: string }[] = [
  { value: "viewer", label: "Lecture seule", hint: "Lit les pages de la classe, écrit seulement dans ses pages privées." },
  { value: "editor", label: "Édition", hint: "Peut aussi créer et modifier les pages de la classe." },
  { value: "admin", label: "Admin", hint: "Accès complet, et peut gérer les membres." },
];
const roleLabel = (r: ClassRole | "owner") => (r === "owner" ? "Propriétaire" : ROLES.find((x) => x.value === r)!.label);

type Data = { members: ClassMember[]; invites: ClassInvite[]; requests: ClassRequest[] };

export default function AdminPage() {
  const isAdmin = useIsWorkspaceAdmin();
  useEffect(() => {
    document.title = "Membres";
  }, []);
  return (
    <>
      <BareTopBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isAdmin === undefined ? null : isAdmin ? (
          <Members />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={<Lock className="size-10" />} title="Réservé aux administrateurs" body="Seuls le propriétaire et les admins de l'espace gèrent les membres." />
          </div>
        )}
      </div>
    </>
  );
}

function Members() {
  const session = useSession();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = session?.me?.role === "owner";

  const reload = useCallback(async () => {
    try {
      setData(await listMembers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, []);
  // Nouvelle demande d'accès (le compteur de la session change en quelques secondes) : la liste est rechargée.
  const pendingRequests = session?.account?.pendingRequests ?? 0;
  useEffect(() => {
    let alive = true;
    listMembers()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Chargement impossible."));
    return () => {
      alive = false;
    };
  }, [pendingRequests]);
  const [revealed, setRevealed] = useState<{ name: string; password: string } | null>(null);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast({ title: done, tone: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Opération impossible.", tone: "error" });
    }
    await reload();
  };

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-6 pb-24 pt-16 max-md:pt-8">
      <header>
        <h1 className="text-h1 font-bold">Membres</h1>
        <p className="mt-1 text-sm text-muted">
          Vos étudiants créent leur compte (e-mail et mot de passe) sur la page de connexion. Leur demande apparaît ici : validez-la en
          choisissant leur rôle pour qu&apos;ils accèdent à {session?.workspace?.name ?? "l'espace"}.
        </p>
      </header>

      {revealed && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-accent bg-accent-soft p-4">
          <p className="text-sm">
            Mot de passe provisoire de <strong>{revealed.name}</strong> : transmettez-le-lui. Il pourra le changer dans ses réglages. Il ne sera plus
            affiché ensuite.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-sm bg-bg px-2 py-1 font-mono text-base tracking-wider" data-temp-password>
              {revealed.password}
            </code>
            <Button size="sm" icon={<Copy className="size-4" />} onClick={() => void navigator.clipboard?.writeText(revealed.password)}>
              Copier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
              Fermer
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : !data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <section aria-labelledby="requests" className="flex flex-col gap-2">
            <h2 id="requests" className="text-sm font-semibold">
              Demandes d&apos;accès <span className="font-normal text-muted">({data.requests.length})</span>
            </h2>
            {data.requests.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted">
                Aucune demande pour l&apos;instant. Elles apparaissent ici dès qu&apos;un étudiant crée son compte.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {data.requests.map((q) => (
                  <RequestRow
                    key={q.id}
                    request={q}
                    canAddAdmin={isOwner}
                    onApprove={(role) => act(() => approveRequest(q.id, role), `${q.name || q.email} a maintenant accès`)}
                    onRefuse={() => act(() => refuseRequest(q.id), "Demande refusée")}
                  />
                ))}
              </ul>
            )}
          </section>
          {data.invites.length > 0 && (
            <section aria-labelledby="pending" className="flex flex-col gap-2">
              <h2 id="pending" className="text-sm font-semibold">
                Adresses pré-autorisées <span className="font-normal text-muted">({data.invites.length})</span>
              </h2>
              <ul className="divide-y divide-border rounded-md border border-border">
                {data.invites.map((i) => (
                  <Row
                    key={i.id}
                    name={i.name}
                    email={i.email}
                    role={i.role}
                    canChange={i.role !== "admin" || isOwner}
                    canAddAdmin={isOwner}
                    onRole={(r) => act(() => setMemberRole({ inviteId: i.id }, r), "Rôle modifié")}
                    removeLabel="Annuler"
                    onRemove={() => act(() => removeMember({ inviteId: i.id }), "Pré-autorisation annulée")}
                  />
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="members" className="flex flex-col gap-2">
            <h2 id="members" className="text-sm font-semibold">
              Dans l&apos;espace <span className="font-normal text-muted">({data.members.length})</span>
            </h2>
            <ul className="divide-y divide-border rounded-md border border-border">
              {data.members.map((m) => (
                <Row
                  key={m.id}
                  name={m.name}
                  email={m.email}
                  role={m.role}
                  you={m.you}
                  canChange={m.role !== "owner" && !m.you && (m.role !== "admin" || isOwner)}
                  canAddAdmin={isOwner}
                  onRole={(r) => act(() => setMemberRole({ memberId: m.id }, r), "Rôle modifié")}
                  removeLabel="Retirer"
                  confirmText="Cette personne ne pourra plus se connecter. Ses pages privées sont conservées si vous la rajoutez."
                  onRemove={() => act(() => removeMember({ memberId: m.id }), "Membre retiré")}
                  onResetPassword={async () => {
                    try {
                      const { password } = await resetMemberPassword(m.id);
                      setRevealed({ name: m.name || m.email, password });
                    } catch (e) {
                      toast({ title: e instanceof Error ? e.message : "Opération impossible.", tone: "error" });
                    }
                  }}
                />
              ))}
            </ul>
          </section>
          <AddForm canAddAdmin={isOwner} onAdded={reload} />
        </>
      )}
    </div>
  );
}

function RoleSelect({ value, onChange, canAddAdmin, label, disabled }: { value: ClassRole; onChange: (r: ClassRole) => void; canAddAdmin: boolean; label: string; disabled?: boolean }) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ClassRole)}
      className="h-8 rounded-sm border border-border-input bg-bg px-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
    >
      {ROLES.filter((r) => r.value !== "admin" || canAddAdmin || value === "admin").map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

function AddForm({ canAddAdmin, onAdded }: { canAddAdmin: boolean; onAdded: () => Promise<void> }) {
  const toast = useToast();
  const hintId = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ClassRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Adresse e-mail invalide.");
    setBusy(true);
    setError(null);
    try {
      await addMember({ email: email.trim(), name: name.trim(), role });
      toast({ title: `${name.trim() || email.trim()} sera validé à son inscription`, tone: "success" });
      setEmail("");
      setName("");
      await onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout impossible.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-border p-4" aria-labelledby="add-title">
      <h2 id="add-title" className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus aria-hidden className="size-4 text-muted" />
        Pré-autoriser une adresse
      </h2>
      <p className="-mt-1 text-xs text-muted">
        Facultatif : l&apos;étudiant qui crée son compte avec cette adresse est validé tout de suite, avec ce rôle. Une personne retirée peut
        être rajoutée ici.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Adresse e-mail" type="email" autoComplete="off" placeholder="prenom.nom@ecole.fr" value={email} onChange={(e) => setEmail(e.target.value)} error={error ?? undefined} />
        <Input label="Prénom et nom (facultatif)" autoComplete="off" placeholder="Awa Diop" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Rôle</span>
          <RoleSelect label="Rôle" value={role} onChange={setRole} canAddAdmin={canAddAdmin} />
        </div>
        <p id={hintId} className="min-w-0 flex-1 pb-1.5 text-xs text-muted">
          {ROLES.find((r) => r.value === role)!.hint}
        </p>
        <Button type="submit" variant="primary" loading={busy} aria-describedby={hintId}>
          Ajouter
        </Button>
      </div>
    </form>
  );
}

function Row({
  name,
  email,
  role,
  you,
  canChange,
  canAddAdmin,
  onRole,
  removeLabel,
  confirmText,
  onRemove,
  onResetPassword,
}: {
  name: string;
  email: string;
  role: ClassRole | "owner";
  you?: boolean;
  canChange: boolean;
  canAddAdmin: boolean;
  onRole: (r: ClassRole) => void;
  removeLabel: string;
  confirmText?: string;
  onRemove: () => void;
  onResetPassword?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const display = name || email;
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={display} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {display}
            {you && <span className="ml-1.5 font-normal text-muted">(vous)</span>}
          </p>
          {name && <p className="truncate text-xs text-muted">{email}</p>}
        </div>
        {canChange && role !== "owner" ? (
          <RoleSelect label={`Rôle de ${display}`} value={role} onChange={onRole} canAddAdmin={canAddAdmin} />
        ) : (
          <span className={clsx("px-2 text-sm", role === "owner" ? "font-medium" : "text-muted")}>{roleLabel(role)}</span>
        )}
        {canChange && !confirming && onResetPassword && (
          <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} onClick={onResetPassword} aria-label={`Nouveau mot de passe pour ${display}`}>
            <span className="max-sm:hidden">Nouveau mot de passe</span>
          </Button>
        )}
        {canChange && !confirming && (
          <Button size="sm" variant="ghost" onClick={() => (confirmText ? setConfirming(true) : onRemove())}>
            {removeLabel}
          </Button>
        )}
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center gap-2 pl-10">
          <span className="text-sm text-danger">{confirmText}</span>
          <Button size="sm" variant="danger" onClick={onRemove}>
            Retirer {display}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
      )}
    </li>
  );
}


function RequestRow({
  request,
  canAddAdmin,
  onApprove,
  onRefuse,
}: {
  request: ClassRequest;
  canAddAdmin: boolean;
  onApprove: (role: ClassRole) => void;
  onRefuse: () => void;
}) {
  const [role, setRole] = useState<ClassRole>("viewer");
  const display = request.name || request.email;
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <Avatar name={display} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{display}</p>
        <p className="truncate text-xs text-muted">
          {request.email} · inscrit le {new Date(request.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </p>
      </div>
      <RoleSelect label={`Rôle pour ${display}`} value={role} onChange={setRole} canAddAdmin={canAddAdmin} />
      <Button size="sm" variant="primary" onClick={() => onApprove(role)}>
        Valider
      </Button>
      <Button size="sm" variant="ghost" onClick={onRefuse} aria-label={`Refuser la demande de ${display}`}>
        Refuser
      </Button>
    </li>
  );
}
