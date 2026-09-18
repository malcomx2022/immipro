import type { Metadata } from "next";
import { ChoixDuPack } from "./ChoixDuPack";

/**
 * $-01 — Choix du pack. WF-05.
 *
 * La mise en avant vient de `pricing.ts` et ne présélectionne rien : un cadre
 * n'est pas un choix fait à la place du candidat. Les frais versés à
 * l'administration sont annoncés comme non inclus, sur l'écran qui parle
 * d'argent.
 */
export const metadata: Metadata = {
  title: "Choix du pack",
  description: "Un paiement unique, valable jusqu'à la clôture du dossier.",
};

export default function PagePack() {
  return <ChoixDuPack />;
}
