import type { Metadata } from "next";
import { Verification } from "./Verification";

/**
 * A-03 — Vérification de l'adresse email. WF-02.
 *
 * L'écran n'est pas un péage : « Plus tard » existe, et la conséquence du
 * report est écrite — sans adresse vérifiée, pas d'alerte de changement de
 * règles, mais le dossier reste consultable.
 */
export const metadata: Metadata = {
  title: "Vérifier ton adresse email",
  description: "Saisis le code à six chiffres reçu par email.",
};

export default function PageVerification() {
  return <Verification />;
}
