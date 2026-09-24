import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import {
  RELEVE_VAUT_VERIFICATION,
  prochaineRelecture,
  type EtatSource,
} from "@/domain/backoffice/veille";

/**
 * Le relevé d'une source par le veilleur — WF-14 étape 2, B-01.
 *
 * ── Le relevé n'était écrit par personne ────────────────────────────
 *
 * `SourceCheck` porte `checkedAt`, `reachable`, `attempts` et
 * `difference` ; `collecte()` les lit ; l'écran les affiche ; **seule la
 * graine de démonstration en écrivait**. En production la table restait
 * vide pour toujours, et trois phrases promettaient un collecteur :
 *
 *     « le relevé automatique des sources n'a pas encore tourné »
 *     « Les 14 sources ont répondu ce matin et aucune ne diverge »
 *     « La prochaine collecte est programmée demain »
 *
 * Aucune n'était vraie. La colonne « écart » de la file et le compte
 * « N écarts détectés » du résumé lisaient la même table vide, et
 * `Collecte.prochaineLe` valait « dernier relevé + un jour » — un champ
 * calculé pour tenir une promesse que personne ne tenait.
 *
 * ── Trois conclusions, une seule qui vérifie ────────────────────────
 *
 * WF-14 étape 2 : « **le veilleur** consulte la source officielle,
 * compare, et conclut ». Le bouton n'offrait que « inchangé ». Les deux
 * autres conclusions — un écart vu, une source muette — ne s'écrivaient
 * nulle part, alors que l'écran lit `SourceCheck` pour afficher l'une et
 * l'autre.
 *
 * Seule `A_JOUR` avance `verifiedAt` et `nextReviewAt` : RG-14.4 fait de
 * `verifiedAt` la preuve de diligence, et l'avancer sur « je n'ai pas pu
 * joindre la source » dirait que la règle a été vérifiée alors qu'elle ne
 * l'a pas été — la fiche sortirait de la file de veille, qui est
 * précisément l'endroit où elle doit rester.
 *
 * ── Pourquoi la décision vit ici ────────────────────────────────────
 *
 * La même raison que `server/regles/publication`, `server/regles/edition`
 * et `server/revue/decision` : dans sa route, elle était derrière
 * `next/headers`, donc hors de portée de toute fumée. Celle-ci écrit deux
 * tables et compte des tentatives — ce qu'on ne vérifie qu'en l'exécutant.
 */

export interface Veilleur {
  id: string;
  email: string;
}

export interface Releve {
  conclusion: EtatSource;
  /** Nulle quand la conclusion ne vaut pas vérification. */
  relueLe: string | null;
  prochaineLe: string;
  republiee: boolean;
}

