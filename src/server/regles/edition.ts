import { echec } from "@/server/http/echecs";
import { textesCandidat, type VisaRulesPayload } from "@/domain/rules/schema";
import {
  SUITE_DU_REFUS_EN_VIGUEUR,
  messageDeRefus,
  messageDeRefusPayload,
  verifierPayloadCandidat,
  verifierTextesCandidat,
  type ChampCandidat,
  type Regle,
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
  | { champ: "payload"; payload: VisaRulesPayload };

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
