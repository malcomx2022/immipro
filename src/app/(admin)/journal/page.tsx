import type { Metadata } from "next";
import { Journal } from "./Journal";
import { ECRITURES_AUDIT } from "@/lib/contenu/backoffice";

/** B-06 — Journal d'audit. WF-15. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal d'audit",
  description: "Écritures non modifiables, conservées cinq ans.",
};

export default function PageJournal() {
  const au = new Date().toISOString().slice(0, 10);
  const du = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return <Journal ecritures={ECRITURES_AUDIT} periode={{ du, au }} />;
}
