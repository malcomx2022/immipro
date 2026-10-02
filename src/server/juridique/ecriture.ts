import { db } from "@/lib/db";
import { journaliser } from "@/server/acces/journal";
import { MODELES, PAGES_JURIDIQUES, type PageJuridique } from "@/domain/juridique/modeles";
import {
  RAISON_SANS_REPUBLICATION,
  motifDeRepublication,
  refusDeValidation,
  republication,
  type Attestation,
} from "@/domain/juridique/publication";
import { empreinte, rendre, variablesDuModele } from "@/domain/juridique/rendu";
import { verifierLesValeurs } from "@/domain/juridique/variables";
import { jourCivil } from "@/domain/format/fuseau";
import { derniereVersion, valeursDesVariables } from "./lecture";

/**
 * Écriture des textes juridiques — S.101.
 *
 * Deux gestes, et deux seulement, chacun journalisé :
 *
 * - **enregistrer les variables**, qui republie aussitôt les textes déjà
 *   validés qui les emploient (décision du 02/10/2026) ;
 * - **valider un texte**, qui le publie en nommant son relecteur.
 *
 * Aucune fonction ici ne modifie ni ne supprime une version publiée.
 */

export type IssueDesVariables =
  | { ok: false; refus: Record<string, string> }
  | {
      ok: true;
      changees: readonly string[];
      republiees: readonly { page: PageJuridique; rang: number }[];
      inchangees: readonly { page: PageJuridique; raison: string }[];
    };

/** Le rang suivant d'une page : la première version vaut 1. */
async function rangSuivant(page: PageJuridique, tx: Pick<typeof db, "legalPublication">): Promise<number> {
  const max = await tx.legalPublication.aggregate({ where: { page }, _max: { rang: true } });
  return (max._max.rang ?? 0) + 1;
}

export async function enregistrerLesVariables(
  saisies: Readonly<Record<string, string>>,
  acteurId: string,
): Promise<IssueDesVariables> {
  const refus = verifierLesValeurs(saisies);
  if (Object.keys(refus).length > 0) return { ok: false, refus };

  const avant = await valeursDesVariables();
  const apres: Record<string, string> = { ...avant };
  const changees: string[] = [];
  for (const [cle, brute] of Object.entries(saisies)) {
    const valeur = brute.trim();
    if ((avant[cle] ?? "") === valeur) continue;
    apres[cle] = valeur;
    changees.push(cle);
  }
  if (changees.length === 0) return { ok: true, changees: [], republiees: [], inchangees: [] };

  const republiees: { page: PageJuridique; rang: number }[] = [];
  const inchangees: { page: PageJuridique; raison: string }[] = [];

  await db.$transaction(async (tx) => {
    for (const cle of changees) {
      await tx.legalVariable.upsert({
        where: { key: cle },
        create: { key: cle, value: apres[cle]!, updatedBy: acteurId },
        update: { value: apres[cle]!, updatedBy: acteurId },
      });
    }

    for (const page of PAGES_JURIDIQUES) {
      const modele = MODELES[page];
      if (!variablesDuModele(modele).some((c) => changees.includes(c))) continue;
      const derniere = await derniereVersion(page);
      const decision = republication(modele, derniere, apres);
      if (!decision.republier) {
        if (decision.raison !== "inchange") inchangees.push({ page, raison: RAISON_SANS_REPUBLICATION[decision.raison] });
        continue;
      }
      const rendu = rendre(modele, apres);
      const rang = await rangSuivant(page, tx);
      const changeesIci = variablesDuModele(modele).filter((c) => changees.includes(c));
      await tx.legalPublication.create({
        data: {
          page,
          rang,
          kind: "MISE_A_JOUR_VARIABLES",
          templateHash: empreinte(modele),
          title: rendu.titre,
          standfirst: rendu.chapeau,
          body: rendu.blocs,
          variables: rendu.employees,
          // La relecture porte sur le texte, qui n'a pas changé : elle se reprend.
          reviewer: derniere!.relecteur,
          reviewedAt: new Date(`${derniere!.relueLe}T00:00:00Z`),
          publishedBy: acteurId,
          reason: motifDeRepublication(changeesIci),
        },
      });
      republiees.push({ page, rang });
    }
  });

  await journaliser({
    acteurId,
    action: "juridique.variables",
    cible: "juridique:variables",
    motif: `Variables modifiées : ${changees.join(", ")}`,
    details: {
      changees: Object.fromEntries(changees.map((c) => [c, { avant: avant[c] ?? "", apres: apres[c] }])),
      republiees,
    },
  }).catch(() => undefined);
  for (const r of republiees) {
    await journaliser({
      acteurId,
      action: "juridique.publication",
      cible: `juridique:${r.page}`,
      motif: "Republication après modification des variables",
      details: { page: r.page, version: r.rang },
    }).catch(() => undefined);
  }

  return { ok: true, changees, republiees, inchangees };
}

export type IssueDeValidation =
  | { ok: false; refus: readonly string[] }
  | { ok: true; rang: number };

export async function validerUnTexte(
  page: PageJuridique,
  attestation: Attestation,
  acteurId: string,
  maintenant: Date = new Date(),
): Promise<IssueDeValidation> {
  const valeurs = await valeursDesVariables();
  const refus = refusDeValidation(page, valeurs, attestation, jourCivil(maintenant));
  if (refus.length > 0) return { ok: false, refus };

  const modele = MODELES[page];
  const rendu = rendre(modele, valeurs);
  const rang = await db.$transaction(async (tx) => {
    const r = await rangSuivant(page, tx);
    await tx.legalPublication.create({
      data: {
        page,
        rang: r,
        kind: "VALIDATION",
        templateHash: empreinte(modele),
        title: rendu.titre,
        standfirst: rendu.chapeau,
        body: rendu.blocs,
        variables: rendu.employees,
        reviewer: attestation.relecteur.trim(),
        reviewedAt: new Date(`${attestation.relueLe}T00:00:00Z`),
        publishedBy: acteurId,
        reason: attestation.motif.trim(),
      },
    });
    return r;
  });

  await journaliser({
    acteurId,
    action: "juridique.validation",
    cible: `juridique:${page}`,
    motif: attestation.motif.trim(),
    details: { page, version: rang, relecteur: attestation.relecteur.trim(), relueLe: attestation.relueLe },
  }).catch(() => undefined);

  return { ok: true, rang };
}
