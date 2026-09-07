"use client";

import { Suspense } from "react";
import ListsManageView from "@/views/ListsManageView";

export default function ListesPage() {
  return (
    <Suspense fallback={null}>
      <ListsManageView />
    </Suspense>
  );
}
