"use client";

import { Inbox } from "lucide-react";
import { useEffect } from "react";
import { BareTopBar } from "@/components/shell/bare-top-bar";
import { EmptyState } from "@/components/ui/display";

// S12 : arrive avec la phase 2 (mentions, commentaires, invitations).
export default function InboxPage() {
  useEffect(() => {
    document.title = "Boîte de réception";
  }, []);
  return (
    <>
      <BareTopBar />
      <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={<Inbox className="size-10" />}
        title="Rien de nouveau"
        body="Les mentions, réponses et invitations s'afficheront ici quand le travail en équipe sera disponible."
      />
      </div>
    </>
  );
}
