import type { PieceRedigeable, Question } from "@/domain/redaction/entretien";
import type { Suggestion, Version } from "@/domain/redaction/versions";
import type { Remarque } from "@/domain/redaction/relecture";
import { remarqueLongueur } from "@/domain/redaction/relecture";
import { motsDeLaVersion, versionCourante } from "@/domain/redaction/versions";

/**
 * Jeu de démonstration de la rédaction assistée — provisoire.
 *
 * Les jeux de questions viendront du référentiel avec la checklist : ils
 * dépendent de la destination et du type de séjour. Les écrans ne
 * connaissent que les types du domaine ; seul ce fichier changera.
 */

/**
 * L'ouverture est demandée en dernier : on écrit sa première phrase une fois
 * qu'on sait ce qu'on a dit. Poser la question d'abord produit une formule
 * d'accroche, et c'est exactement ce que le repère demande d'éviter.
 */
const QUESTIONS_MOTIVATION: readonly Question[] = [
  {
    section: "PARCOURS",
    intitule: "Quel diplôme as-tu obtenu, et quand ?",
    motif:
      "La date doit correspondre exactement à celle de ton relevé de notes, sinon l'écart se voit.",
    exemple: "Licence en gestion, Université d'Abomey-Calavi, septembre 2026.",
    reperes: [
      "Donne l'intitulé exact du diplôme, pas une traduction approximative.",
      "Précise la mention si tu en as une.",
    ],
  },
  {
    section: "PARCOURS",
    intitule: "Qu'as-tu fait pendant ta dernière année ?",
    motif:
      "Une expérience concrète, même courte, vaut mieux que des qualités générales.",
    exemple:
      "Stage de quatre mois chez un transitaire du port de Cotonou, suivi des procédures douanières.",
    reperes: [
      "Chiffre ce que tu as fait : combien de dossiers, de mois, de personnes.",
      "Une seule expérience bien décrite suffit.",
    ],
  },
  {
    section: "POURQUOI CE PROGRAMME",
    intitule: "Pourquoi ce programme précis, et pas un autre ?",
    motif:
      "C'est le paragraphe qui distingue une candidature d'un envoi en série. Cite un module ou un enseignant.",
    exemple:
      "Le module de logistique portuaire, parce que Rotterdam traite la majorité du fret entrant en Europe.",
    reperes: [
      "Nomme un cours, un laboratoire ou un enseignant du programme.",
      "Relie-le à ce que tu as déjà fait, pas seulement à ce que tu aimes.",
    ],
  },
  {
    section: "FINANCEMENT",
    intitule: "Comment finances-tu ton année ?",
    motif:
      "L'administration vérifie la cohérence entre ce que tu écris et ton relevé bancaire.",
    exemple:
      "Épargne familiale et prise en charge de mon oncle, plus une demande de bourse d'établissement.",
    reperes: [
      "Nomme la source des fonds, elle doit correspondre au titulaire du compte.",
      "Ne gonfle aucun montant : le relevé sera lu.",
    ],
  },
  {
    section: "APRÈS LE DIPLÔME",
    intitule: "Que comptes-tu faire après ton diplôme ?",
    motif:
      "Le projet de retour est lu attentivement. Un poste et un secteur précis valent mieux qu'une intention.",
    exemple:
      "Rentrer travailler dans la logistique portuaire au Bénin, secteur en expansion depuis la modernisation du port.",
    reperes: [
      "Cite un type de poste et, si possible, un employeur ou un secteur local.",
      "Donne une échéance, même approximative.",
    ],
  },
  {
    section: "ATTACHES",
    intitule: "Quelles sont tes attaches au Bénin ?",
    motif:
      "Famille, biens, engagements : ce sont des éléments factuels, pas des sentiments.",
    exemple:
      "Mes parents et mes deux sœurs vivent à Cotonou. Je suis bénévole dans une association de quartier depuis 2023.",
    reperes: [
      "Reste factuelle : liens familiaux, propriété, engagements datés.",
      "N'invente rien, ces points peuvent être vérifiés.",
    ],
  },
  {
    section: "LANGUES",
    intitule: "Quel est ton niveau d'anglais et comment l'as-tu acquis ?",
    motif:
      "Le niveau déclaré doit correspondre à ton test, et le test doit être valable au dépôt.",
    exemple: "IELTS 6.0 obtenu en mars 2025, et trois ans de cours en anglais à l'université.",
    reperes: [
      "Donne le résultat et la date du test.",
      "Mentionne les cours suivis en anglais, ils comptent.",
    ],
  },
  {
    section: "OUVERTURE",
    intitule: "Comment veux-tu te présenter en une phrase ?",
    motif:
      "C'est la première ligne que le lecteur verra. Elle doit dire qui tu es et ce que tu demandes.",
    exemple:
      "Je suis Aline Dossou, candidate au programme de licence en International Business pour la rentrée 2027.",
    reperes: [
      "Nom, situation, et la demande précise, en une phrase.",
      "Pas de formule d'accroche : le lecteur en voit des centaines.",
    ],
  },
];

