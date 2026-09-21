import type { Metadata } from "next";
import { Consultants } from "./Consultants";
import { consultantsAdministres, destinationsOuvertes } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";

/**
 * B-09 — Consultants. WF-15, RG-12.1.
 *
 * L'écran que l'acteur ADM de WF-12 n'avait pas. Sans lui, `Accreditation`
 * n'avait aucun écrivain et l'annuaire candidat restait vide pour toutes
 * les destinations, définitivement.
 *
 * Rendu à la demande : la couverture se lit sur les règles publiées du
 * jour, et une destination ouverte ce matin doit apparaître comme
 * découverte ce matin.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Habilitations des consultants",
  description: "Habilitations vérifiées, par juridiction, et suspensions.",
};

export default async function PageConsultants() {
  await exigerAdmin("/habilitations");
  const [consultants, destinations] = await Promise.all([
    consultantsAdministres(),
    destinationsOuvertes(),
  ]);
  return <Consultants consultants={consultants} destinations={destinations} />;
}
