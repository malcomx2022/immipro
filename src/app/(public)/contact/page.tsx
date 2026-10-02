import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TexteJuridique } from "@/components/juridique/TexteJuridique";
import { MODELES } from "@/domain/juridique/modeles";
import { texteServi } from "@/server/juridique/lecture";

/**
 * Contact — Q.A, servie depuis S.101.
 *
 * La page n'existe pour le public qu'à partir de la première validation
 * du texte dans le back-office (`/textes-juridiques`). Avant, elle répond
 * « introuvable » : un texte juridique faux est pire qu'une page absente.
 *
 * `force-dynamic` : la construction tourne sans base de données, et une
 * validation doit se voir à la seconde, sans redéploiement.
 */
export const dynamic = "force-dynamic";

const MODELE = MODELES["contact"];

export async function generateMetadata(): Promise<Metadata> {
  return { title: MODELE.titre, description: MODELE.chapeau };
}

export default async function Page() {
  const texte = await texteServi("contact");
  if (!texte) notFound();
  return <TexteJuridique texte={texte} />;
}
