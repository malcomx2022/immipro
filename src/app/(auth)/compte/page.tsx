import type { Metadata } from "next";
import { IdentiteDuCompteForm } from "./IdentiteDuCompte";
import { exigerCandidat } from "@/server/securite/page";
import { identiteDuCompte } from "@/server/acces/profil";
import { estInterne, type RoleDeCompte } from "@/domain/comptes/hierarchie";

/**
 * « Mon compte » — identité du compte, S.208.
 *
 * Rendu à la demande et derrière la garde : l'identité se relit en base à
 * chaque ouverture, et C-02 (`/profil`) écrit aussi le prénom, le nom et le
 * téléphone. Un compte interne y a accès comme un candidat ; il n'y trouve
 * pas le lien de suppression, qui ne le concerne pas (RG-10.4).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon compte",
  description: "Prénom, nom, téléphone, date de naissance, pays, langue et fuseau horaire.",
};

export default async function PageMonCompte() {
  const acteur = await exigerCandidat("/compte");
  const identite = await identiteDuCompte(acteur.id);
  return <IdentiteDuCompteForm initial={identite} interne={estInterne(acteur.role as RoleDeCompte)} />;
}
