// Couche de données côté client : un cache de l'espace de travail, lu de façon synchrone par les écrans,
// chargé depuis le serveur (/api/bootstrap, Neon) et dont chaque modification est renvoyée par lots
// (/api/sync). Les règles d'accès sont appliquées par Postgres (RLS) : le serveur refuse ce qui n'est pas permis.
// Les fichiers importés restent pour l'instant dans IndexedDB (stockage serveur à brancher : Vercel Blob).

import { authClient } from "@/lib/auth-client";
import { seedPages } from "./seed";
import {
  DataError,
  type Database,
  type DateValue,
  type OptionColor,
  type Page,
  type PageContent,
  type PageMeta,
  type PageSummary,
  type Placement,
  type Profile,
  type Property,
  type PropertyConfig,
  type PropertyType,
  type PropValue,
  type SelectOption,
  type SaveResult,
  type SearchHit,
  type Section,
  type Theme,
  type View,
  type ViewConfig,
  type ViewType,
  type Workspace,
} from "./types";

const RECENT_MAX = 20;
/** Vérification des changements faits ailleurs (empreinte légère) et rechargement complet de secours. */
const CHANGES_MS = 5_000;
const REFRESH_MS = 60_000;
const FLUSH_DELAY_MS = 400;

/** Page telle que stockée : `position` ordonne les sœurs, `contentVersion` détecte les conflits d'édition. */
type Stored = Page & { position: number; contentVersion: number };

type State = {
  signedIn: boolean;
  profile: Profile | null;
  workspace: Workspace | null;
  members: { id: string; name: string; email: string }[];
  pages: Record<string, Stored>;
  favorites: string[];
  recent: string[];
  databases: Record<string, Database>;
  views: Record<string, View>;
};

const empty = (): State => ({
  signedIn: false,
  profile: null,
  workspace: null,
  members: [],
  pages: {},
  favorites: [],
  recent: [],
  databases: {},
  views: {},
});

/* ------------------------------------------------------- cache et serveur */

let state: State = empty();
let started = false;
/** Empreinte de l'espace connue du client (renvoyée par le serveur au chargement et après chaque envoi). */
let lastFingerprint = "";
let ready = false;
let version = 0;
const listeners = new Set<() => void>();

/** Événements de synchronisation pour l'interface (toasts). */
export type SyncEvent = { kind: "error" | "conflict"; message: string };
const syncListeners = new Set<(e: SyncEvent) => void>();
export function onSyncEvent(l: (e: SyncEvent) => void) {
  syncListeners.add(l);
  return () => {
    syncListeners.delete(l);
  };
}
const notify = (e: SyncEvent) => syncListeners.forEach((l) => l(e));

/** Dernier état connu du serveur : sert à calculer ce qu'il faut renvoyer. */
let synced = {
  pages: new Map<string, Stored>(),
  databases: new Map<string, string>(),
  views: new Map<string, string>(),
  favorites: "[]",
  profile: "",
  workspace: "",
};

const profileKey = (s: State) => (s.profile ? JSON.stringify({ name: s.profile.name, theme: s.profile.theme, recent: s.recent }) : "");
const workspaceKey = (s: State) => (s.workspace ? JSON.stringify({ name: s.workspace.name, icon: s.workspace.icon }) : "");

function snapshot() {
  synced = {
    pages: new Map(Object.values(state.pages).map((p) => [p.id, p])),
    databases: new Map(Object.values(state.databases).map((d) => [d.id, JSON.stringify(d)])),
    views: new Map(Object.values(state.views).map((v) => [v.id, JSON.stringify(v)])),
    favorites: JSON.stringify(state.favorites),
    profile: profileKey(state),
    workspace: workspaceKey(state),
  };
}

type BootstrapResponse = {
  profile: Profile;
  workspace: Workspace | null;
  members: State["members"];
  pages: Stored[];
  databases: Database[];
  views: View[];
  favorites: string[];
  recent: string[];
  fingerprint: string;
};

/**
 * Recharge tout depuis le serveur. Sans `force`, la réponse est ignorée si l'utilisateur a modifié quelque chose
 * pendant la requête (sinon elle effacerait des changements pas encore envoyés) : le prochain rafraîchissement s'en charge.
 */
async function refresh(force = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const startVersion = version;
  try {
    const res = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!force && ready && (version !== startVersion || timer || flushing)) return false;
    const b: BootstrapResponse | { signedIn: false } = res.ok ? await res.json() : null;
    if (res.status === 401 || (b && "signedIn" in b && b.signedIn === false)) {
      state = empty();
    } else if (res.ok && b && "profile" in b) {
      state = {
        signedIn: true,
        profile: b.profile,
        workspace: b.workspace,
        members: b.members,
        pages: Object.fromEntries(b.pages.map((p) => [p.id, p])),
        favorites: b.favorites,
        recent: b.recent,
        databases: Object.fromEntries(b.databases.map((d) => [d.id, d])),
        views: Object.fromEntries(b.views.map((v) => [v.id, v])),
      };
      lastFingerprint = b.fingerprint;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
    snapshot();
  } catch {
    if (!ready) state = empty();
    notify({ kind: "error", message: "Serveur injoignable : vos données n'ont pas pu être chargées." });
    ready = true;
    emit();
    return false;
  }
  ready = true;
  emit();
  return true;
}

