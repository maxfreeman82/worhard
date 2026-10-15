"use client";

import {
  Calendar,
  Copy,
  FileText,
  Inbox,
  Kanban,
  Link2,
  List,
  Moon,
  Palette,
  Search,
  Settings,
  Sun,
  Table2,
  Trash2,
} from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import {
  Avatar,
  AvatarStack,
  BLOCK_COLORS,
  BLOCK_COLOR_LABELS,
  Breadcrumb,
  Callout,
  EmptyState,
  Kbd,
  SidebarItem,
  SidebarSection,
  Skeleton,
  Spinner,
  Tag,
  ToastProvider,
  useToast,
  ViewTabs,
  blockText,
} from "@/components/ui/display";
import { Checkbox, Input, SearchInput, Switch } from "@/components/ui/field";
import {
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuTrigger,
  Modal,
  ModalContent,
  ModalTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipProvider,
} from "@/components/ui/overlay";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border py-8">
      <h2 id={id} className="mb-4 text-h3 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
      <div className="w-36 shrink-0 text-xs text-muted">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// Thème effectif : choix enregistré (<html data-theme>), sinon celui du système.
const darkQuery = "(prefers-color-scheme: dark)";
function isDark() {
  const forced = document.documentElement.dataset.theme;
  return forced ? forced === "dark" : window.matchMedia(darkQuery).matches;
}
function subscribeTheme(onChange: () => void) {
  const mq = window.matchMedia(darkQuery);
  mq.addEventListener("change", onChange);
  window.addEventListener("themechange", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("themechange", onChange);
  };
}

function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    window.dispatchEvent(new Event("themechange"));
  };
  return (
    <Button size="sm" variant="ghost" onClick={toggle} icon={dark ? <Sun className="size-4" /> : <Moon className="size-4" />}>
      {dark ? "Thème clair" : "Thème sombre"}
    </Button>
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <>
      <Button onClick={() => toast({ title: "Page déplacée vers la corbeille", tone: "info", action: { label: "Annuler", onClick: () => {} } })}>
        Toast info
      </Button>
      <Button onClick={() => toast({ title: "Lien copié", tone: "success" })}>Toast succès</Button>
      <Button onClick={() => toast({ title: "Impossible d'enregistrer. Nouvel essai…", tone: "error" })}>Toast erreur</Button>
    </>
  );
}

