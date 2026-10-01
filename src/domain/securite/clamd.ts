/**
 * Le protocole de clamd, ramené au contrat de `ANTIVIRUS_URL` — S.96.
 *
 * Le contrat de balayage (`balayage.ts`) est le nôtre, et il est HTTP.
 * ClamAV n'expose pas d'HTTP : son démon parle un protocole texte sur TCP,
 * et c'est la passerelle (`server/securite/passerelle-clamd.ts`) qui fait
 * la traduction. Ce module en tient la partie qui décide — la lecture de
 * la réponse — pour qu'elle s'éprouve sans démon ni socket.
 *
 * La commande employée est `zINSTREAM` : les octets partent dans la
 * connexion elle-même, par blocs préfixés de leur longueur sur quatre
 * octets, et un bloc de longueur nulle clôt l'envoi. Aucun fichier n'est
 * écrit sur un disque partagé, et aucun chemin n'est confié au démon —
 * même règle que pour le contrat HTTP : le moteur reçoit des octets, il
 * ne reçoit pas de quoi relire.
 *
 * Les réponses, terminées par un octet nul avec le préfixe `z` :
 *
 *     stream: OK
 *     stream: Eicar-Test-Signature FOUND
 *     INSTREAM size limit exceeded. ERROR
 *
 * Tout ce qui n'est ni `OK` ni `FOUND` est une erreur, **jamais** un
 * « sain ». C'est la même ligne que dans `balayage.ts`, tenue une marche
 * plus tôt : une passerelle qui traduirait une erreur du démon en
 * `{"status":"clean"}` laisserait passer chaque fichier en se déclarant
 * opérationnelle.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Ce que la passerelle renvoie au balayeur, selon le contrat de `balayage.ts`. */
export type ReponseDuContrat =
  | { status: "clean" }
  | { status: "infected"; signature: string };

export type LectureClamd =
  | { issue: "verdict"; reponse: ReponseDuContrat }
  | { issue: "erreur"; detail: string };

/** La commande, préfixe `z` : réponse terminée par un octet nul. */
export const COMMANDE_INSTREAM = "zINSTREAM\0";
export const COMMANDE_PING = "zPING\0";

/**
 * La taille d'un bloc envoyé au démon. En deçà de la valeur par défaut de
 * `StreamMaxLength` (25 Mo) par construction : c'est la somme des blocs
 * que le démon plafonne, pas chacun d'eux.
 */
export const TAILLE_DU_BLOC_OCTETS = 64 * 1024;

/** L'entête d'un bloc : sa longueur, sur quatre octets, gros-boutiste. */
export function enteteDeBloc(longueur: number): Uint8Array {
  if (!Number.isInteger(longueur) || longueur < 0 || longueur > 0xffffffff) {
    throw new RangeError(`Longueur de bloc impossible : ${longueur}`);
  }
  return Uint8Array.of(
    (longueur >>> 24) & 0xff,
    (longueur >>> 16) & 0xff,
    (longueur >>> 8) & 0xff,
    longueur & 0xff,
  );
}

/** La réponse brute, débarrassée de son octet nul et des blancs. */
const nettoyer = (brute: string): string => brute.replace(/\0+$/u, "").trim();

/**
 * Traduit la réponse de `zINSTREAM` en réponse du contrat.
 *
 * Le préfixe `stream:` est exigé : une ligne qui finit par `OK` sans lui
 * n'est pas une réponse à cette commande-là.
 */
export function lireLaReponseClamd(brute: string): LectureClamd {
  const ligne = nettoyer(brute);
  const lue = /^stream: (.+)$/u.exec(ligne);
  if (!lue) {
    // `INSTREAM size limit exceeded. ERROR` arrive sans le préfixe.
    if (ligne.endsWith("ERROR")) return { issue: "erreur", detail: "le démon signale une erreur" };
    return { issue: "erreur", detail: ligne === "" ? "réponse vide du démon" : "réponse du démon hors protocole" };
  }
  const corps = lue[1]!.trim();
  if (corps === "OK") return { issue: "verdict", reponse: { status: "clean" } };

  const trouvee = /^(.+) FOUND$/u.exec(corps);
  if (trouvee) {
    return { issue: "verdict", reponse: { status: "infected", signature: trouvee[1]!.trim() } };
  }
  /*
    `… ERROR`, ou toute forme qu'on ne connaît pas. Le détail ne recopie
    pas la ligne du démon : elle peut citer une limite de configuration,
    jamais un contenu, mais rien ne garantit qu'une version future n'y
    mettra pas un chemin. Le journal dit la catégorie, pas la ligne.
  */
  return {
    issue: "erreur",
    detail: corps.endsWith("ERROR") ? "le démon signale une erreur" : "réponse du démon hors protocole",
  };
}

/** `zPING` répond `PONG` : le démon est debout et ses signatures sont chargées. */
export const pingReussi = (brute: string): boolean => nettoyer(brute) === "PONG";
