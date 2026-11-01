import type { Metadata } from "next";
import { Securite } from "./Securite";
import { exigerCandidat } from "@/server/securite/page";
import { etatDeSecurite } from "@/server/acces/profil";
import { estInterne, type RoleDeCompte } from "@/domain/comptes/hierarchie";

/**
 * « Sécurité » — S.210. Partagé par les candidats et les comptes
 * internes : le mot de passe, les sessions ouvertes, et ce qui n'existe
 * pas encore (la double authentification), dit comme tel.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sécurité du compte",
  description: "Mot de passe, sessions ouvertes et fermeture de toutes les sessions.",
};

export default async function PageSecurite() {
  const acteur = await exigerCandidat("/compte/securite");
  const etat = await etatDeSecurite(acteur.id);
  return (
    <Securite
      email={acteur.email}
      etat={etat}
      retour={estInterne(acteur.role as RoleDeCompte) ? "/mon-compte" : "/compte"}
    />
  );
}