/**
 * Les autres pièces reprennent les questions qui les concernent, dans l'ordre
 * où elles se répondent. Rien n'est tiré au hasard : une déclaration
 * d'intention de retour ne demande pas comment l'année est financée, et une
 * attestation de prise en charge ne demande pas le niveau d'anglais.
 */
const selon = (...rangs: number[]): readonly Question[] =>
  rangs.map((r) => QUESTIONS_MOTIVATION[r]!);

/** Parcours, programme, financement, après le diplôme, ouverture. */
const QUESTIONS_PROJET = selon(0, 1, 2, 3, 4, 7);
/** Après le diplôme, attaches, expérience, ouverture, et le parcours qui les date. */
const QUESTIONS_RETOUR = selon(4, 5, 1, 0, 7);
/** Financement d'abord : c'est l'objet de la pièce. */
const QUESTIONS_GARANT = selon(3, 0, 5, 7);

export const PIECES_REDIGEABLES: readonly PieceRedigeable[] = [
  {
    type: "lettre-motivation",
    code: "MOT",
    libelle: "Lettre de motivation",
    objet: "Pourquoi ce programme, ce pays, et ce que tu feras après.",
    exigence: "Exigée par Hanze University",
    questions: QUESTIONS_MOTIVATION,
  },
  {
    type: "projet-etudes",
    code: "PRO",
    libelle: "Projet d'études",
    objet: "Le détail de ton cursus visé et de sa cohérence avec ton parcours.",
    exigence: "Recommandée",
    questions: QUESTIONS_PROJET,
  },
  {
    type: "intention-retour",
    code: "RET",
    libelle: "Déclaration d'intention de retour",
    objet: "Tes attaches au Bénin et ton projet professionnel au retour.",
    exigence: "Recommandée après un refus",
    questions: QUESTIONS_RETOUR,
  },
  {
    type: "prise-en-charge",
    code: "GAR",
    libelle: "Attestation de prise en charge",
    objet: "Le texte que ton garant doit signer, avec les mentions exigées.",
    exigence: "Si tu ne finances pas seule ton séjour",
    questions: QUESTIONS_GARANT,
  },
];

export const pieceRedigeable = (type: string) =>
  PIECES_REDIGEABLES.find((p) => p.type === type);

