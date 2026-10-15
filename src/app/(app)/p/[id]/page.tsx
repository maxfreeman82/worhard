"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/page/page-view";

export default function PageRoute() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <PageView id={id} />
    </Suspense>
  );
}
