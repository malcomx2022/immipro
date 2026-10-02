import type { Metadata } from "next";
import { TextesJuridiques } from "./TextesJuridiques";
import { etatDesTextes } from "@/server/juridique/lecture";
import { exigerAdmin } from "@/server/securite/page";
import { jourCivil } from "@/domain/format/fuseau";

/**
 * Textes juridiques — S.101.
 *
 * Les variables des quatre textes (mentions légales, conditions, données
 * personnelles, contact), leur aperçu, et l'acte qui les rend publics.
 * Réservé à l'administration : un veilleur relit la réglementation, il
 * n'engage pas l'éditeur.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Textes juridiques" };

export default async function PageTextesJuridiques() {
  await exigerAdmin("/textes-juridiques");
  const { valeurs, textes } = await etatDesTextes();
  return <TextesJuridiques valeurs={valeurs} textes={textes} aujourdhui={jourCivil(new Date())} />;
}