export const VERSIONS_MOTIVATION: readonly Version[] = [
  {
    rang: 1,
    enregistreeLe: "2026-09-09T10:12:00Z",
    motif: "Première mise en forme de tes réponses à l'entretien.",
    paragraphes: [
      {
        section: "OUVERTURE",
        texte:
          "Je m'appelle Aline Dossou et je suis candidate au programme de licence en International Business de la Hanze University of Applied Sciences.",
      },
    ],
  },
  {
    rang: 2,
    enregistreeLe: "2026-09-17T21:04:00Z",
    motif: "Réécriture de l'ouverture, plus directe.",
    paragraphes: [
      {
        section: "OUVERTURE",
        texte:
          "Je m'appelle Aline Dossou et je suis candidate au programme de licence en International Business de la Hanze University of Applied Sciences pour la rentrée de septembre 2027.",
      },
    ],
  },
  {
    rang: 3,
    enregistreeLe: "2026-09-18T09:37:00Z",
    motif: "Ajout du paragraphe sur le stage au port de Cotonou.",
    paragraphes: [
      {
        section: "OUVERTURE",
        texte:
          "Je m'appelle Aline Dossou et je suis candidate au programme de licence en International Business de la Hanze University of Applied Sciences pour la rentrée de septembre 2027.",
      },
      {
        section: "PARCOURS",
        texte:
          "J'ai obtenu ma licence en gestion à l'Université d'Abomey-Calavi en juillet 2026, avec une spécialisation en commerce international. Pendant ma dernière année, j'ai effectué un stage de quatre mois chez un transitaire du port de Cotonou, où j'ai suivi les procédures douanières de trente-deux expéditions vers l'Europe.",
      },
      {
        section: "POURQUOI CE PROGRAMME",
        texte:
          "Le port de Rotterdam traite la majorité du fret qui entre en Europe, et le programme de Hanze est le seul qui associe logistique portuaire et commerce international dans un cursus en anglais accessible depuis le Bénin.",
      },
      {
        section: "APRÈS LE DIPLÔME",
        texte:
          "Je compte rentrer au Bénin pour travailler dans la logistique portuaire, un secteur en expansion depuis la modernisation du port de Cotonou.",
      },
    ],
  },
];

export const SUGGESTION_EN_ATTENTE: Suggestion = {
  section: "POURQUOI CE PROGRAMME",
  texte:
    "Nomme un cours ou un enseignant précis du programme. Les lettres qui citent un module sont plus difficiles à recycler.",
};

export const REMARQUES_MOTIVATION: readonly Remarque[] = [
  {
    id: "dates-licence",
    genre: "INCOHERENCE",
    titre: "Deux dates de fin de licence différentes",
    corps:
      "Ta lettre indique juillet 2026. Ton relevé de notes porte la date du 18 septembre 2026. Une administration qui lit les deux pièces verra l'écart : aligne la lettre sur le relevé, ou explique la différence.",
    ecarts: [
      { source: "Dans la lettre", valeur: "juillet 2026" },
      { source: "Sur le relevé de notes", valeur: "18 septembre 2026" },
    ],
    action: "Corriger la lettre",
    actionSecondaire: "Voir le relevé",
  },
  {
    id: "projet-retour",
    genre: "A_RENFORCER",
    titre: "Le projet de retour reste général",
    corps:
      "« Travailler dans la logistique portuaire » ne cite ni employeur, ni type de poste, ni échéance. C'est le paragraphe que les administrations lisent le plus attentivement : trois questions suffisent à le préciser.",
    action: "Répondre à trois questions",
  },
];

/** Limite indicative publiée par l'établissement, à titre de conseil. */
export const LIMITE_MOTS_CONSEILLEE = 400;

/**
 * Remarques affichées sur R-04 : les constats croisés, plus la remarque de
 * longueur si le texte la mérite. Elle se calcule sur la version courante ;
 * le prototype l'écrivait en dur, au-dessus d'une lettre trois fois plus
 * courte que le nombre annoncé.
 */
export function remarquesDeLaLettre(): readonly Remarque[] {
  const courante = versionCourante(VERSIONS_MOTIVATION);
  const longueur = courante
    ? remarqueLongueur(motsDeLaVersion(courante), LIMITE_MOTS_CONSEILLEE, "Hanze")
    : null;
  return longueur ? [...REMARQUES_MOTIVATION, longueur] : REMARQUES_MOTIVATION;
}

/** Date de la relecture automatique affichée sous R-04 (INV-8). */
export const RELECTURE_LE = "2026-09-11";
