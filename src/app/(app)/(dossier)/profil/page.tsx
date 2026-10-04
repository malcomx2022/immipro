import type { Metadata } from "next";
import { Profil } from "./Profil";
import { db } from "@/lib/db";
import { exigerCandidat } from "@/server/securite/page";
import type { Profil as ProfilCandidat } from "@/domain/comptes/profil";

/**
 * C-02 — Profil. WF-02.
 *
 * Le prototype affichait « Profil rempli 80 % ». Le pourcentage tombe sous
 * l'arbitrage C-09 : il ne dit pas quoi faire. Le décompte — « Il manque 1
 * champ » — le remplace, et dit à quoi sert le champ suivant.
 *
 * Les champs vides le restent. Les pré-remplir avec des valeurs plausibles
 * ferait relire le formulaire une fois, sans jamais le corriger.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon profil",
  description: "Ces informations adaptent ta checklist.",
};

export default async function PageProfil() {
  const acteur = await exigerCandidat("/profil");
  const compte = await db.user.findUnique({
    where: { id: acteur.id },
    include: { profile: true },
  });

  const langues = compte?.profile?.languages;
  const anglais =
    typeof langues === "object" && langues !== null && "en" in langues
      ? String((langues as Record<string, unknown>).en)
      : undefined;

  const initial: ProfilCandidat = {
    ...(compte
      ? { nom: [compte.firstName, compte.lastName].filter(Boolean).join(" ") }
      : {}),
    ...(compte?.profile?.highestDegree ? { diplome: compte.profile.highestDegree } : {}),
    ...(anglais ? { anglais } : {}),
  };

  return (
    <Profil
      initial={initial}
      telephone={compte?.phone ?? ""}
      facturation={{ nom: compte?.billingName ?? "", adresse: compte?.billingAddress ?? "" }}
    />
  );
}
