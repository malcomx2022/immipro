import type { Metadata } from "next";
import { Utilisateurs } from "./Utilisateurs";
import { comptes } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";
import type { RoleDeCompte } from "@/domain/comptes/hierarchie";

/** B-03 — Utilisateurs. WF-15. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Utilisateurs",
  description: "Comptes, consentements et demandes de suppression.",
};

export default async function PageUtilisateurs() {
  const acteur = await exigerAdmin("/utilisateurs");
  return (
    <Utilisateurs
      comptes={await comptes()}
      acteur={{ id: acteur.id, role: acteur.role as RoleDeCompte }}
    />
  );
}
