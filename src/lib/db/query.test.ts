// node --test src/lib/db/query.test.ts   (Node 24 lit le TypeScript sans outil)
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyView, calculate, cellValue, groupRows, matchGroup, toText } from "./query.ts";
import type { Database, Page, View } from "../data/types.ts";
import type { Resolver } from "../data/index.ts";

const opt = (id: string, name: string) => ({ id, name, color: "gray" as const });
const db: Database = {
  id: "db1",
  pageId: "c1",
  inline: false,
  nextUniqueId: 4,
  properties: [
    { id: "title", name: "Tâche", type: "title", config: {} },
    { id: "st", name: "Statut", type: "status", config: { options: [opt("todo", "À faire"), opt("doing", "En cours"), opt("done", "Terminé")] } },
    { id: "n", name: "Points", type: "number", config: { numberFormat: "number" } },
    { id: "tags", name: "Étiquettes", type: "multi_select", config: { options: [opt("a", "Site"), opt("b", "Contenu")] } },
    { id: "due", name: "Échéance", type: "date", config: {} },
    { id: "ok", name: "Validé", type: "checkbox", config: {} },
    { id: "rel", name: "Projet", type: "relation", config: { relation: { databaseId: "db2" } } },
    { id: "roll", name: "Budget projet", type: "rollup", config: { rollup: { relationPropertyId: "rel", targetPropertyId: "budget", fn: "sum" } } },
  ],
};
const db2: Database = {
  id: "db2",
  pageId: "c2",
  inline: false,
  nextUniqueId: 1,
  properties: [
    { id: "title", name: "Projet", type: "title", config: {} },
    { id: "budget", name: "Budget", type: "number", config: {} },
  ],
};

const page = (id: string, title: string, props: Page["props"], rowOf = "db1"): Page => ({
  id,
  workspaceId: "w",
  parentId: null,
  section: "workspace",
  title,
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
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  lastEditedBy: null,
  rowOf,
  props,
});

const p1 = page("p1", "Site vitrine", { budget: 1000 }, "db2");
const p2 = page("p2", "Brochure", { budget: 250 }, "db2");
const rows = [
  page("r1", "Écrire l'accueil", { st: "doing", n: 3, tags: ["a", "b"], due: { start: "2026-10-20" }, ok: true, rel: ["p1", "p2"] }),
  page("r2", "Tester", { st: "todo", n: 5, tags: ["a"], due: { start: "2026-10-10" }, ok: false, rel: ["p1"] }),
  page("r3", "Publier", { st: "done", n: null, tags: [], due: null, ok: false, rel: [] }),
];
const all = [...rows, p1, p2];
const resolve: Resolver = {
  page: (id) => all.find((p) => p.id === id) ?? null,
  database: (id) => (id === "db1" ? db : id === "db2" ? db2 : null),
  rows: (id) => all.filter((p) => p.rowOf === id),
  person: () => null,
};
const view = (config: Partial<View["config"]>): View => ({
  id: "v",
  databaseId: "db1",
  name: "v",
  type: "table",
  position: 1,
  config: { filter: { id: "f", mode: "and", items: [] }, sorts: [], visible: [], ...config },
});
const titles = (ps: Page[]) => ps.map((p) => p.title);

test("filtre texte sans accents ni casse", () => {
  const v = view({ filter: { id: "f", mode: "and", items: [{ id: "1", propertyId: "title", op: "contains", value: "ECRIRE" }] } });
  assert.deepEqual(titles(applyView(rows, db, v, resolve)), ["Écrire l'accueil"]);
});

test("groupe OU imbriqué dans un ET", () => {
  const v = view({
    filter: {
      id: "f",
      mode: "and",
      items: [
        { id: "1", propertyId: "tags", op: "contains", value: "a" },
        { id: "g", mode: "or", items: [{ id: "2", propertyId: "st", op: "is", value: "todo" }, { id: "3", propertyId: "n", op: "gt", value: 4 }] },
      ],
    },
  });
  assert.deepEqual(titles(applyView(rows, db, v, resolve)), ["Tester"]);
});

test("filtres de date et vides", () => {
  const before = view({ filter: { id: "f", mode: "and", items: [{ id: "1", propertyId: "due", op: "before", value: "2026-10-15" }] } });
  assert.deepEqual(titles(applyView(rows, db, before, resolve)), ["Tester"]);
  const empty = view({ filter: { id: "f", mode: "and", items: [{ id: "1", propertyId: "due", op: "is_empty", value: null }] } });
  assert.deepEqual(titles(applyView(rows, db, empty, resolve)), ["Publier"]);
});

test("un filtre sans valeur ne cache rien", () => {
  const v = view({ filter: { id: "f", mode: "and", items: [{ id: "1", propertyId: "title", op: "contains", value: "" }] } });
  assert.equal(applyView(rows, db, v, resolve).length, 3);
});

test("tri par nombre décroissant, vides à la fin", () => {
  const v = view({ sorts: [{ propertyId: "n", dir: "desc" }] });
  assert.deepEqual(titles(applyView(rows, db, v, resolve)), ["Tester", "Écrire l'accueil", "Publier"]);
});

test("tri par statut selon l'ordre des options", () => {
  const v = view({ sorts: [{ propertyId: "st", dir: "asc" }] });
  assert.deepEqual(titles(applyView(rows, db, v, resolve)), ["Tester", "Écrire l'accueil", "Publier"]);
});

test("tris multiples", () => {
  const v = view({ sorts: [{ propertyId: "ok", dir: "asc" }, { propertyId: "title", dir: "asc" }] });
  assert.deepEqual(titles(applyView(rows, db, v, resolve)), ["Publier", "Tester", "Écrire l'accueil"]);
});

test("recherche dans toutes les propriétés", () => {
  assert.deepEqual(titles(applyView(rows, db, view({}), resolve, "contenu")), ["Écrire l'accueil"]);
});

test("groupes par statut et par sélection multiple", () => {
  const st = groupRows(rows, db.properties[1], resolve);
  assert.deepEqual(st.map((g) => [g.label, g.rows.length]), [["À faire", 1], ["En cours", 1], ["Terminé", 1]]);
  const tags = groupRows(rows, db.properties[3], resolve);
  assert.deepEqual(tags.map((g) => [g.label, g.rows.length]), [["Sans étiquettes", 1], ["Site", 2], ["Contenu", 1]]);
});

test("agrégation : somme du budget des projets liés", () => {
  const roll = db.properties.find((p) => p.id === "roll")!;
  assert.equal(cellValue(rows[0], roll, resolve), 1250);
  assert.equal(cellValue(rows[2], roll, resolve), 0);
});

test("calculs de pied de colonne", () => {
  const n = db.properties[2];
  assert.equal(calculate("sum", rows, n, resolve), "8");
  assert.equal(calculate("average", rows, n, resolve), "4");
  assert.equal(calculate("percent_empty", rows, n, resolve), "33 %");
  assert.equal(calculate("checked", rows, db.properties[5], resolve), "1");
});

test("texte affiché d'une relation et d'une sélection multiple", () => {
  assert.equal(toText(cellValue(rows[0], db.properties[6], resolve), db.properties[6], resolve), "Site vitrine, Brochure");
  assert.equal(toText(cellValue(rows[0], db.properties[3], resolve), db.properties[3], resolve), "Site, Contenu");
});

test("groupe vide = tout passe", () => {
  assert.equal(matchGroup(rows[0], { id: "x", mode: "or", items: [] }, db, resolve), true);
});
