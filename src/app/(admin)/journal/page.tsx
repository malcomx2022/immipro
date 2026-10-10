import type { Metadata } from "next";
import { Journal } from "./Journal";
import { journal } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";
import { jourCivil } from "@/domain/format/fuseau";

/** B-06 — Journal d'audit. WF-15, RG-15.1. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal d'audit",
  description: "Écritures non modifiables, conservées cinq ans.",
};

export default async function PageJournal() {
  await exigerAdmin("/journal");
  // Un seul instant pour les deux bornes : les deux lectures d'horloge
  // pouvaient tomber de part et d'autre de minuit (S.164).
  const maintenant = new Date();
  const au = jourCivil(maintenant);
  const du = new Date(maintenant.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return <Journal ecritures={await journal()} periode={{ du, au }} />;
}