/** Quelqu'un d'autre (ou un autre appareil) a-t-il modifié l'espace ? Si oui, on recharge. */
async function checkChanges() {
  if (!state.signedIn || !state.workspace || flushing || timer || document.visibilityState !== "visible") return;
  try {
    const res = await fetch(`/api/changes?workspace=${state.workspace.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const { fingerprint } = await res.json();
    if (fingerprint && fingerprint !== lastFingerprint) await refresh();
  } catch {
    // Hors ligne : on réessaiera au prochain tour.
  }
}

function load() {
  if (started || typeof window === "undefined") return;
  started = true;
  void refresh(true);
  // Ce que les autres ont modifié apparaît en quelques secondes (empreinte toutes les 5 s), au retour sur l'onglet,
  // et au pire au rechargement complet de secours (toutes les 60 s).
  const maybeRefresh = () => {
    if (document.visibilityState === "visible" && !flushing && !timer && state.signedIn) void refresh();
  };
  window.addEventListener("focus", () => void checkChanges());
  setInterval(() => void checkChanges(), CHANGES_MS);
  setInterval(maybeRefresh, REFRESH_MS);
  // Fermeture de l'onglet : on envoie ce qui reste.
  window.addEventListener("pagehide", flushUrgent);
}

function emit() {
  version++;
  listeners.forEach((l) => l());
}

let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let again = false;
/** Ce qu'aura le serveur une fois le lot en cours écrit (null si aucun lot en cours). */
let inflight: typeof synced | null = null;

/** Applique une modification : visible tout de suite, envoyée au serveur peu après (par lot). */
function commit() {
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

function diff(base = synced) {
  const pages = Object.values(state.pages).filter((p) => base.pages.get(p.id) !== p);
  const deletePages = [...base.pages.keys()].filter((id) => !state.pages[id]);
  const databases = Object.values(state.databases).filter((d) => base.databases.get(d.id) !== JSON.stringify(d));
  const deleteDatabases = [...base.databases.keys()].filter((id) => !state.databases[id]);
  const views = Object.values(state.views).filter((v) => base.views.get(v.id) !== JSON.stringify(v));
  const deleteViews = [...base.views.keys()].filter((id) => !state.views[id]);
  const favorites = JSON.stringify(state.favorites) !== base.favorites ? state.favorites : undefined;
  const profile = profileKey(state) !== base.profile && state.profile ? { name: state.profile.name, theme: state.profile.theme, recent: state.recent } : undefined;
  const workspace = workspaceKey(state) !== base.workspace && state.workspace ? { name: state.workspace.name, icon: state.workspace.icon } : undefined;
  const any =
    pages.length || deletePages.length || databases.length || deleteDatabases.length || views.length || deleteViews.length || favorites || profile || workspace;
  return any ? { pages, deletePages, databases, deleteDatabases, views, deleteViews, favorites, profile, workspace } : null;
}

async function flush(): Promise<void> {
  if (flushing) {
    again = true;
    return;
  }
  if (!state.signedIn || !state.workspace) return;
  const changes = diff();
  if (!changes) return;
  flushing = true;
  // Ce qui part maintenant devient la référence, même si l'utilisateur continue de taper.
  const sent = {
    pages: new Map(synced.pages),
    databases: new Map(synced.databases),
    views: new Map(synced.views),
  };
  for (const p of changes.pages) sent.pages.set(p.id, p);
  for (const id of changes.deletePages) sent.pages.delete(id);
  for (const d of changes.databases) sent.databases.set(d.id, JSON.stringify(d));
  for (const id of changes.deleteDatabases) sent.databases.delete(id);
  for (const v of changes.views) sent.views.set(v.id, JSON.stringify(v));
  for (const id of changes.deleteViews) sent.views.delete(id);
  inflight = {
    ...sent,
    favorites: changes.favorites ? JSON.stringify(changes.favorites) : synced.favorites,
    profile: changes.profile ? JSON.stringify(changes.profile) : synced.profile,
    workspace: changes.workspace ? JSON.stringify(changes.workspace) : synced.workspace,
  };
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: state.workspace.id, ...changes }),
      keepalive: JSON.stringify(changes).length < 60_000,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Enregistrement impossible.");
    synced = inflight;
    inflight = null;
    // Nos propres écritures ne doivent pas déclencher de rechargement.
    if (body.fingerprint) lastFingerprint = body.fingerprint;
    if (body.conflicts?.length) {
      inflight = null;
      notify({ kind: "conflict", message: "Une page a été modifiée ailleurs entre-temps : la version enregistrée a été rechargée." });
      flushing = false;
      await refresh(true);
      return;
    }
  } catch (e) {
    notify({ kind: "error", message: `${e instanceof Error ? e.message : "Enregistrement impossible."} Les données du serveur ont été rechargées.` });
    inflight = null;
    flushing = false;
    again = false;
    await refresh(true);
    return;
  }
  flushing = false;
  if (again) {
    again = false;
    await flush();
  }
}

/**
 * Onglet qui se cache ou se ferme : on n'attend pas le lot en cours (la page peut disparaître avant).
 * Ce qui reste part tout de suite, en keepalive ; le serveur écrit de façon idempotente, l'ordre n'importe pas.
 */
export function flushUrgent() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!flushing || !inflight) return void flush();
  if (!state.signedIn || !state.workspace) return;
  const changes = diff(inflight);
  if (!changes) return;
  void fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: state.workspace.id, ...changes }),
    keepalive: true,
  }).catch(() => {});
  // Si la page reste ouverte, le lot suivant renverra ces changements : sans effet, l'écriture est idempotente.
  again = true;
}

/** Attend que tout soit enregistré (utile avant une navigation qui recharge). */
export async function flushNow() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await flush();
}

export function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Change à chaque modification ; -1 tant que le premier chargement n'est pas terminé (= « chargement »). */
export function getVersion() {
  load();
  return ready ? version : -1;
}

/* --------------------------------------------------------------- outils */

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function requirePage(id: string) {
  const p = state.pages[id];
  if (!p) throw new DataError("not_found", "Page introuvable.");
  return p;
}

function requireWorkspace() {
  if (!state.profile) throw new DataError("unauthenticated", "Non connecté.");
  if (!state.workspace) throw new DataError("not_found", "Aucun espace de travail.");
  return state.workspace;
}

/** Pages de l'arbre (sidebar) : les lignes de base de données n'y figurent pas. */
function childrenOf(parentId: string | null, section: Section, includeTrash = false) {
  return Object.values(state.pages)
    .filter((p) => !p.rowOf && p.parentId === parentId && (parentId !== null || p.section === section) && (includeTrash || !p.inTrash))
    .sort((a, b) => a.position - b.position);
}

function hasLiveChildren(id: string) {
  return Object.values(state.pages).some((p) => !p.rowOf && p.parentId === id && !p.inTrash);
}

/** Parent logique : la page parente, ou la page conteneur pour une ligne de base de données. */
function parentOf(p: Page): string | null {
  if (p.rowOf) return state.databases[p.rowOf]?.pageId ?? null;
  return p.parentId;
}

function summary(p: Page): PageSummary {
  return {
    id: p.id,
    parentId: p.parentId,
    section: p.section,
    title: p.title,
    icon: p.icon,
    inTrash: p.inTrash,
    trashedAt: p.trashedAt,
    updatedAt: p.updatedAt,
    databaseOwnerOf: p.databaseOwnerOf ?? null,
    rowOf: p.rowOf ?? null,
    hasChildren: hasLiveChildren(p.id),
  };
}

function ancestors(id: string): Page[] {
  const out: Page[] = [];
  const start = state.pages[id];
  let cur = start ? parentOf(start) : null;
  while (cur) {
    const p = state.pages[cur];
    if (!p || out.includes(p)) break;
    out.unshift(p);
    cur = parentOf(p);
  }
  return out;
}

function descendants(id: string): Stored[] {
  const out: Stored[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of Object.values(state.pages)) {
      if (parentOf(p) === cur) {
        out.push(p);
        stack.push(p.id);
      }
    }
  }
  return out;
}

/** Position entre deux voisines (indexation fractionnaire ; en base, ce sera une chaîne). */
function positionAt(siblings: { position: number }[], index: number) {
  const i = Math.max(0, Math.min(index, siblings.length));
  const before = siblings[i - 1]?.position;
  const after = siblings[i]?.position;
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* ---------------------------------------------------------------- compte */

export function getSession(): { profile: Profile | null; workspace: Workspace | null } {
  load();
  if (!state.signedIn) return { profile: null, workspace: null };
  return { profile: state.profile, workspace: state.workspace };
}

const authError = (e: { message?: string; status?: number } | null | undefined, fallback: string) =>
  new Error(e?.status === 429 ? "Trop de tentatives : réessayez dans une minute." : e?.message || fallback);

/** Envoie un code de connexion par e-mail (Better Auth, plugin emailOTP). */
export async function sendLoginCode(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
  if (error) throw authError(error, "Envoi du code impossible.");
  return { ok: true as const };
}

/** Vérifie le code : crée le compte au premier passage, ouvre la session (cookie http-only), puis charge l'espace. */
export async function verifyLoginCode(email: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Le code contient 6 chiffres.");
  const { error } = await authClient.signIn.emailOtp({ email, otp: code });
  if (error) throw authError(error, "Code incorrect ou expiré.");
  await refresh(true);
  if (!state.profile) throw new Error("Connexion réussie, mais le profil n'a pas pu être chargé.");
  return { profile: state.profile, needsWorkspace: !state.workspace };
}

export async function signOut() {
  await flushNow();
  await authClient.signOut();
  state = empty();
  snapshot();
  emit();
}

/** Crée l'espace côté serveur, puis y dépose les pages de départ (envoyées comme n'importe quelle modification). */
export async function createWorkspace(input: { userName: string; workspaceName: string }) {
  load();
  if (!state.profile) throw new DataError("unauthenticated", "Non connecté.");
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName: input.userName, workspaceName: input.workspaceName }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Impossible de créer l'espace.");
  const ws: Workspace = await res.json();
  state.profile = { ...state.profile, name: input.userName.trim() };
  state.workspace = ws;
  state.members = [{ id: state.profile.id, name: state.profile.name || state.profile.email, email: state.profile.email }];
  // L'espace et le nom viennent d'être écrits par le serveur : ils sont la référence.
  snapshot();
  state.pages = {};
  state.databases = {};
  state.views = {};
  for (const seed of seedPages(ws.id, state.profile.id)) state.pages[seed.id] = seed;
  seedDatabase();
  commit();
  await flushNow();
  return ws;
}

export async function updateProfile(patch: Partial<Pick<Profile, "name" | "theme">>) {
  load();
  if (!state.profile) throw new DataError("unauthenticated", "Non connecté.");
  state.profile = { ...state.profile, ...patch };
  commit();
  // Réglages : envoyés tout de suite (un rechargement juste après ne doit pas les perdre).
  await flushNow();
  return state.profile;
}

export async function updateWorkspace(patch: Partial<Pick<Workspace, "name" | "icon">>) {
  load();
  const ws = requireWorkspace();
  state.workspace = { ...ws, ...patch };
  commit();
  await flushNow();
  return state.workspace;
}

/** Supprime définitivement le compte (et les espaces dont on est le seul membre), puis vide le cache. */
export async function deleteAccount() {
  await flushNow();
  const res = await fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "SUPPRIMER" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Suppression impossible.");
  await clearFiles();
  state = empty();
  snapshot();
  emit();
}

/** Oublie tout sur cet appareil (cache et fichiers locaux) et ferme la session. Les données du serveur restent. */
export async function resetEverything() {
  await clearFiles();
  await signOut();
}

export function getTheme(): Theme {
  load();
  return state.profile?.theme ?? "system";
}

/* ----------------------------------------------------------------- pages */

export function getPage(id: string): Page | null {
  load();
  return state.pages[id] ?? null;
}

export function listChildren(parentId: string | null, section: Section = "workspace"): PageSummary[] {
  load();
  return childrenOf(parentId, section).map(summary);
}

export function getPath(id: string): PageSummary[] {
  load();
  return ancestors(id).map(summary);
}

export async function createPage(at: Placement, init: PageMeta & { content?: PageContent } = {}) {
  load();
  const ws = requireWorkspace();
  if (at.parentId) requirePage(at.parentId);
  const section = at.parentId ? state.pages[at.parentId].section : at.section;
  const siblings = childrenOf(at.parentId, section);
  const t = now();
  const page: Stored = {
    id: uid(),
    workspaceId: ws.id,
    parentId: at.parentId,
    section,
    title: init.title ?? "",
    icon: init.icon ?? null,
    coverUrl: init.coverUrl ?? null,
    coverPosition: init.coverPosition ?? 0.5,
    fullWidth: init.fullWidth ?? false,
    smallText: init.smallText ?? false,
    font: init.font ?? "default",
    isLocked: false,
    content: init.content ?? [],
    contentText: "",
    inTrash: false,
    trashedAt: null,
    createdAt: t,
    updatedAt: t,
    lastEditedBy: state.profile?.id ?? null,
    position: positionAt(siblings, at.index ?? siblings.length),
    contentVersion: 0,
  };
  state.pages[page.id] = page;
  commit();
  return page;
}

export async function updatePageMeta(id: string, patch: PageMeta) {
  load();
  const p = requirePage(id);
  state.pages[id] = { ...p, ...patch, updatedAt: now(), lastEditedBy: state.profile?.id ?? null };
  commit();
  return state.pages[id];
}

export function getContentVersion(id: string) {
  load();
  return state.pages[id]?.contentVersion ?? 0;
}

/**
 * Enregistre le document. `baseVersion` = version du contenu chargée par l'éditeur :
 * si le contenu a changé entre-temps (autre onglet), on refuse au lieu d'écraser.
 * Un renommage ou un changement d'icône ne compte pas comme conflit.
 */
export async function savePageContent(id: string, content: PageContent, contentText: string, baseVersion: number): Promise<SaveResult> {
  load();
  const p = state.pages[id];
  if (!p) return { ok: false, reason: "not_found" };
  if (p.isLocked) return { ok: false, reason: "locked" };
  if (p.contentVersion !== baseVersion) return { ok: false, reason: "conflict" };
  const t = now();
  state.pages[id] = { ...p, content, contentText, updatedAt: t, contentVersion: p.contentVersion + 1, lastEditedBy: state.profile?.id ?? null };
  try {
    commit();
  } catch {
    state.pages[id] = p;
    return { ok: false, reason: "quota" };
  }
  return { ok: true, version: p.contentVersion + 1 };
}

export async function movePage(id: string, to: Placement) {
  load();
  const p = requirePage(id);
  if (to.parentId === id || (to.parentId && ancestors(to.parentId).some((a) => a.id === id))) {
    throw new DataError("invalid_move", "Impossible de déplacer une page dans une de ses sous-pages.");
  }
  if (to.parentId) requirePage(to.parentId);
  const section = to.parentId ? state.pages[to.parentId].section : to.section;
  const siblings = childrenOf(to.parentId, section).filter((s) => s.id !== id);
  state.pages[id] = {
    ...p,
    parentId: to.parentId,
    section,
    position: positionAt(siblings, to.index ?? siblings.length),
    updatedAt: now(),
  };
  // Les sous-pages suivent la section de leur racine.
  for (const d of descendants(id)) state.pages[d.id] = { ...state.pages[d.id], section };
  commit();
}

export async function duplicatePage(id: string) {
  load();
  const src = requirePage(id);
  const map = new Map<string, string>();
  const tree = [src, ...descendants(id)];
  for (const p of tree) map.set(p.id, uid());
  const t = now();
  const siblings = childrenOf(src.parentId, src.section);
  const idx = siblings.findIndex((s) => s.id === id) + 1;
  for (const p of tree) {
    if (p.inTrash) continue;
    const copy = {
      ...structuredClone(p),
      id: map.get(p.id)!,
      parentId: p.id === id ? p.parentId : (map.get(p.parentId!) ?? p.parentId),
      title: p.id === id ? `${p.title || "Sans titre"} (copie)` : p.title,
      isLocked: false,
      createdAt: t,
      updatedAt: t,
      position: p.id === id ? positionAt(siblings, idx) : p.position,
      contentVersion: 0,
    };
    // Les blocs « sous-page » de la copie pointent vers les copies des sous-pages.
    copy.content = JSON.parse(JSON.stringify(copy.content).replace(/"pageId":"([^"]+)"/g, (m, pid) => (map.has(pid) ? `"pageId":"${map.get(pid)}"` : m)));
    state.pages[copy.id] = copy;
  }
  // Bases de données contenues dans l'arbre copié : nouvelles bases, vues et lignes rattachées.
  const dbMap = new Map<string, string>();
  for (const db of Object.values(state.databases)) {
    if (!map.has(db.pageId)) continue;
    const newId = uid();
    dbMap.set(db.id, newId);
    state.databases[newId] = { ...structuredClone(db), id: newId, pageId: map.get(db.pageId)! };
    for (const v of Object.values(state.views)) {
      if (v.databaseId === db.id) {
        const vid = uid();
        state.views[vid] = { ...structuredClone(v), id: vid, databaseId: newId };
      }
    }
  }
  for (const p of tree) {
    const cid = map.get(p.id)!;
    const c = state.pages[cid];
    if (!c) continue;
    if (c.databaseOwnerOf) c.databaseOwnerOf = dbMap.get(c.databaseOwnerOf) ?? null;
    if (c.rowOf) c.rowOf = dbMap.get(c.rowOf) ?? c.rowOf;
    // Relations entre pages copiées : elles pointent vers les copies.
    if (c.props) c.props = JSON.parse(JSON.stringify(c.props).replace(/"([0-9a-f-]{36})"/g, (m, pid) => (map.has(pid) ? `"${map.get(pid)}"` : m)));
    c.content = JSON.parse(JSON.stringify(c.content).replace(/"databaseId":"([^"]+)"/g, (m, did) => (dbMap.has(did) ? `"databaseId":"${dbMap.get(did)}"` : m)));
  }
  commit();
  return state.pages[map.get(id)!];
}

/** Met à la corbeille (ou restaure) une page et toutes ses sous-pages. */
export async function setTrash(id: string, trash: boolean) {
  load();
  const p = requirePage(id);
  // Restaurer une ligne dont la base est à la corbeille : on restaure la base (et ses lignes).
  if (!trash && p.rowOf) {
    const container = state.pages[state.databases[p.rowOf]?.pageId ?? ""];
    if (container?.inTrash) {
      if (p.trashedAt !== container.trashedAt) state.pages[id] = { ...p, trashedAt: container.trashedAt };
      return setTrash(container.id, false);
    }
  }
  const t = trash ? now() : null;
  const tree = [p, ...descendants(id)];
  for (const d of tree) {
    // En restaurant, on ne ressort pas les sous-pages supprimées avant leur parent.
    if (!trash && d.id !== id && d.trashedAt !== p.trashedAt) continue;
    state.pages[d.id] = { ...state.pages[d.id], inTrash: trash, trashedAt: t };
  }
  // Restaurée sous un parent toujours à la corbeille : elle remonte à la racine de sa section.
  if (!trash && p.parentId && state.pages[p.parentId]?.inTrash) {
    state.pages[id] = { ...state.pages[id], parentId: null };
  }
  if (trash) state.favorites = state.favorites.filter((f) => !tree.some((d) => d.id === f));
  commit();
}

export async function deleteForever(id: string) {
  load();
  const tree = [requirePage(id), ...descendants(id)];
  for (const d of tree) delete state.pages[d.id];
  collectGarbage();
  state.favorites = state.favorites.filter((f) => state.pages[f]);
  state.recent = state.recent.filter((r) => state.pages[r]);
  commit();
}

export function listTrash(): (PageSummary & { path: string })[] {
  load();
  return Object.values(state.pages)
    // Une sous-page supprimée avec son parent n'apparaît qu'une fois, via le parent.
    .filter((p) => {
      if (!p.inTrash) return false;
      const parent = state.pages[parentOf(p) ?? ""];
      return !(parent?.inTrash && parent.trashedAt === p.trashedAt);
    })
    .sort((a, b) => (b.trashedAt ?? "").localeCompare(a.trashedAt ?? ""))
    .map((p) => ({ ...summary(p), path: ancestors(p.id).map((a) => a.title || "Sans titre").join(" / ") }));
}

/* ------------------------------------------------------- favoris, récents */

export function listFavorites(): PageSummary[] {
  load();
  return state.favorites.map((id) => state.pages[id]).filter((p) => p && !p.inTrash).map(summary);
}

export function isFavorite(id: string) {
  load();
  return state.favorites.includes(id);
}

export async function toggleFavorite(id: string) {
  load();
  requirePage(id);
  state.favorites = state.favorites.includes(id) ? state.favorites.filter((f) => f !== id) : [...state.favorites, id];
  commit();
}

export async function markVisited(id: string) {
  load();
  if (!state.pages[id] || state.recent[0] === id) return;
  state.recent = [id, ...state.recent.filter((r) => r !== id)].slice(0, RECENT_MAX);
  try {
    commit();
  } catch {}
}

export function listRecent(limit = 8): PageSummary[] {
  load();
  return state.recent
    .map((id) => state.pages[id])
    .filter((p) => p && !p.inTrash)
    .slice(0, limit)
    .map(summary);
}

/* -------------------------------------------------------------- recherche */

export function search(query: string, limit = 20): SearchHit[] {
  load();
  const q = normalize(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  const hits: { hit: SearchHit; score: number }[] = [];
  for (const p of Object.values(state.pages)) {
    if (p.inTrash) continue;
    const title = normalize(p.title || "Sans titre");
    const body = normalize(p.contentText);
    if (!words.every((w) => title.includes(w) || body.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      if (title.startsWith(w)) score += 6;
      else if (title.includes(w)) score += 4;
      if (body.includes(w)) score += 1;
    }
    let snippet: string | null = null;
    const at = body.indexOf(words[0]);
    if (at >= 0) {
      const start = Math.max(0, at - 30);
      snippet = (start > 0 ? "…" : "") + p.contentText.slice(start, at + 80).trim() + (at + 80 < p.contentText.length ? "…" : "");
    }
    hits.push({ hit: { page: summary(p), path: ancestors(p.id).map(summary), snippet }, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || b.hit.page.updatedAt.localeCompare(a.hit.page.updatedAt))
    .slice(0, limit)
    .map((h) => h.hit);
}

/* ---------------------------------------------------- fichiers (IndexedDB) */

const FILE_DB = "ws-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function filesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Stocke un fichier et renvoie une URL interne `local-file:<id>`, résolue à l'affichage. */
/**
 * Importe un fichier sur le serveur (stocké dans Neon) et renvoie son URL `/api/files/<id>`, servie après contrôle d'accès.
 * `pageId` rattache le fichier à sa page : supprimer la page le rend orphelin, et la purge planifiée l'efface.
 */
export async function uploadFile(file: File, pageId: string | null = null): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Fichier trop lourd (10 Mo maximum).");
  const ws = requireWorkspace();
  const form = new FormData();
  form.set("file", file);
  form.set("workspaceId", ws.id);
  if (pageId && state.pages[pageId]) form.set("pageId", pageId);
  const res = await fetch("/api/files", { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Import impossible.");
  return body.url as string;
}

const objectUrls = new Map<string, string>();

/** Les URL serveur s'utilisent telles quelles ; `local-file:` désigne un fichier importé avant le serveur, resté sur cet appareil. */
export async function resolveFileUrl(url: string): Promise<string> {
  if (!url.startsWith("local-file:")) return url;
  const id = url.slice("local-file:".length);
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const db = await filesDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!blob) return "";
  const objectUrl = URL.createObjectURL(blob);
  objectUrls.set(id, objectUrl);
  return objectUrl;
}

async function clearFiles() {
  try {
    const db = await filesDb();
    db.transaction("files", "readwrite").objectStore("files").clear();
  } catch {}
}

/* ------------------------------------------------------- bases de données */

const COLORS: OptionColor[] = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

export const PROPERTY_LABELS: Record<PropertyType, string> = {
  title: "Titre",
  text: "Texte",
  number: "Nombre",
  select: "Sélection",
  multi_select: "Sélection multiple",
  status: "Statut",
  date: "Date",
  person: "Personne",
  checkbox: "Case à cocher",
  url: "URL",
  email: "E-mail",
  phone: "Téléphone",
  files: "Fichiers",
  relation: "Relation",
  rollup: "Agrégation",
  created_time: "Créé le",
  created_by: "Créé par",
  last_edited_time: "Modifié le",
  last_edited_by: "Modifié par",
  unique_id: "ID",
};

/** Supprime ce qui ne pointe plus vers rien (bases sans page, vues sans base, lignes sans base). */
function collectGarbage() {
  for (const db of Object.values(state.databases)) if (!state.pages[db.pageId]) delete state.databases[db.id];
  for (const v of Object.values(state.views)) if (!state.databases[v.databaseId]) delete state.views[v.id];
  for (const p of Object.values(state.pages)) if (p.rowOf && !state.databases[p.rowOf]) delete state.pages[p.id];
}

function requireDatabase(id: string) {
  const db = state.databases[id];
  if (!db) throw new DataError("not_found", "Base de données introuvable.");
  return db;
}

function requireProperty(db: Database, propertyId: string) {
  const prop = db.properties.find((p) => p.id === propertyId);
  if (!prop) throw new DataError("not_found", "Propriété introuvable.");
  return prop;
}

function defaultStatus(): Required<Pick<PropertyConfig, "options" | "groups">> {
  const todo: SelectOption = { id: uid(), name: "À faire", color: "gray" };
  const doing: SelectOption = { id: uid(), name: "En cours", color: "blue" };
  const done: SelectOption = { id: uid(), name: "Terminé", color: "green" };
  return {
    options: [todo, doing, done],
    groups: [
      { id: uid(), name: "À faire", color: "gray", optionIds: [todo.id] },
      { id: uid(), name: "En cours", color: "blue", optionIds: [doing.id] },
      { id: uid(), name: "Terminé", color: "green", optionIds: [done.id] },
    ],
  };
}

function defaultConfig(type: PropertyType): PropertyConfig {
  if (type === "select" || type === "multi_select") return { options: [] };
  if (type === "status") return defaultStatus();
  if (type === "number") return { numberFormat: "number" };
  return {};
}

export function defaultViewConfig(db: Database, type: ViewType): ViewConfig {
  const visible = db.properties.filter((p) => p.type !== "title").map((p) => p.id);
  const status = db.properties.find((p) => p.type === "status" || p.type === "select");
  const date = db.properties.find((p) => p.type === "date");
  return {
    filter: { id: uid(), mode: "and", items: [] },
    sorts: [],
    groupBy: type === "board" ? (status?.id ?? null) : null,
    visible: type === "gallery" || type === "board" ? visible.slice(0, 2) : visible,
    dateProperty: date?.id ?? null,
    cardCover: type === "gallery" ? "cover" : "none",
    openIn: type === "gallery" || type === "calendar" ? "center" : "side",
    calcs: {},
  };
}

const VIEW_NAMES: Record<ViewType, string> = { table: "Tableau", board: "Kanban", list: "Liste", gallery: "Galerie", calendar: "Calendrier" };

function insertDatabase(at: Placement, opts: { title?: string; icon?: string | null; inline?: boolean; properties?: Property[] }) {
  const ws = requireWorkspace();
  const section = at.parentId ? (state.pages[at.parentId]?.section ?? at.section) : at.section;
  const siblings = childrenOf(at.parentId, section);
  const t = now();
  const dbId = uid();
  const pageId = uid();
  const props: Property[] = opts.properties ?? [
    { id: "title", name: "Nom", type: "title", config: {} },
    { id: uid(), name: "Statut", type: "status", config: defaultStatus() },
    { id: uid(), name: "Étiquettes", type: "multi_select", config: { options: [] } },
  ];
  state.pages[pageId] = {
    id: pageId,
    workspaceId: ws.id,
    parentId: at.parentId,
    section,
    title: opts.title ?? "",
    icon: opts.icon ?? null,
    coverUrl: null,
    coverPosition: 0.5,
    fullWidth: !opts.inline,
    smallText: false,
    font: "default",
    isLocked: false,
    content: [],
    contentText: "",
    inTrash: false,
    trashedAt: null,
    createdAt: t,
    updatedAt: t,
    lastEditedBy: state.profile?.id ?? null,
    createdBy: state.profile?.id ?? null,
    databaseOwnerOf: dbId,
    position: positionAt(siblings, at.index ?? siblings.length),
    contentVersion: 0,
  };
  const db: Database = { id: dbId, pageId, inline: !!opts.inline, properties: props, nextUniqueId: 1 };
  state.databases[dbId] = db;
  const vid = uid();
  state.views[vid] = { id: vid, databaseId: dbId, name: VIEW_NAMES.table, type: "table", position: 1, config: defaultViewConfig(db, "table") };
  return { page: state.pages[pageId], database: db };
}

function insertRow(db: Database, init: { title?: string; props?: Record<string, PropValue>; position?: number }) {
  const container = state.pages[db.pageId];
  const t = now();
  const id = uid();
  const props: Record<string, PropValue> = { ...(init.props ?? {}) };
  const hasUnique = db.properties.some((p) => p.type === "unique_id");
  for (const p of db.properties) if (p.type === "unique_id") props[p.id] = db.nextUniqueId;
  if (hasUnique) db.nextUniqueId++;
  const rows = Object.values(state.pages).filter((p) => p.rowOf === db.id);
  state.pages[id] = {
    id,
    workspaceId: container.workspaceId,
    parentId: null,
    section: container.section,
    title: init.title ?? "",
    icon: null,
    coverUrl: null,
    coverPosition: 0.5,
    fullWidth: false,
    smallText: false,
    font: "default",
    isLocked: false,
    content: [],
    contentText: "",
    inTrash: false,
    trashedAt: null,
    createdAt: t,
    updatedAt: t,
    lastEditedBy: state.profile?.id ?? null,
    createdBy: state.profile?.id ?? null,
    rowOf: db.id,
    props,
    position: init.position ?? rows.reduce((m, r) => Math.max(m, r.position), 0) + 1,
    contentVersion: 0,
  };
  return state.pages[id];
}

export async function createDatabase(at: Placement, opts: { title?: string; inline?: boolean } = {}) {
  load();
  if (at.parentId) requirePage(at.parentId);
  const res = insertDatabase(at, opts);
  for (let i = 0; i < 3; i++) insertRow(res.database, {});
  commit();
  return res;
}

export function getDatabase(id: string): Database | null {
  load();
  return state.databases[id] ?? null;
}

export function listDatabases(): { database: Database; title: string; icon: string | null }[] {
  load();
  return Object.values(state.databases)
    .filter((db) => state.pages[db.pageId] && !state.pages[db.pageId].inTrash)
    .map((db) => ({ database: db, title: state.pages[db.pageId].title || "Sans titre", icon: state.pages[db.pageId].icon }));
}

export function listViews(databaseId: string): View[] {
  load();
  return Object.values(state.views)
    .filter((v) => v.databaseId === databaseId)
    .sort((a, b) => a.position - b.position);
}

/** Lignes non supprimées, dans l'ordre manuel (les vues trient ensuite). */
export function listRows(databaseId: string): Page[] {
  load();
  return Object.values(state.pages)
    .filter((p) => p.rowOf === databaseId && !p.inTrash)
    .sort((a, b) => a.position - b.position);
}

export function listPeople(): { id: string; name: string; email: string }[] {
  load();
  return state.members;
}

export async function createRow(databaseId: string, init: { title?: string; props?: Record<string, PropValue>; after?: string | null } = {}) {
  load();
  const db = requireDatabase(databaseId);
  let position: number | undefined;
  if (init.after !== undefined) {
    const rows = listRows(databaseId) as Stored[];
    const i = init.after === null ? 0 : rows.findIndex((r) => r.id === init.after) + 1;
    position = positionAt(rows, i);
  }
  const row = insertRow(db, { ...init, position });
  // Relations à double sens posées à la création : on écrit aussi l'autre côté.
  for (const p of db.properties) {
    const v = init.props?.[p.id];
    if (p.type === "relation" && Array.isArray(v)) syncPairedRelation(p, row.id, [], v as string[]);
  }
  commit();
  return row;
}

/** Écrit l'autre côté d'une relation à double sens (ajouts et retraits). */
function syncPairedRelation(prop: Property, rowId: string, before: string[], after: string[]) {
  const pairedId = prop.config.relation?.pairedPropertyId;
  if (!pairedId) return;
  for (const target of after.filter((x) => !before.includes(x))) {
    const t = state.pages[target];
    if (!t) continue;
    const cur = (t.props?.[pairedId] as string[] | undefined) ?? [];
    if (!cur.includes(rowId)) state.pages[target] = { ...t, props: { ...t.props, [pairedId]: [...cur, rowId] } };
  }
  for (const target of before.filter((x) => !after.includes(x))) {
    const t = state.pages[target];
    if (!t) continue;
    const cur = (t.props?.[pairedId] as string[] | undefined) ?? [];
    state.pages[target] = { ...t, props: { ...t.props, [pairedId]: cur.filter((x) => x !== rowId) } };
  }
}

export async function updateRowProp(pageId: string, propertyId: string, value: PropValue) {
  load();
  const row = requirePage(pageId);
  if (!row.rowOf) throw new DataError("not_found", "Cette page n'est pas une ligne de base de données.");
  const db = requireDatabase(row.rowOf);
  const prop = requireProperty(db, propertyId);
  const meta = { updatedAt: now(), lastEditedBy: state.profile?.id ?? null };
  if (prop.type === "title") {
    state.pages[pageId] = { ...row, title: String(value ?? ""), ...meta };
  } else {
    if (prop.type === "relation") syncPairedRelation(prop, pageId, (row.props?.[propertyId] as string[]) ?? [], (value as string[]) ?? []);
    state.pages[pageId] = { ...state.pages[pageId], props: { ...row.props, [propertyId]: value }, ...meta };
  }
  commit();
}

export async function moveRow(pageId: string, after: string | null) {
  load();
  const row = requirePage(pageId);
  if (!row.rowOf) return;
  const rows = listRows(row.rowOf).filter((r) => r.id !== pageId) as Stored[];
  const i = after === null ? 0 : rows.findIndex((r) => r.id === after) + 1;
  state.pages[pageId] = { ...row, position: positionAt(rows, i) };
  commit();
}

export async function addProperty(databaseId: string, type: PropertyType, name?: string, config?: PropertyConfig) {
  load();
  const db = requireDatabase(databaseId);
  const base = name?.trim() || PROPERTY_LABELS[type];
  let finalName = base;
  for (let n = 2; db.properties.some((p) => p.name === finalName); n++) finalName = `${base} ${n}`;
  const prop: Property = { id: uid(), name: finalName, type, config: config ?? defaultConfig(type) };
  if (type === "unique_id") {
    // Numérote les lignes existantes dans l'ordre de création.
    const rows = listRows(databaseId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const r of rows) state.pages[r.id] = { ...state.pages[r.id], props: { ...r.props, [prop.id]: db.nextUniqueId++ } };
  }
  db.properties = [...db.properties, prop];
  for (const v of listViews(databaseId)) state.views[v.id] = { ...v, config: { ...v.config, visible: [...v.config.visible, prop.id] } };
  commit();
  return prop;
}

/** Relation vers une autre base ; avec `twoWay`, une propriété miroir est créée dans la cible. */
export async function addRelation(databaseId: string, targetDatabaseId: string, twoWay: boolean) {
  load();
  const db = requireDatabase(databaseId);
  const target = requireDatabase(targetDatabaseId);
  const targetTitle = state.pages[target.pageId]?.title || "Sans titre";
  const prop = await addProperty(databaseId, "relation", targetTitle, { relation: { databaseId: targetDatabaseId, pairedPropertyId: null } });
  if (twoWay && targetDatabaseId !== databaseId) {
    const sourceTitle = state.pages[db.pageId]?.title || "Sans titre";
    const mirror = await addProperty(targetDatabaseId, "relation", sourceTitle, { relation: { databaseId, pairedPropertyId: prop.id } });
    db.properties = db.properties.map((p) =>
      p.id === prop.id ? { ...p, config: { relation: { databaseId: targetDatabaseId, pairedPropertyId: mirror.id } } } : p,
    );
    commit();
  }
  return prop;
}

export async function updateProperty(databaseId: string, propertyId: string, patch: { name?: string; config?: Partial<PropertyConfig> }) {
  load();
  const db = requireDatabase(databaseId);
  requireProperty(db, propertyId);
  db.properties = db.properties.map((p) =>
    p.id === propertyId ? { ...p, name: patch.name?.trim() || p.name, config: { ...p.config, ...patch.config } } : p,
  );
  commit();
}

/** Valeur d'une propriété convertie en texte, pour les changements de type. */
function valueToText(prop: Property, v: PropValue): string {
  if (v === null || v === undefined) return "";
  if (prop.type === "select" || prop.type === "status") return prop.config.options?.find((o) => o.id === v)?.name ?? "";
  if (prop.type === "multi_select")
    return (v as string[])
      .map((id) => prop.config.options?.find((o) => o.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  if (prop.type === "date") return (v as DateValue).start ?? "";
  if (prop.type === "checkbox") return v ? "Oui" : "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? (state.pages[x]?.title ?? "") : x.name)).join(", ");
  return String(v);
}

/** Change le type d'une propriété en convertissant les valeurs des lignes. */
export async function changePropertyType(databaseId: string, propertyId: string, type: PropertyType) {
  load();
  const db = requireDatabase(databaseId);
  const prop = requireProperty(db, propertyId);
  if (prop.type === "title" || type === "title" || prop.type === type) return;
  const config = defaultConfig(type);
  const rows = listRows(databaseId);
  const texts = rows.map((r) => valueToText(prop, r.props?.[propertyId] ?? null));
  // Les options de sélection sont reprises depuis les valeurs texte.
  if (type === "select" || type === "multi_select" || type === "status") {
    const names = new Set<string>();
    for (const t of texts) for (const part of type === "multi_select" ? t.split(",") : [t]) if (part.trim()) names.add(part.trim());
    const existing = prop.config.options ?? [];
    const opts: SelectOption[] = [...names].map((n) => existing.find((o) => o.name === n) ?? { id: uid(), name: n, color: randomColor() });
    if (type === "status") {
      const st = defaultStatus();
      const extra = opts.filter((o) => !st.options.some((s) => s.name === o.name));
      config.options = [...st.options, ...extra];
      config.groups = st.groups.map((g, i) => (i === 0 ? { ...g, optionIds: [...g.optionIds, ...extra.map((e) => e.id)] } : g));
    } else config.options = opts;
  }
  rows.forEach((r, i) => {
    const t = texts[i];
    let v: PropValue = null;
    switch (type) {
      case "text":
      case "url":
      case "email":
      case "phone":
        v = t || null;
        break;
      case "number": {
        const n = Number(t.replace(",", ".").replace(/[^\d.-]/g, ""));
        v = t && Number.isFinite(n) ? n : null;
        break;
      }
      case "checkbox":
        v = !!t && !/^(non|no|false|0)$/i.test(t);
        break;
      case "select":
      case "status":
        v = config.options?.find((o) => o.name === t.trim())?.id ?? null;
        break;
      case "multi_select":
        v = t
          .split(",")
          .map((x) => config.options?.find((o) => o.name === x.trim())?.id)
          .filter((x): x is string => !!x);
        break;
      case "date": {
        const d = Date.parse(t);
        v = t && !Number.isNaN(d) ? { start: new Date(d).toISOString().slice(0, 10) } : null;
        break;
      }
      default:
        v = null;
    }
    state.pages[r.id] = { ...state.pages[r.id], props: { ...r.props, [propertyId]: v } };
  });
  db.properties = db.properties.map((p) => (p.id === propertyId ? { ...p, type, config } : p));
  commit();
}

function stripFilter(g: ViewConfig["filter"], propertyId: string): ViewConfig["filter"] {
  return {
    ...g,
    items: g.items
      .map((it) => ("items" in it ? stripFilter(it, propertyId) : it))
      .filter((it) => ("items" in it ? it.items.length > 0 : it.propertyId !== propertyId)),
  };
}

export async function deleteProperty(databaseId: string, propertyId: string) {
  load();
  const db = requireDatabase(databaseId);
  const prop = requireProperty(db, propertyId);
  if (prop.type === "title") throw new DataError("invalid_move", "La propriété titre ne peut pas être supprimée.");
  // Relation à double sens : la propriété miroir devient une relation simple.
  const paired = prop.config.relation?.pairedPropertyId;
  if (prop.type === "relation" && paired) {
    const other = state.databases[prop.config.relation!.databaseId];
    if (other)
      other.properties = other.properties.map((p) =>
        p.id === paired ? { ...p, config: { relation: { databaseId: p.config.relation!.databaseId, pairedPropertyId: null } } } : p,
      );
  }
  db.properties = db.properties
    .filter((p) => p.id !== propertyId)
    // Les agrégations qui s'appuyaient dessus n'ont plus de source.
    .map((p) =>
      p.type === "rollup" && (p.config.rollup?.relationPropertyId === propertyId || p.config.rollup?.targetPropertyId === propertyId)
        ? { ...p, config: { ...p.config, rollup: undefined } }
        : p,
    );
  for (const v of listViews(databaseId)) {
    const c = v.config;
    state.views[v.id] = {
      ...v,
      config: {
        ...c,
        visible: c.visible.filter((x) => x !== propertyId),
        sorts: c.sorts.filter((x) => x.propertyId !== propertyId),
        groupBy: c.groupBy === propertyId ? null : c.groupBy,
        dateProperty: c.dateProperty === propertyId ? null : c.dateProperty,
        filter: stripFilter(c.filter, propertyId),
      },
    };
  }
  for (const r of listRows(databaseId)) {
    if (r.props && propertyId in r.props) {
      const rest = { ...r.props };
      delete rest[propertyId];
      state.pages[r.id] = { ...state.pages[r.id], props: rest };
    }
  }
  commit();
}

export async function duplicateProperty(databaseId: string, propertyId: string) {
  load();
  const db = requireDatabase(databaseId);
  const prop = requireProperty(db, propertyId);
  if (prop.type === "title" || prop.type === "relation") return;
  const copy = await addProperty(databaseId, prop.type, `${prop.name} (copie)`, structuredClone(prop.config));
  for (const r of listRows(databaseId)) {
    const v = r.props?.[propertyId];
    if (v !== undefined) state.pages[r.id] = { ...state.pages[r.id], props: { ...r.props, [copy.id]: structuredClone(v) } };
  }
  commit();
}

export async function addOption(databaseId: string, propertyId: string, name: string) {
  load();
  const db = requireDatabase(databaseId);
  const prop = requireProperty(db, propertyId);
  const opt: SelectOption = { id: uid(), name: name.trim(), color: randomColor() };
  const config: PropertyConfig = { ...prop.config, options: [...(prop.config.options ?? []), opt] };
  if (prop.type === "status" && config.groups?.length) {
    config.groups = config.groups.map((g, i) => (i === 0 ? { ...g, optionIds: [...g.optionIds, opt.id] } : g));
  }
  db.properties = db.properties.map((p) => (p.id === propertyId ? { ...p, config } : p));
  commit();
  return opt;
}

export async function updateOption(databaseId: string, propertyId: string, optionId: string, patch: Partial<Pick<SelectOption, "name" | "color">>) {
  load();
  const db = requireDatabase(databaseId);
  const prop = requireProperty(db, propertyId);
  const options = (prop.config.options ?? []).map((o) => (o.id === optionId ? { ...o, ...patch, name: patch.name?.trim() || o.name } : o));
  db.properties = db.properties.map((p) => (p.id === propertyId ? { ...p, config: { ...p.config, options } } : p));
  commit();
}

export async function deleteOption(databaseId: string, propertyId: string, optionId: string) {
  load();
  const db = requireDatabase(databaseId);
  const prop = requireProperty(db, propertyId);
  const config: PropertyConfig = { ...prop.config, options: (prop.config.options ?? []).filter((o) => o.id !== optionId) };
  if (config.groups) config.groups = config.groups.map((g) => ({ ...g, optionIds: g.optionIds.filter((x) => x !== optionId) }));
  db.properties = db.properties.map((p) => (p.id === propertyId ? { ...p, config } : p));
  for (const r of listRows(databaseId)) {
    const v = r.props?.[propertyId];
    if (v === optionId) state.pages[r.id] = { ...state.pages[r.id], props: { ...r.props, [propertyId]: null } };
    else if (Array.isArray(v) && (v as string[]).includes(optionId))
      state.pages[r.id] = { ...state.pages[r.id], props: { ...r.props, [propertyId]: (v as string[]).filter((x) => x !== optionId) } };
  }
  commit();
}

export async function createView(databaseId: string, type: ViewType) {
  load();
  const db = requireDatabase(databaseId);
  const views = listViews(databaseId);
  const n = views.filter((v) => v.type === type).length;
  const id = uid();
  state.views[id] = {
    id,
    databaseId,
    name: n ? `${VIEW_NAMES[type]} ${n + 1}` : VIEW_NAMES[type],
    type,
    position: (views.at(-1)?.position ?? 0) + 1,
    config: defaultViewConfig(db, type),
  };
  // Un Kanban a besoin d'une propriété de regroupement, un calendrier d'une date : on les crée au besoin.
  if (type === "board" && !state.views[id].config.groupBy) {
    const prop = await addProperty(databaseId, "status");
    state.views[id] = { ...state.views[id], config: { ...state.views[id].config, groupBy: prop.id } };
  }
  if (type === "calendar" && !state.views[id].config.dateProperty) {
    const prop = await addProperty(databaseId, "date");
    state.views[id] = { ...state.views[id], config: { ...state.views[id].config, dateProperty: prop.id } };
  }
  commit();
  return state.views[id];
}

export async function updateView(viewId: string, patch: { name?: string; type?: ViewType; config?: Partial<ViewConfig> }) {
  load();
  const v = state.views[viewId];
  if (!v) throw new DataError("not_found", "Vue introuvable.");
  const next: View = { ...v, name: patch.name?.trim() || v.name, type: patch.type ?? v.type, config: { ...v.config, ...patch.config } };
  if (patch.type && patch.type !== v.type) {
    const d = defaultViewConfig(requireDatabase(v.databaseId), patch.type);
    if (patch.type === "board" && !next.config.groupBy) next.config.groupBy = d.groupBy;
    if (patch.type === "calendar" && !next.config.dateProperty) next.config.dateProperty = d.dateProperty;
  }
  state.views[viewId] = next;
  commit();
  return next;
}

export async function duplicateView(viewId: string) {
  load();
  const v = state.views[viewId];
  if (!v) throw new DataError("not_found", "Vue introuvable.");
  const id = uid();
  const others = listViews(v.databaseId);
  const i = others.findIndex((x) => x.id === viewId);
  state.views[id] = { ...structuredClone(v), id, name: `${v.name} (copie)`, position: positionAt(others, i + 1) };
  commit();
  return state.views[id];
}

export async function deleteView(viewId: string) {
  load();
  const v = state.views[viewId];
  if (!v) return;
  if (listViews(v.databaseId).length <= 1) throw new DataError("invalid_move", "Une base de données garde au moins une vue.");
  delete state.views[viewId];
  commit();
}

export async function moveView(viewId: string, index: number) {
  load();
  const v = state.views[viewId];
  if (!v) return;
  const others = listViews(v.databaseId).filter((x) => x.id !== viewId);
  state.views[viewId] = { ...v, position: positionAt(others, index) };
  commit();
}

/** Base d'exemple créée avec un nouvel espace. Contenu rédigé pour ce projet. */
function seedDatabase() {
  const projets = Object.values(state.pages).find((p) => p.title === "Projets" && !p.parentId);
  const statusCfg = defaultStatus();
  const priority: SelectOption[] = [
    { id: uid(), name: "Haute", color: "red" },
    { id: uid(), name: "Moyenne", color: "yellow" },
    { id: uid(), name: "Basse", color: "gray" },
  ];
  const tags: SelectOption[] = [
    { id: uid(), name: "Site", color: "blue" },
    { id: uid(), name: "Contenu", color: "purple" },
    { id: uid(), name: "Interne", color: "brown" },
  ];
  const ids = { status: uid(), priority: uid(), due: uid(), tags: uid(), owner: uid(), code: uid() };
  const { database } = insertDatabase(
    { parentId: projets?.id ?? null, section: "workspace" },
    {
      title: "Suivi des tâches",
      icon: "📋",
      properties: [
        { id: "title", name: "Tâche", type: "title", config: {} },
        { id: ids.status, name: "Statut", type: "status", config: statusCfg },
        { id: ids.priority, name: "Priorité", type: "select", config: { options: priority } },
        { id: ids.due, name: "Échéance", type: "date", config: {} },
        { id: ids.tags, name: "Étiquettes", type: "multi_select", config: { options: tags } },
        { id: ids.owner, name: "Responsable", type: "person", config: {} },
        { id: ids.code, name: "ID", type: "unique_id", config: { prefix: "TÂCHE" } },
      ],
    },
  );
  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const me = state.profile ? [state.profile.id] : [];
  const [todo, doing, done] = statusCfg.options;
  const rows: [string, SelectOption, SelectOption, number, SelectOption[]][] = [
    ["Valider les maquettes de la page d'accueil", done, priority[0], -3, [tags[0]]],
    ["Rédiger la page « À propos »", doing, priority[1], 2, [tags[1]]],
    ["Préparer les visuels pour les réseaux", doing, priority[2], 5, [tags[1]]],
    ["Tester le site sur mobile", todo, priority[0], 7, [tags[0]]],
    ["Mettre à jour le guide d'accueil des nouveaux", todo, priority[2], 12, [tags[2]]],
  ];
  for (const [title, st, pr, offset, tg] of rows) {
    insertRow(database, {
      title,
      props: {
        [ids.status]: st.id,
        [ids.priority]: pr.id,
        [ids.due]: { start: day(offset) },
        [ids.tags]: tg.map((t) => t.id),
        [ids.owner]: me,
      },
    });
  }
  const table = listViews(database.id)[0];
  state.views[table.id] = { ...table, name: "Toutes les tâches" };
  const boardId = uid();
  state.views[boardId] = {
    id: boardId,
    databaseId: database.id,
    name: "Par statut",
    type: "board",
    position: 2,
    config: { ...defaultViewConfig(database, "board"), groupBy: ids.status, visible: [ids.priority, ids.due] },
  };
  const calId = uid();
  state.views[calId] = {
    id: calId,
    databaseId: database.id,
    name: "Calendrier",
    type: "calendar",
    position: 3,
    config: { ...defaultViewConfig(database, "calendar"), dateProperty: ids.due, visible: [ids.status] },
  };
}