export default function DesignPage() {
  const [check, setCheck] = useState(true);
  const [sw, setSw] = useState(false);
  const [view, setView] = useState("t");
  const [expanded, setExpanded] = useState(true);
  const [showProps, setShowProps] = useState(true);

  return (
    <TooltipProvider>
      <ToastProvider>
        <div className="mx-auto max-w-[960px] px-6 pb-24 sm:px-12">
          <header className="flex items-center justify-between py-8">
            <div>
              <h1 className="text-title font-bold">Système de design</h1>
              <p className="text-sm text-muted">Composants de base, tous leurs états. Chaque couleur vient d&apos;un token.</p>
            </div>
            <ThemeToggle />
          </header>

          <Section id="type" title="Typographie">
            <p className="text-title font-bold">Titre de page 40</p>
            <p className="text-h1 font-semibold">Titre 1 · 30</p>
            <p className="text-h2 font-semibold">Titre 2 · 24</p>
            <p className="text-h3 font-semibold">Titre 3 · 20</p>
            <p className="text-base">Texte de bloc 16/24. Un paragraphe se lit sur la largeur de page de 708 px.</p>
            <p className="text-sm">Interface 14/20 : sidebar, menus, cellules.</p>
            <p className="text-xs text-muted">Métadonnées 12/16 · Modifié il y a 3 min</p>
            <p className="text-2xs font-medium text-muted">LIBELLÉ DE SECTION 11</p>
            <p className="mt-2 font-serif text-base">Option serif : Source Serif 4.</p>
            <p className="font-mono text-sm">Option mono : JetBrains Mono · const x = 42;</p>
          </Section>

          <Section id="colors" title="Couleurs de contenu (texte et surlignage)">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
              {BLOCK_COLORS.map((c) => (
                <div key={c} className="flex flex-col gap-1 rounded-sm border border-border p-2">
                  <span className={`text-sm font-medium ${blockText(c)}`}>{BLOCK_COLOR_LABELS[c]}</span>
                  <Tag color={c}>{BLOCK_COLOR_LABELS[c]}</Tag>
                </div>
              ))}
            </div>
          </Section>

          <Section id="buttons" title="Boutons">
            <Row label="Variantes">
              <Button variant="primary">Partager</Button>
              <Button>Secondaire</Button>
              <Button variant="ghost">Discret</Button>
              <Button variant="danger" icon={<Trash2 className="size-4" />}>
                Supprimer
              </Button>
            </Row>
            <Row label="Tailles">
              <Button size="sm" variant="primary">Petit 28</Button>
              <Button size="md" variant="primary">Moyen 32</Button>
              <Button size="lg" variant="primary">Grand 40</Button>
            </Row>
            <Row label="États">
              <Button variant="primary" disabled>Désactivé</Button>
              <Button variant="primary" loading>Enregistrement</Button>
              <Button loading>Chargement</Button>
            </Row>
            <Row label="Icônes">
              <Tooltip label="Rechercher" shortcut="Ctrl+K">
                <IconButton label="Rechercher">
                  <Search className="size-4" />
                </IconButton>
              </Tooltip>
              <IconButton label="Boîte de réception">
                <Inbox className="size-4" />
              </IconButton>
              <IconButton label="Réglages">
                <Settings className="size-4" />
              </IconButton>
              <IconButton label="Désactivé" disabled>
                <Settings className="size-4" />
              </IconButton>
            </Row>
          </Section>

          <Section id="fields" title="Champs">
            <div className="grid max-w-[560px] gap-4">
              <Input label="E-mail" placeholder="nom@entreprise.fr" hint="On t'envoie un code de connexion." />
              <Input label="E-mail" defaultValue="nom@" error="Saisis une adresse e-mail valide." />
              <Input label="Désactivé" defaultValue="Lecture seule" disabled />
              <SearchInput aria-label="Rechercher" placeholder="Rechercher ou poser une question…" />
              <Checkbox checked={check} onCheckedChange={setCheck} label="Tâche cochée" />
              <Checkbox checked={false} disabled label="Case désactivée" />
              <Switch checked={sw} onCheckedChange={setSw} label="Pleine largeur" />
            </div>
          </Section>

          <Section id="overlays" title="Menus, popovers, modales, toasts">
            <Row label="Menu de bloc">
              <Menu>
                <MenuTrigger asChild>
                  <Button>Ouvrir le menu</Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>Texte</MenuLabel>
                  <MenuItem icon={<Copy className="size-4" />} shortcut="Ctrl+D">Dupliquer</MenuItem>
                  <MenuItem icon={<Link2 className="size-4" />} shortcut="Alt+Maj+L">Copier le lien du bloc</MenuItem>
                  <MenuSub label="Couleur" icon={<Palette className="size-4" />}>
                    {BLOCK_COLORS.map((c) => (
                      <MenuItem key={c} icon={<span className={`text-sm font-semibold ${blockText(c)}`}>A</span>}>
                        {BLOCK_COLOR_LABELS[c]}
                      </MenuItem>
                    ))}
                  </MenuSub>
                  <MenuCheckItem checked={showProps} onCheckedChange={setShowProps}>
                    Afficher les propriétés
                  </MenuCheckItem>
                  <MenuItem disabled icon={<FileText className="size-4" />}>Transformer en page (désactivé)</MenuItem>
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 className="size-4" />} shortcut="Suppr">
                    Supprimer
                  </MenuItem>
                </MenuContent>
              </Menu>
              <Popover>
                <PopoverTrigger asChild>
                  <Button>Popover</Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3">
                  <p className="mb-2 text-xs font-medium text-muted">Ajouter un lien</p>
                  <Input aria-label="Lien" placeholder="Coller un lien ou chercher une page" autoFocus />
                </PopoverContent>
              </Popover>
              <Modal>
                <ModalTrigger asChild>
                  <Button>Modale</Button>
                </ModalTrigger>
                <ModalContent title="Partager « Feuille de route »" description="Les sous-pages héritent de ces accès.">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input aria-label="Inviter" placeholder="E-mail ou nom" />
                    </div>
                    <Button variant="primary">Inviter</Button>
                  </div>
                </ModalContent>
              </Modal>
            </Row>
            <Row label="Toasts">
              <ToastDemo />
            </Row>
          </Section>

          <Section id="nav" title="Navigation">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="w-[240px] rounded-md bg-surface p-1">
                <SidebarItem icon={<Search className="size-4" />} label="Rechercher" />
                <SidebarItem icon={<Inbox className="size-4" />} label="Boîte de réception" />
                <SidebarSection label="Privé">
                  <SidebarItem
                    icon={<span>🚀</span>}
                    label="Feuille de route"
                    expandable
                    expanded={expanded}
                    onToggle={() => setExpanded(!expanded)}
                    onAdd={() => {}}
                    onMore={() => {}}
                  />
                  {expanded && (
                    <>
                      <SidebarItem icon={<FileText className="size-4" />} label="T4 · Lancement" depth={1} active onAdd={() => {}} onMore={() => {}} />
                      <SidebarItem icon={<span>📝</span>} label="Notes de réunion avec un titre très long" depth={1} onMore={() => {}} />
                    </>
                  )}
                  <SidebarItem icon={<span>📚</span>} label="Wiki" expandable onAdd={() => {}} onMore={() => {}} />
                </SidebarSection>
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <Breadcrumb items={[{ label: "Feuille de route", icon: "🚀" }, { label: "T4 · Lancement" }]} />
                <ViewTabs
                  views={[
                    { id: "t", name: "Tableau", icon: <Table2 className="size-4" /> },
                    { id: "b", name: "Kanban", icon: <Kanban className="size-4" /> },
                    { id: "c", name: "Calendrier", icon: <Calendar className="size-4" /> },
                    { id: "l", name: "Liste", icon: <List className="size-4" /> },
                  ]}
                  active={view}
                  onChange={setView}
                  onAdd={() => {}}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Tag color="green" dot>Terminé</Tag>
                  <Tag color="blue" dot>En cours</Tag>
                  <Tag color="default" dot>À faire</Tag>
                  <Tag color="orange" onRemove={() => {}}>Urgent</Tag>
                </div>
              </div>
            </div>
          </Section>

          <Section id="blocks" title="Blocs et contenu">
            <div className="flex max-w-[708px] flex-col gap-3">
              <Callout icon="💡">Les callouts mettent en avant une info. Toutes les couleurs de contenu sont disponibles.</Callout>
              <Callout icon="⚠️" color="red">Attention : cette page est partagée publiquement.</Callout>
              <blockquote className="border-l-[3px] border-fg pl-4 text-base">Une citation, avec une bordure à gauche.</blockquote>
              <pre className="overflow-x-auto rounded-sm bg-surface p-4 font-mono text-sm">
                <code>{`function bonjour(nom: string) {\n  return \`Bonjour \${nom}\`;\n}`}</code>
              </pre>
              <p className="text-base">
                Raccourcis : <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> pour chercher, <Kbd>/</Kbd> pour insérer un bloc.
              </p>
            </div>
          </Section>

          <Section id="people" title="Personnes et états">
            <Row label="Avatars">
              <Avatar name="Awa Diop" online />
              <Avatar name="Marc" size={28} />
              <AvatarStack people={[{ name: "Awa" }, { name: "Marc" }, { name: "Lina" }, { name: "Yao" }, { name: "Sam" }]} />
            </Row>
            <Row label="Chargement">
              <Spinner />
              <div className="flex w-56 flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Row>
            <div className="mt-4 max-w-[420px] rounded-md border border-border">
              <EmptyState
                icon={<Trash2 className="size-8" />}
                title="La corbeille est vide"
                body="Les pages supprimées restent ici 30 jours avant d'être effacées."
              />
            </div>
          </Section>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}
