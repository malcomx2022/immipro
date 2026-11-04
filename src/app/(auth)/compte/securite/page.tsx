import type { Metadata } from "next";
import { Securite } from "./Securite";
import { exigerCandidat } from "@/server/securite/page";
import { etatDeSecurite } from "@/server/acces/profil";
import { etatDuSecondFacteur } from "@/server/comptes/second-facteur";
import { estInterne, type RoleDeCompte } from "@/domain/comptes/hierarchie";

/**
 * « Sécurité » — S.210. Partagé par les candidats et les comptes
 * internes : le mot de passe, les sessions ouvertes et la double
 * authentification (S.214).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sécurité du compte",
  description: "Mot de passe, sessions ouvertes et double authentification.",
};

export default async function PageSecurite() {
  const acteur = await exigerCandidat("/compte/securite");
  const [etat, secondFacteur] = await Promise.all([
    etatDeSecurite(acteur.id),
    etatDuSecondFacteur(acteur.id),
  ]);
  return (
    <Securite
      email={acteur.email}
      etat={etat}
      secondFacteur={secondFacteur}
      retour={estInterne(acteur.role as RoleDeCompte) ? "/mon-compte" : "/compte"}
    />
  );
}
