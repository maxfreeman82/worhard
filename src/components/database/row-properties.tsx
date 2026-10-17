"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { useDatabaseData, type Page } from "@/lib/data";
import { Cell } from "./cell";
import { AddPropertyMenu, PropertyMenu } from "./property-menu";
import { PropertyIcon } from "./property-icon";

/** Propriétés d'une ligne, en liste « nom : valeur », éditables. Affichées en tête de la page de la ligne. */
export function RowProperties({ row, readOnly }: { row: Page; readOnly?: boolean }) {
  const data = useDatabaseData(row.rowOf ?? "");
  const [openProp, setOpenProp] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!data) return null;
  const { database, resolve } = data;
  const props = database.properties.filter((p) => p.type !== "title");

  return (
    <div className="flex flex-col gap-0.5 py-2" role="group" aria-label="Propriétés">
      {props.map((p) => (
        <div key={p.id} className="flex min-h-[34px] items-start gap-1">
          <Popover open={openProp === p.id} onOpenChange={(o) => setOpenProp(o ? p.id : null)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={readOnly}
                className="flex h-[34px] w-[160px] shrink-0 items-center gap-2 rounded-sm px-2 text-left text-sm text-muted hover:bg-surface-hover disabled:hover:bg-transparent max-sm:w-[120px]"
              >
                <PropertyIcon type={p.type} className="size-4 shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            </PopoverTrigger>
            {openProp === p.id && (
              <PopoverContent className="p-0">
                <PropertyMenu database={database} prop={p} view={null} resolve={resolve} onClose={() => setOpenProp(null)} />
              </PopoverContent>
            )}
          </Popover>
          <div className="min-h-[34px] min-w-0 flex-1 [&>*]:min-h-[34px]">
            <Cell row={row} prop={p} database={database} resolve={resolve} mode="panel" readOnly={readOnly} />
          </div>
        </div>
      ))}
      {!readOnly && (
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild>
            <button type="button" className="flex h-[34px] w-fit items-center gap-2 rounded-sm px-2 text-sm text-muted hover:bg-surface-hover">
              <Plus aria-hidden className="size-4" />
              Ajouter une propriété
            </button>
          </PopoverTrigger>
          {adding && (
            <PopoverContent className="p-0">
              <AddPropertyMenu database={database} onDone={() => setAdding(false)} />
            </PopoverContent>
          )}
        </Popover>
      )}
    </div>
  );
}
