import type { VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import {
  avecLesTextesCandidat,
  textesCandidat,
  visaRulesSchema,
  SCHEMA_VERSION,
  type VisaRulesPayload,
} from "@/domain/rules/schema";
import {
  SUITE_DU_REFUS_EN_VIGUEUR,
  destinationDeLEnregistrement,
  estUnBrouillon,
  messageDeRefus,
  messageDeRefusPayload,
  verifierPayloadCandidat,
  verifierTextesCandidat,
  type ChampCandidat,
  type Regle,
  type VersionDeRegle,
} from "@/domain/backoffice/regle";

/**
 * Le moment où l'enregistrement de B-02 refuse une formulation — WF-14.
 *
 * ── Le garde-fou était au mauvais moment ────────────────────────────
 *
 * Le `PUT` de `api/admin/regles/[id]` levait sur `verifierPayloadCandidat`
 * avant toute écriture, et l'écran désactivait « Enregistrer le brouillon »
 * dès qu'un champ était refusé. `CLAUDE.md` tranche l'inverse :
 * « l'enregistrement d'un brouillon n'est pas bloqué, la publication
 * l'est. Un texte en cours d'écriture doit pouvoir être sauvé ; le refuser
 * pousserait à rédiger ailleurs et à coller à la fin, c'est-à-dire à écrire
 * hors du garde-fou. »
 *
 * C'est exactement la contradiction que J.C a levée pour B-08, restée
 * entière ici : `domain/backoffice/regle.ts` intitulait sa fonction
 * « validation à l'enregistrement », le commentaire de la route annonçait
 * « la publication est bloquée tant que la formulation est refusée », et le
 * code bloquait l'enregistrement.
 *
 * La distinction n'est pas « enregistrer ou publier », elle est **« le
 * candidat le verra-t-il »**. Une version en vigueur se réécrit par la même
 * commande que le brouillon, et `filtrePourCandidat` la sert : cet
 * enregistrement-là est une publication, et le refus lui est opposé avant
 * l'écriture. Un brouillon, non — `publierLaRegle` le refusera le jour où
 * il passera en vigueur, par `refusDuReferentiel`.
 *
 * ── Et il refusait ce que l'écran ne pouvait pas corriger ────────────
 *
 * Le contrôle portait sur tout `textesCandidat(payload)` : le libellé,
 * chaque `conditions[i].message_echec`, chaque `pieces_requises[i].libelle`
 * et chaque réserve. Or la branche `textes` n'écrit que le libellé et la
 * première réserve — le reste traverse tel quel, depuis la base.
 *
 * Une formulation refusée dans un `message_echec` rendait donc
 * inenregistrables les deux champs que le formulaire montre, avec un
 * message demandant de « reformuler le champ "conditions.3.message_echec" »
 * — un champ que B-02 n'affiche pas. Le refus interdisait la correction
 * qu'il réclamait, et n'ôtait rien de l'écran du candidat : la phrase y
 * était déjà, portée par la version en vigueur.
 *
 * Le refus porte donc sur ce que l'enregistrement **introduit**. La branche
 * `textes` soumet deux champs, et c'est sur eux qu'il tombe, nommés par
 * leur intitulé de formulaire. La branche `payload` soumet le payload
 * entier : tout ce qu'il contient vient de l'appelant, et tout y est
 * examiné. La publication garde sa propre lecture, celle du référentiel
 * complet — c'est là que la version entre en vigueur.
 *
 * ── Pourquoi la décision vit ici ────────────────────────────────────
 *
 * La même raison que `server/regles/publication.ts` et
 * `server/editorial/publication.ts` : dans sa route, elle était derrière
 * `next/headers`, donc hors de portée de toute fumée. Les deux assertions
 * qui la tenaient lisaient sa source et comptaient ses appels ; aucune ne
 * l'exécutait.
 */

/** Ce que l'enregistrement soumet, selon la branche employée par l'écran. */
export type Ecrit =
  | ({ champ: "textes" } & Pick<Regle, ChampCandidat>)
  | {
      champ: "payload";
      payload: VisaRulesPayload;
      /** Métadonnées que seul un éditeur complet renseigne (WF-14 étape 3). */
      sourceUrl?: string;
      nextReviewAt?: string;
      notes?: string;
    };

/** Une formulation refusée, ramenée à un chemin et à son message. */
interface Refus {
  chemin: string;
  message: string;
}

function refusDeLEcrit(ecrit: Ecrit): Refus[] {
  if (ecrit.champ === "textes") {
    return verifierTextesCandidat(ecrit).map((faute) => ({
      chemin: faute.champ,
      message: messageDeRefus(faute),
    }));
  }
  return verifierPayloadCandidat(textesCandidat(ecrit.payload)).map((faute) => ({
    chemin: faute.chemin,
    message: messageDeRefusPayload(faute),
  }));
}

/**
 * Oppose le vocabulaire interdit à un enregistrement qui met le texte sous
 * les yeux du candidat, et le laisse passer sinon.
 *
 * Le refus **lève** avant l'écriture : un texte refusé ne doit pas même
 * s'installer dans la ligne que `filtrePourCandidat` sert.
 */
export function exigerUnEnregistrementAffichable(
  regle: { status: string },
  ecrit: Ecrit,
): void {
  // Un brouillon ne s'affiche pas, une version archivée non plus : ni l'un
  // ni l'autre n'est une publication, et la route refuse l'archivée pour
  // une autre raison, en amont.
  if (regle.status !== "PUBLISHED") return;

  const refus = refusDeLEcrit(ecrit);
  if (refus.length === 0) return;

  // Le refus nomme le fait : c'est une publication qui est refusée, et les
  // champs ne sont pas « invalides » — la version est bien formée, c'est sa
  // formulation qui ne peut pas s'afficher (DOC-12 §16 règle 1).
  throw echec("publication_refusee", {
    corps: `${refus[0]!.message} ${SUITE_DU_REFUS_EN_VIGUEUR}`,
    champs: Object.fromEntries(refus.map((r) => [r.chemin, r.message])),
  });
}

/** Une ligne de `VisaRule`, lue comme le domaine la juge. */
export const versionDe = (
  ligne: Pick<VisaRule, "id" | "version" | "status" | "publishedAt">,
): VersionDeRegle => ({
  id: ligne.id,
  version: ligne.version,
  statut: ligne.status,
  publieeLe: ligne.publishedAt,
});

/**
 * INV-3 — on n'écrit que dans une version qui n'a jamais été mise en
 * vigueur.
 *
 * ── Le statut laissait passer la version que les dossiers ont figée ──
 *
 * Le job de veille (RG-14.1) repasse en `DRAFT` une version publiée dont
 * la relecture est dépassée. `destinationDeLEnregistrement` la prenait
 * alors pour un brouillon, et l'enregistrement la réécrivait en place : les
 * dossiers ouverts dessus lisaient d'un coup une autre checklist (revue du
 * 07/10/2026, C1). La destination ne la choisit plus ; cette garde
 * l'affirme sur la ligne qu'on s'apprête à écrire, et la base le refuse
 * aussi (`regle_figee_immuable`).
 */
export function exigerUneVersionJamaisPubliee(version: VersionDeRegle): void {
  if (estUnBrouillon(version)) return;
  throw echec("etat_incompatible", {
    corps:
      "Cette version a été mise en vigueur et des dossiers l'ont peut-être figée : elle ne se réécrit pas. Enregistre de nouveau, la version suivante s'ouvrira.",
  });
}

/**
 * Les métadonnées qu'un éditeur complet renseigne, quand il en renseigne.
 * La branche `textes` n'en porte aucune : l'écran ne les montre pas, il ne
 * les décide pas.
 */
function metadonnees(ecrit: Ecrit) {
  if (ecrit.champ !== "payload") return {};
  return {
    ...(ecrit.sourceUrl ? { sourceUrl: ecrit.sourceUrl } : {}),
    ...(ecrit.nextReviewAt
      ? { nextReviewAt: new Date(`${ecrit.nextReviewAt}T00:00:00Z`) }
      : {}),
    ...(ecrit.notes !== undefined ? { notes: ecrit.notes } : {}),
  };
}

export interface Enregistrement {
  /** La ligne écrite — pas nécessairement celle que l'adresse désignait. */
  id: string;
  version: number;
  statut: string;
  /** Vrai quand cet enregistrement vient d'ouvrir la version suivante. */
  versionOuverte: boolean;
}

/**
 * Enregistre les textes de B-02 — WF-14 étape 3, INV-3.
 *
 * ── La commande écrivait dans la version que les dossiers ont figée ──
 *
 * `editionDeLaRegle` rendait `versions.find(DRAFT) ?? cible`, et rien dans
 * `src/` ne créait de version. Les trois procédures publiées de la graine
 * n'ont pas de brouillon : l'écran ouvrait la ligne en vigueur, l'appelait
 * « brouillon », et le `PUT` la réécrivait. `Application.visaRuleId` fige
 * cette ligne — la réécrire change d'un coup la checklist de tous les
 * dossiers ouverts dessus, ce qu'INV-3 interdit en propres termes.
 *
 * L'enregistrement écrit donc **toujours un brouillon**, celui qui existe
 * ou celui qu'il ouvre à partir de la version en vigueur. La ligne en
 * vigueur n'est plus jamais touchée ici : c'est `publierLaRegle` qui la
 * remplace, en l'archivant et en datant sa fin de validité.
 *
 * ── Ce qui reste du garde-fou du vocabulaire ────────────────────────
 *
 * Il reste, et il change de rôle. Il refusait un enregistrement que le
 * candidat lirait ; désormais aucun n'est dans ce cas, et le refus devient
 * l'affirmation que ce n'arrive pas — la dernière ligne d'INV-3, opposée
 * à la ligne qu'on s'apprête à écrire. Le retirer rendrait l'invariant
 * dépendant de la seule lecture de `destinationDeLEnregistrement`.
 */
export async function enregistrerLesTextes(
  regleId: string,
  ecrit: Ecrit,
  acteur: { email: string },
): Promise<Enregistrement> {
  const cible = await db.visaRule.findUnique({ where: { id: regleId } });
  if (!cible) throw echec("introuvable");
  if (cible.status === "ARCHIVED") {
    throw echec("etat_incompatible", {
      corps: "Une version archivée ne se modifie plus. Repars de la version en vigueur.",
    });
  }

  const versions = await db.visaRule.findMany({
    where: { countryCode: cible.countryCode, visaType: cible.visaType },
    orderBy: { version: "desc" },
  });
  const destination = destinationDeLEnregistrement(versions.map(versionDe));
  if (!destination) throw echec("introuvable");

  /*
    Le payload de départ vient de la ligne dont on part — le brouillon
    qu'on continue, ou la version en vigueur qu'on prolonge —, jamais de
    ce que le client a chargé : entre l'ouverture de la page et le clic,
    un autre veilleur a pu écrire dans les champs que l'écran ne montre pas.
  */
  const source =
    destination.quoi === "brouillon"
      ? versions.find((v) => v.id === destination.id)!
      : versions.find((v) => v.id === destination.depuis)!;

  const enBase = visaRulesSchema.safeParse(source.rules);
  if (!enBase.success) {
    throw echec("etat_incompatible", {
      corps: "Le contenu de cette version ne passe plus la validation. Reprends l'édition.",
    });
  }

  const propose =
    ecrit.champ === "textes" ? avecLesTextesCandidat(enBase.data, ecrit) : ecrit.payload;

  const lu = visaRulesSchema.safeParse(propose);
  if (!lu.success) {
    throw echec("champs_invalides", {
      champs: Object.fromEntries(
        lu.error.issues.map((i) => [i.path.map(String).join(".") || "rules", i.message]),
      ),
    });
  }

  if (destination.quoi === "brouillon") {
    // INV-3, dernière ligne : on n'écrit jamais dans une version qu'un
    // dossier a pu figer, ni dans ce que le candidat lit.
    exigerUneVersionJamaisPubliee(versionDe(source));
    exigerUnEnregistrementAffichable(source, ecrit);
    const maj = await db.visaRule.update({
      where: { id: destination.id },
      data: {
        rules: lu.data as never,
        schemaVersion: SCHEMA_VERSION,
        ...metadonnees(ecrit),
        verifiedAt: new Date(),
        verifiedBy: acteur.email,
      },
    });
    return { id: maj.id, version: maj.version, statut: maj.status, versionOuverte: false };
  }

  /*
    La version suivante s'ouvre en brouillon, copiée sur celle en vigueur.
    Ce qui ne se copie pas : `status`, `publishedAt`, `effectiveTo` — une
    version qui naît n'est en vigueur nulle part —, et `effectiveFrom`, que
    la publication posera au jour où elle prendra effet.
  */
  const ouverte = await db.visaRule.create({
    data: {
      countryCode: source.countryCode,
      category: source.category,
      visaType: source.visaType,
      version: destination.version,
      rules: lu.data as never,
      schemaVersion: SCHEMA_VERSION,
      sourceUrl: source.sourceUrl,
      sourceTier: source.sourceTier,
      status: "DRAFT",
      effectiveFrom: source.effectiveFrom,
      notes: source.notes,
      nextReviewAt: source.nextReviewAt,
      ...metadonnees(ecrit),
      verifiedAt: new Date(),
      verifiedBy: acteur.email,
    },
  });
  return { id: ouverte.id, version: ouverte.version, statut: ouverte.status, versionOuverte: true };
}
