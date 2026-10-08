import type { Reponses } from "@/domain/redaction/entretien";
import { MOTIF_DAPPEL } from "@/domain/ia/appel";
import { NOTE_REDACTION_ASSISTEE } from "@/domain/payments/montee";
import { MOTIF_FORMULATION_REFUSEE, refusDuTexteRedige } from "@/domain/redaction/commande";
import { debiterUneAnalyse, rendreUneTentative } from "@/server/acces/quota";
import type { PieceARediger } from "@/server/lecture/redaction";
import type { Redacteur } from "./adaptateur";
import { leRedacteur } from "./service";
import { noterLesJetons } from "./usage";

/**
 * La mise en forme d'une pièce, du débit au texte — WF-08 étape 3 ; revue
 * du 07/10/2026, M7.
 *
 * Elle vivait dans sa route, derrière la session : aucune fumée ne pouvait
 * l'appeler, et le texte rendu par le modèle devenait une version sans que
 * rien ne le lise. Le voici contrôlé par la règle qui vaut pour tout
 * document généré (INV-2) : un texte qui promet est écarté, l'analyse est
 * rendue (INV-6, rien n'est décompté pour un texte qu'on ne garde pas),
 * et la route dit pourquoi.
 *
 * Ce module ne crée pas la version : la route le fait, comme pour la
 * réécriture et la restauration.
 */
export type IssueDeLaMiseEnForme =
  | { produite: true; texte: string }
  | { produite: false; motif: typeof MOTIF_FORMULATION_REFUSEE | null };

export async function mettreEnForme(
  dossierId: string,
  acteurId: string,
  piece: Pick<PieceARediger, "type" | "libelle" | "objet" | "pays" | "questions">,
  reponses: Reponses,
  redacteur: Redacteur = leRedacteur(),
): Promise<IssueDeLaMiseEnForme> {
  /**
   * Le débit précède l'appel, comme dans l'analyse d'une pièce : débiter
   * après laisserait une mise en forme gratuite à chaque interruption, et
   * INV-6 dit « jamais de dépassement silencieux », pas « le plus
   * souvent ». Ici l'échec reste imprévisible — le service est branché,
   * et c'est l'appel qui peut ne pas aboutir.
   */
  const debit = await debiterUneAnalyse(dossierId, undefined, {
    note: `${NOTE_REDACTION_ASSISTEE} — Mise en forme (${piece.type})`,
  });

  const produit = await redacteur({
    // La pièce et la destination sont nommées : ce qui écrit pour le
    // candidat n'a pas à déchiffrer un segment de route ni un code ISO.
    piece: piece.libelle,
    objet: piece.objet,
    // Le pays vient de la règle figée à l'ouverture (INV-3), pas de la
    // règle publiée aujourd'hui.
    pays: piece.pays!,
    reponses,
    questions: piece.questions.map((q, rang) => ({
      rang,
      section: q.section,
      intitule: q.intitule,
    })),
  });

  /*
    Les jetons consommés sont enregistrés **quoi qu'il advienne** — INV-6.
    Un appel interrompu, ou un texte écarté, a coûté ; ne pas l'écrire en
    ferait un appel gratuit dans B-07.
  */
  await noterLesJetons(
    acteurId,
    dossierId,
    `redaction:${piece.type}`,
    produit.jetonsEntree,
    produit.jetonsSortie,
    produit.appel,
  );

  if (produit.etat === "SANS_TEXTE") {
    /**
     * Le service était branché et n'a rien rendu. La version n'est pas
     * créée et l'analyse est rendue — sans ce retour, un candidat
     * paierait l'échec d'un appel.
     */
    await rendreUneTentative(
      dossierId,
      `Mise en forme non aboutie (${produit.cause}) : aucun texte rendu`,
      debit.octroi,
    );
    console.warn(`[redaction] ${MOTIF_DAPPEL[produit.cause]} — ${produit.detail}`);
    return { produite: false, motif: null };
  }

  const faute = refusDuTexteRedige(produit.texte);
  if (faute) {
    await rendreUneTentative(dossierId, "Mise en forme écartée : formulation refusée", debit.octroi);
    // Le code et l'extrait, pour qui relit le journal ; jamais le texte entier.
    console.warn(`[redaction] mise en forme écartée — ${faute.code} « ${faute.extrait} »`);
    return { produite: false, motif: MOTIF_FORMULATION_REFUSEE };
  }

  return { produite: true, texte: produit.texte };
}
