import type { Metadata } from "next";
import { Verification } from "./Verification";
import { acteurCourant } from "@/server/securite/page";

/**
 * A-03 — Vérification de l'adresse email. WF-02.
 *
 * L'écran n'est pas un péage : « Plus tard » existe, et la conséquence du
 * report est écrite — sans adresse vérifiée, pas d'alerte de changement de
 * règles, mais le dossier reste consultable.
 *
 * L'adresse du compte est lue ici pour être écrite à l'écran : c'est en la
 * lisant qu'on repère une faute de frappe, et la correction est sur place.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vérifier ton adresse email",
  description: "Saisis le code à six chiffres reçu par email.",
};

export default async function PageVerification() {
  const acteur = await acteurCourant();
  return <Verification email={acteur?.email ?? null} />;
}
