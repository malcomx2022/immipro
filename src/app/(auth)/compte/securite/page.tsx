import type { Metadata } from "next";
import { Securite } from "./Securite";
import { exigerCandidat } from "@/server/securite/page";
import { etatDeSecurite } from "@/server/acces/profil";
import { etatDuSecondFacteur } from "@/server/comptes/second-facteur";
import { estInterne, exigeSecondFacteur, type RoleDeCompte } from "@/domain/comptes/hierarchie";

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
  const role = acteur.role as RoleDeCompte;
  // S.215 : obligatoire pour un compte interne. Tant qu'elle n'est pas
  // active, « Mon compte interne » (back-office) est fermé : le retour mène
  // à l'espace candidat, que le compte garde.
  const obligatoire = exigeSecondFacteur(role);
  return (
    <Securite
      email={acteur.email}
      etat={etat}
      secondFacteur={secondFacteur}
      obligatoire={obligatoire}
      retour={estInterne(role) && secondFacteur.active ? "/mon-compte" : estInterne(role) ? "/tableau-de-bord" : "/compte"}
    />
  );
}
