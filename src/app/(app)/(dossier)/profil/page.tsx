import type { Metadata } from "next";
import { Profil } from "./Profil";

/**
 * C-02 — Profil. WF-02.
 *
 * Le prototype affichait « Profil rempli 80 % ». Le pourcentage tombe sous
 * l'arbitrage C-09 : il ne dit pas quoi faire. Le décompte du prototype —
 * « Il manque 1 champ » — le remplace, et dit à quoi sert le champ suivant.
 */
export const metadata: Metadata = {
  title: "Mon profil",
  description: "Ces informations adaptent votre checklist.",
};

export default function PageProfil() {
  return <Profil />;
}
