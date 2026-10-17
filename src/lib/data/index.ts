"use client";

// Point d'entrée unique des écrans vers les données.
// Aujourd'hui : implémentation locale (navigateur). Demain : Neon (serveur), mêmes signatures.
import { useMemo, useSyncExternalStore } from "react";
import * as store from "./local";

export * from "./types";
export {
  addOption,
  addProperty,
  addRelation,
  changePropertyType,
  createDatabase,
  createRow,
  createView,
  defaultViewConfig,
  deleteOption,
  deleteProperty,
  deleteView,
  duplicateProperty,
  duplicateView,
  moveRow,
  moveView,
  PROPERTY_LABELS,
  updateOption,
  updateProperty,
  updateRowProp,
  updateView,
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

/** Accès en lecture synchrone pour le moteur de requêtes (relations, agrégations, personnes). */
export type Resolver = {
  page: (id: string) => import("./types").Page | null;
  database: (id: string) => import("./types").Database | null;
  rows: (databaseId: string) => import("./types").Page[];
  person: (id: string) => { id: string; name: string; email: string } | null;
};

const resolver: Resolver = {
  page: (id) => store.getPage(id),
  database: (id) => store.getDatabase(id),
  rows: (id) => store.listRows(id),
  person: (id) => store.listPeople().find((p) => p.id === id) ?? null,
};

/** Tout ce qu'il faut pour afficher une base : schéma, vues, lignes, page conteneur. */
export const useDatabaseData = (databaseId: string) =>
  useData(() => {
    const database = store.getDatabase(databaseId);
    if (!database) return null;
    return {
      database,
      container: store.getPage(database.pageId),
      views: store.listViews(databaseId),
      rows: store.listRows(databaseId),
      resolve: resolver,
    };
  }, [databaseId]);
export const useDatabases = () => useData(() => store.listDatabases(), []);
export const usePeople = () => useData(() => store.listPeople(), []);
export const useRowsOf = (databaseId: string | null | undefined) => useData(() => (databaseId ? store.listRows(databaseId) : []), [databaseId]);
export const useDatabase = (databaseId: string | null | undefined) => useData(() => (databaseId ? store.getDatabase(databaseId) : null), [databaseId]);
export const getResolver = () => resolver;
