/**
 * Le signalement d'une erreur de lecture — C-08, WF-06, S.157 (R-03,
 * choix du responsable du 09/10/2026 : construire le signalement).
 *
 * La réserve sous toute lecture automatique le promet : « Si une valeur
 * est fausse, signale-le : nous faisons relire la pièce par un humain. »
 * Le lien menait à une page absente.
 *
 * Le candidat désigne **quelles valeurs** sont fausses, parmi celles que
 * l'écran lui montre — ou « autre chose ». Il ne recopie pas la bonne
 * valeur : un numéro de passeport saisi ici irait au journal, qui ne se
 * purge pas avec les pièces (INV-5). L'opérateur relit la pièce elle-même.
 *
 * Un signalement par lecture : il ouvre la revue manuelle de cette lecture
 * (B-05, motif « Signalé par le candidat »), et une lecture n'a qu'une
 * revue. Il ne coûte rien ; si l'opérateur rend la lecture, l'analyse est
 * recréditée comme pour toute revue (`recrediteLeQuota`).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Le choix qui couvre ce que la liste des valeurs lues ne montre pas. */
export const AUTRE_CHOSE = "Autre chose";

/** Au plus : les valeurs lues d'une pièce, et « autre chose ». */
export const CHAMPS_SIGNALABLES_MAX = 20;

/** Le motif écrit au journal : le candidat ne le rédige pas. */
export const MOTIF_DU_SIGNALEMENT = "Erreur de lecture signalée par le candidat";

/**
 * Pourquoi un signalement ne peut pas partir tel quel, ou `null`.
 * Les valeurs désignées doivent être de celles que l'écran a montrées.
 */
export function refusDuSignalement(
  designes: readonly string[],
  lus: readonly string[],
): string | null {
  if (designes.length === 0) {
    return "Coche au moins une valeur fausse, ou « Autre chose », puis envoie le signalement.";
  }
  const connus = new Set([...lus, AUTRE_CHOSE]);
  const inconnu = designes.find((d) => !connus.has(d));
  if (inconnu !== undefined) {
    return "La lecture de cette pièce a changé depuis l'ouverture de la page. Recharge-la, puis coche de nouveau les valeurs fausses.";
  }
  return null;
}

/** Ce que l'opérateur lit en B-05, au-dessus de la trace de la lecture. */
export function resumeDuSignalement(designes: readonly string[]): string {
  return `Le candidat signale comme fausses : ${designes.join(", ")}.`;
}
