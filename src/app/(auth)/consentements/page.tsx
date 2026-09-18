import type { Metadata } from "next";
import { Consentements } from "./Consentements";

/**
 * A-05 — Consentements. WF-02, RG-02.1.
 *
 * Chaque autorisation est indépendante et révocable. Aucune n'est active au
 * premier passage, et le refus de l'analyse des pièces d'identité ne bloque
 * pas le compte : c'est écrit sur l'écran, et tenu par `ETAT_INITIAL`.
 */
export const metadata: Metadata = {
  title: "Mes consentements",
  description:
    "Chaque autorisation est indépendante et révocable à tout moment.",
};

export default function PageConsentements() {
  return <Consentements />;
}
