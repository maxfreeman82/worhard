"use client";

// Point d'entrée unique des écrans vers les données.
// Aujourd'hui : implémentation locale (navigateur). Demain : Neon (serveur), mêmes signatures.
import { useMemo, useSyncExternalStore } from "react";
import * as store from "./local";

export * from "./types";
export {
  createPage,
  createWorkspace,
  deleteForever,
  duplicatePage,
  getContentVersion,
  markVisited,
  movePage,
  resetEverything,
  resolveFileUrl,
  savePageContent,
  sendLoginCode,
  setTrash,
  signOut,
  toggleFavorite,
  updatePageMeta,
  updateProfile,
  updateWorkspace,
  uploadFile,
  verifyLoginCode,
} from "./local";
export { blocksToText } from "./text";

/** Version des données ; -1 côté serveur et avant hydratation = « chargement ». */
function useVersion() {
  return useSyncExternalStore(store.subscribe, store.getVersion, () => -1);
}

/** Lit une valeur dérivée des données, recalculée à chaque modification. `undefined` pendant le chargement. */
function useData<T>(read: () => T, deps: unknown[]): T | undefined {
  const v = useVersion();
  const key = JSON.stringify(deps);
  // `read` change à chaque rendu ; la valeur ne dépend que de la version et des paramètres (key).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (v < 0 ? undefined : read()), [v, key]);
}

export const useSession = () => useData(() => store.getSession(), []);
export const usePage = (id: string) => useData(() => store.getPage(id), [id]);
export const usePath = (id: string) => useData(() => store.getPath(id), [id]);
export const useChildren = (parentId: string | null, section: "workspace" | "private" = "workspace") =>
  useData(() => store.listChildren(parentId, section), [parentId, section]);
export const useFavorites = () => useData(() => store.listFavorites(), []);
export const useIsFavorite = (id: string) => useData(() => store.isFavorite(id), [id]);
export const useRecent = (limit = 8) => useData(() => store.listRecent(limit), [limit]);
export const useTrash = () => useData(() => store.listTrash(), []);
export const useSearch = (q: string) => useData(() => store.search(q), [q]);
export const useTheme = () => useData(() => store.getTheme(), []);
