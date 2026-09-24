import type { Metadata } from "next";
import { PreferencesDeRappels } from "./PreferencesDeRappels";
import { exigerCandidat } from "@/server/securite/page";
import { etatDesRappels } from "@/server/comptes/rappels";

/**
 * Préférences de rappel d'échéance — S.87, RG-09.4.
 *
 * Rendu à la demande et derrière la garde : l'état du canal email se lit
 * au moment où l'écran s'ouvre, et une page figée au déploiement le
 * dirait opérationnel ou en panne pour toujours.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes rappels d'échéance",
  description: "Activer ou couper les rappels, choisir le canal, le fuseau et le délai d'alerte.",
};

export default async function PageRappels({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string }>;
}) {
  const acteur = await exigerCandidat("/compte/rappels");
  const { retour } = await searchParams;
  const etat = await etatDesRappels(acteur.id);
  return (
    <PreferencesDeRappels
      initial={etat.preferences}
      canal={etat.canal}
      dernier={
        etat.dernier
          ? { quand: etat.dernier.quand.toISOString(), courrier: etat.dernier.courrier }
          : null
      }
      // Seul un chemin interne est suivi : un paramètre de retour libre
      // ferait de l'écran une redirection ouverte.
      retour={retour && /^\/dossiers\/[\w-]+\/echeancier$/u.test(retour) ? retour : "/consentements"}
    />
  );
}
