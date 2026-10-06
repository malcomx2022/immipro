import type { Metadata } from "next";
import { Inscription } from "./Inscription";
import { redirect } from "next/navigation";
import { pagesPubliees } from "@/server/juridique/lecture";
import { acteurCourant } from "@/server/securite/page";
import { suiteInterne } from "@/domain/comptes/suite";

/**
 * A-01 — Inscription. WF-02.
 *
 * Une seule case à cocher ici, pour les conditions. Le consentement au
 * traitement des pièces d'identité est demandé séparément, au premier
 * téléversement (RG-02.1) : le mélanger aux conditions le rendrait subi.
 */
export const metadata: Metadata = {
  title: "Créer un compte",
  description: "Crée ton compte ImmiPro pour ouvrir et suivre un dossier.",
};

/** La case nomme des textes publiés ou non : cela se lit en base, à chaque visite (S.101). */
export const dynamic = "force-dynamic";

/**
 * Une personne déjà connectée n'a rien à créer — 06/10/2026, suite de S.102.
 *
 * « Choisir un pack » sur `/tarifs` menait ici même connecté. La page des
 * tarifs reste statique (Q.B) et ne peut pas lire la session : c'est donc
 * l'inscription, déjà rendue à la demande, qui renvoie une personne
 * connectée vers la suite demandée — l'ouverture de dossier, où le pack se
 * choisit — ou vers son tableau de bord. La suite passe par la même règle
 * que la connexion : aucune adresse externe ou détournée.
 */
export default async function PageInscription({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  if ((await acteurCourant()) !== null) {
    redirect(suiteInterne((await searchParams).suite) ?? "/tableau-de-bord");
  }
  return <Inscription publiees={await pagesPubliees()} />;
}
