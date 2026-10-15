// Implémentation locale de la couche de données : tout vit dans le navigateur
// (localStorage pour l'état, IndexedDB pour les fichiers). Mêmes opérations que les
// server actions prévues dans replica/architecture.md, pour que Supabase la remplace
// sans toucher aux écrans.

import { seedPages } from "./seed";
import {
  DataError,
  type Page,
  type PageContent,
  type PageMeta,
  type PageSummary,
  type Placement,
  type Profile,
  type SaveResult,
  type SearchHit,
  type Section,
  type Theme,
  type Workspace,
} from "./types";

const STORAGE_KEY = "ws:v1";
const TRASH_RETENTION_DAYS = 30;
const RECENT_MAX = 20;

/** Page telle que stockée : `position` ordonne les sœurs, `contentVersion` détecte les conflits d'édition. */
type Stored = Page & { position: number; contentVersion: number };

type State = {
  signedIn: boolean;
  profile: Profile | null;
  workspace: Workspace | null;
  pages: Record<string, Stored>;
  favorites: string[];
  recent: string[];
};

const empty = (): State => ({ signedIn: false, profile: null, workspace: null, pages: {}, favorites: [], recent: [] });

/* ------------------------------------------------------------ persistance */

let state: State = empty();
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...empty(), ...JSON.parse(raw) };
  } catch {
    state = empty();
  }
  purgeOldTrash();
  // Un autre onglet a modifié les données : on recharge et on prévient les écrans.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      state = e.newValue ? { ...empty(), ...JSON.parse(e.newValue) } : empty();
    } catch {
      state = empty();
    }
    emit();
  });
}

function emit() {
  version++;
  listeners.forEach((l) => l());
}

/** Écrit l'état. Lève DataError("quota") si le navigateur refuse (stockage plein). */
function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new DataError("quota", "Le stockage du navigateur est plein.");
  }
  emit();
}

export function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Change à chaque modification ; sert de snapshot pour useSyncExternalStore. */
export function getVersion() {
  load();
  return version;
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

function childrenOf(parentId: string | null, section: Section, includeTrash = false) {
  return Object.values(state.pages)
    .filter((p) => p.parentId === parentId && (parentId !== null || p.section === section) && (includeTrash || !p.inTrash))
    .sort((a, b) => a.position - b.position);
}

function hasLiveChildren(id: string) {
  return Object.values(state.pages).some((p) => p.parentId === id && !p.inTrash);
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
    hasChildren: hasLiveChildren(p.id),
  };
}

function ancestors(id: string): Page[] {
  const out: Page[] = [];
  let cur = state.pages[id]?.parentId ?? null;
  while (cur) {
    const p = state.pages[cur];
    if (!p) break;
    out.unshift(p);
    cur = p.parentId;
  }
  return out;
}

function descendants(id: string): Stored[] {
  const out: Stored[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of Object.values(state.pages)) {
      if (p.parentId === cur) {
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

function purgeOldTrash() {
  const limit = Date.now() - TRASH_RETENTION_DAYS * 86400000;
  let changed = false;
  for (const p of Object.values(state.pages)) {
    if (p.inTrash && p.trashedAt && Date.parse(p.trashedAt) < limit) {
      delete state.pages[p.id];
      changed = true;
    }
  }
  if (changed) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
}

/* ---------------------------------------------------------------- compte */

export function getSession(): { profile: Profile | null; workspace: Workspace | null } {
  load();
  if (!state.signedIn) return { profile: null, workspace: null };
  return { profile: state.profile, workspace: state.workspace };
}

/** Mode local : le code n'est pas vérifié (aucun e-mail n'est envoyé). */
export async function sendLoginCode(email: string) {
  load();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  return { ok: true as const };
}

export async function verifyLoginCode(email: string, code: string) {
  load();
  if (!/^\d{6}$/.test(code)) throw new Error("Le code contient 6 chiffres.");
  if (!state.profile || state.profile.email !== email) {
    // Nouvel utilisateur (ou autre adresse) : on repart d'un état vierge.
    state = { ...empty(), profile: { id: uid(), email, name: "", theme: state.profile?.theme ?? "system" } };
  }
  state.signedIn = true;
  commit();
  return { profile: state.profile!, needsWorkspace: !state.workspace };
}

/** Les données restent dans le navigateur : se reconnecter avec la même adresse les retrouve. */
export async function signOut() {
  load();
  state.signedIn = false;
  commit();
}

export async function createWorkspace(input: { userName: string; workspaceName: string }) {
  load();
  if (!state.profile) throw new DataError("unauthenticated", "Non connecté.");
  state.profile = { ...state.profile, name: input.userName.trim() };
  state.workspace = { id: uid(), name: input.workspaceName.trim() || "Mon espace", icon: null };
  state.pages = {};
  for (const seed of seedPages(state.workspace.id, state.profile.id)) state.pages[seed.id] = seed;
  commit();
  return state.workspace;
}

export async function updateProfile(patch: Partial<Pick<Profile, "name" | "theme">>) {
  load();
  if (!state.profile) throw new DataError("unauthenticated", "Non connecté.");
  state.profile = { ...state.profile, ...patch };
  commit();
  return state.profile;
}

export async function updateWorkspace(patch: Partial<Pick<Workspace, "name" | "icon">>) {
  load();
  const ws = requireWorkspace();
  state.workspace = { ...ws, ...patch };
  commit();
  return state.workspace;
}

/** Efface toutes les données locales (réglages > zone de danger). */
export async function resetEverything() {
  state = empty();
  localStorage.removeItem(STORAGE_KEY);
  await clearFiles();
  emit();
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
  commit();
  return state.pages[map.get(id)!];
}

/** Met à la corbeille (ou restaure) une page et toutes ses sous-pages. */
export async function setTrash(id: string, trash: boolean) {
  load();
  const p = requirePage(id);
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
  state.favorites = state.favorites.filter((f) => state.pages[f]);
  state.recent = state.recent.filter((r) => state.pages[r]);
  commit();
}

export function listTrash(): (PageSummary & { path: string })[] {
  load();
  return Object.values(state.pages)
    // Une sous-page supprimée avec son parent n'apparaît qu'une fois, via le parent.
    .filter((p) => p.inTrash && !(p.parentId && state.pages[p.parentId]?.inTrash && state.pages[p.parentId]?.trashedAt === p.trashedAt))
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
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function filesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Stocke un fichier et renvoie une URL interne `local-file:<id>`, résolue à l'affichage. */
export async function uploadFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Fichier trop lourd (20 Mo maximum en mode local).");
  const id = uid();
  const db = await filesDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return `local-file:${id}`;
}

const objectUrls = new Map<string, string>();

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