export async function consignerLeReleve(
  regleId: string,
  conclusion: EtatSource,
  note: string | undefined,
  veilleur: Veilleur,
  maintenant: Date = new Date(),
): Promise<Releve> {
  const fiche = await db.visaRule.findUnique({ where: { id: regleId } });
  if (!fiche) throw echec("introuvable");
  if (fiche.status === "ARCHIVED") {
    throw echec("etat_incompatible", {
      corps: "Une version archivée ne se relit plus. Repars de la version en vigueur.",
    });
  }

  const texte = note?.trim();
  if (conclusion !== "A_JOUR" && !texte) {
    throw echec("champs_invalides", {
      champs: {
        note:
          conclusion === "A_ARBITRER"
            ? "Dis ce qui a changé sur la source : c'est ce que lira celui qui écrira la version suivante."
            : "Dis ce que la source a répondu, ou n'a pas répondu. « Injoignable » seul ne se relit pas dans six mois.",
      },
    });
  }

  const jour = new Date(
    Date.UTC(
      maintenant.getUTCFullYear(),
      maintenant.getUTCMonth(),
      maintenant.getUTCDate(),
    ),
  );

  /**
   * Aucune colonne ne porte la date de révision connue d'une source.
   * La seconde moitié de RG-14.3 — « ramenée à 30 jours avant une date
   * connue de révision » — est donc écrite dans la fonction pure et
   * inatteignable depuis ici. Passer `null` est la lecture honnête :
   * inventer une colonne au passage ferait décider à cette route ce
   * qu'un veilleur doit saisir.
   */
  const echeance = prochaineRelecture(jour, null);

  /*
    Le relevé, et il est écrit pour de bon — 24/09/2026.

    `SourceCheck` porte `checkedAt`, `reachable`, `attempts` et
    `difference` ; `collecte()` les lit et l'écran les affiche. **Seule
    la graine de démonstration en écrivait.** En production la table
    restait vide, et trois phrases promettaient un collecteur : « le
    relevé automatique n'a pas encore tourné », « les 14 sources ont
    répondu », « la prochaine collecte est programmée demain ».

    Le relevé est le geste du veilleur — WF-14 étape 2 le dit : « **le
    veilleur** consulte la source officielle, compare, et conclut ». Il
    s'écrit donc ici, où la conclusion se prend.

    `attempts` compte les échecs qui se suivent sur la même adresse : un
    silence isolé n'est pas une panne installée, et c'est ce compte que
    l'écran d'incident cite.
  */
  const tentatives =
    conclusion === "PERIME"
      ? ((await db.sourceCheck.findFirst({
          where: { sourceUrl: fiche.sourceUrl },
          orderBy: { checkedAt: "desc" },
        })) ?? null)
      : null;
  await db.sourceCheck.create({
    data: {
      sourceUrl: fiche.sourceUrl,
      checkedAt: maintenant,
      reachable: conclusion !== "PERIME",
      attempts: tentatives && !tentatives.reachable ? tentatives.attempts + 1 : 1,
      ...(conclusion === "A_ARBITRER" ? { difference: texte! } : {}),
      ...(conclusion === "PERIME" ? { error: texte! } : {}),
    },
  });

  /*
    Et seule `A_JOUR` avance les dates. RG-14.4 fait de `verifiedAt` la
    preuve de diligence : l'avancer sur « je n'ai pas pu joindre la
    source » ou sur « j'ai vu un écart que je n'ai pas encore
    versionné » dirait que la règle a été vérifiée alors qu'elle ne l'a
    pas été — et la fiche sortirait de la file de veille, qui est
    précisément l'endroit où elle doit rester.
  */
  if (!RELEVE_VAUT_VERIFICATION[conclusion]) {
    return {
      conclusion,
      relueLe: null,
      prochaineLe: fiche.nextReviewAt.toISOString().slice(0, 10),
      republiee: false,
    };
  }

  // Le retour en brouillon par échéance est réversible : c'est ce que
  // la relecture vient de lever. Un brouillon en préparation, non.
  const republier = fiche.status === "DRAFT" && fiche.nextReviewAt < jour;

  const maj = await db.visaRule.update({
    where: { id: fiche.id },
    data: {
      verifiedAt: jour,
      verifiedBy: veilleur.email,
      nextReviewAt: echeance,
      ...(republier ? { status: "PUBLISHED" as const } : {}),
    },
  });

  if (republier) {
    await journaliser({
      acteurId: veilleur.id,
      action: "regle.republication",
      cible: `visaRule:${fiche.id}`,
      motif: `Remise en ligne après relecture : l'échéance du ${fiche.nextReviewAt
        .toISOString()
        .slice(0, 10)} l'avait dépubliée (RG-14.1)`,
      details: {
        pays: fiche.countryCode,
        type: fiche.visaType,
        version: fiche.version,
      },
    });
  }

  return {
    conclusion,
    relueLe: maj.verifiedAt.toISOString().slice(0, 10),
    prochaineLe: maj.nextReviewAt.toISOString().slice(0, 10),
    republiee: republier,
  };
}
