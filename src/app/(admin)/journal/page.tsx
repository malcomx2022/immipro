import type { Metadata } from "next";
import { Journal } from "./Journal";
import { journal } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";

/** B-06 — Journal d'audit. WF-15, RG-15.1. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal d'audit",
  description: "Écritures non modifiables, conservées cinq ans.",
};

export default async function PageJournal() {
  await exigerAdmin("/journal");
  const au = new Date().toISOString().slice(0, 10);
  const du = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return <Journal ecritures={await journal()} periode={{ du, au }} />;
}
