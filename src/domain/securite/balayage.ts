/**
 * Le contrat du moteur de balayage — arbitrage du 22/09/2026.
 *
 * ── Un contrat que nous écrivons, et pourquoi ───────────────────────
 *
 * `ANTIVIRUS_URL` ne désigne pas un fournisseur connu dont on devrait
 * deviner l'interface. Elle désigne **le moteur que l'exploitant met en
 * face**, et c'est donc à nous de dire ce que nous lui parlons. La
 * différence avec FedaPay ou Stripe est entière : là-bas, inventer une
 * forme aurait été supposer celle d'un tiers ; ici, la publier est la
 * seule façon d'être branchable.
 *
 * Le contrat est délibérément minimal, parce qu'il doit se satisfaire
 * avec une trentaine de lignes de colle devant n'importe quel moteur —
 * ClamAV et les autres n'exposent pas d'HTTP, et se mettent derrière un
 * adaptateur. Un contrat riche déplacerait le travail chez l'exploitant
 * et se négocierait moteur par moteur.
 *
 *     POST <ANTIVIRUS_URL>
 *     Content-Type: application/octet-stream
 *     <les octets du fichier>
 *
 *     200 {"status":"clean"}
 *     200 {"status":"infected","signature":"Eicar-Test-Signature"}
 *
 * Les octets partent dans le corps, en clair, une fois. **Aucune URL n'est
 * transmise** — ni présignée, ni permanente : le moteur n'a pas à pouvoir
 * relire le fichier, ni demain, ni depuis ailleurs. Une URL présignée
 * confiée à un tiers est une lecture qu'on ne contrôle plus, et la
 * quarantaine existe précisément pour qu'il n'y en ait aucune (I.D).
 *
 * Tout le reste — 4xx, 5xx, délai dépassé, corps illisible, `status`
 * inconnu — vaut **indisponible**, jamais sain. C'est la seule règle qui
 * compte vraiment dans ce fichier.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import { z } from "zod";
import type { EtatBalayage } from "../dossiers/quarantaine";

/**
 * Le verdict, et l'indisponibilité en fait partie.
 *
 * Elle était rendue par `null`, ce qui suffisait tant qu'aucun moteur
 * n'existait : il n'y avait qu'une raison de ne pas savoir. Maintenant
 * qu'un appel réseau a lieu, il y en a cinq — pas de moteur, injoignable,
 * délai, fichier trop gros, réponse incompréhensible — et l'exploitant a
 * besoin de les distinguer pour savoir s'il doit attendre ou intervenir.
 *
 * Elle reste dans le même type que les deux autres à dessein : un appelant
 * qui traite le verdict par `switch` exhaustif ne peut pas l'oublier,
 * là où un `null` se teste distraitement.
 */
export type Verdict =
  | { etat: Extract<EtatBalayage, "SAINE"> }
  | { etat: Extract<EtatBalayage, "INFECTEE">; menace: string }
  | { etat: "INDISPONIBLE"; cause: CauseDIndisponibilite; detail: string };

export type CauseDIndisponibilite =
  /** Aucun moteur configuré, ou configuration illisible. */
  | "non_configure"
  /** Réseau, DNS, connexion refusée. */
  | "injoignable"
  /** Le moteur n'a pas répondu dans le délai. */
  | "delai_depasse"
  /** Il a répondu autre chose que ce que le contrat prévoit. */
  | "reponse_illisible"
  /** Le fichier dépasse ce qu'on accepte de transmettre. */
  | "trop_volumineux"
  /** L'objet n'est plus en quarantaine : rien à lire. */
  | "objet_absent";

/**
 * Ce que l'exploitation doit faire de chaque cause.
 *
 * `switch` exhaustif : une cause nouvelle ne compilera pas tant qu'on
 * n'aura pas dit si elle se reprend toute seule. La distinction n'est pas
 * décorative — une panne réseau se rejoue, un fichier trop volumineux se
 * rejouera identiquement jusqu'à la fin des temps, et rejouer sans fin
 * une tâche qui ne peut pas aboutir masque le problème au lieu de le
 * signaler.
 */
export function seReprendSeule(cause: CauseDIndisponibilite): boolean {
  switch (cause) {
    case "injoignable":
    case "delai_depasse":
      return true;
    case "non_configure":
    case "reponse_illisible":
    case "trop_volumineux":
    case "objet_absent":
      return false;
    default: {
      const jamais: never = cause;
      throw new Error(`Cause d'indisponibilité non arbitrée : ${JSON.stringify(jamais)}`);
    }
  }
}

export const MOTIF_INDISPONIBILITE: Record<CauseDIndisponibilite, string> = {
  non_configure:
    "Aucun moteur de balayage n'est configuré. Les pièces déposées restent en quarantaine, et le dépôt est refusé en amont.",
  injoignable:
    "Le moteur de balayage n'a pas répondu. La pièce reste en quarantaine et la tâche sera reprise.",
  delai_depasse:
    "Le moteur de balayage a dépassé le délai accordé. La pièce reste en quarantaine et la tâche sera reprise.",
  reponse_illisible:
    "Le moteur de balayage a répondu quelque chose que le contrat ne prévoit pas. À vérifier à la main : rejouer ne changera rien.",
  trop_volumineux:
    "Le fichier dépasse la taille que le balayage accepte de transmettre. Il reste en quarantaine et n'y passera jamais : à traiter à la main.",
  objet_absent:
    "L'objet n'est plus en quarantaine. Rien n'a été balayé, et rien ne sera promu.",
};

/**
 * La taille au-delà de laquelle on ne transmet pas.
 *
 * Elle est plus large que la limite de téléversement (`TAILLE_MAXI_MO`),
 * et c'est volontaire : ce n'est pas le même garde-fou. Celui du dépôt
 * dit au candidat ce qu'il peut envoyer ; celui-ci protège le moteur et
 * notre mémoire d'un objet arrivé par un autre chemin — une reprise, un
 * import, une clé forgée. Les deux doivent exister, et le second ne doit
 * pas se déduire du premier, sinon relever la limite du dépôt relèverait
 * silencieusement ce qu'on charge en mémoire.
 */
export const TAILLE_MAXI_BALAYAGE_OCTETS = 32 * 1024 * 1024;

/** Au-delà, le moteur est tenu pour muet. Un dépôt attend derrière. */
export const DELAI_BALAYAGE_MS = 30_000;

/**
 * Ce que le moteur répond, lu au schéma.
 *
 * `status` fermé à deux valeurs : ce qui n'y est pas déclaré n'atteint pas
 * le code qui décide. Un moteur qui répondrait `{"status":"unknown"}` ou
 * `{"status":"error"}` tombe donc en `reponse_illisible` — et surtout pas
 * en « sain par défaut ».
 */
export const schemaReponse = z.object({
  status: z.enum(["clean", "infected"]),
  /** Le nom de la menace. Exigé sur `infected` par `lireLaReponse`. */
  signature: z.string().nullish(),
});

/**
 * Traduit une réponse déjà désérialisée en verdict.
 *
 * Séparée de l'appel réseau pour que la table de décision s'éprouve sans
 * serveur — et parce que c'est la partie qui doit rester lisible : entre
 * « ce que le moteur a dit » et « ce qu'on en fait », il n'y a qu'une
 * marche, et c'est celle qui laisse passer les fichiers.
 */
export function lireLaReponse(charge: unknown): Verdict {
  const lue = schemaReponse.safeParse(charge);
  if (!lue.success) {
    return {
      etat: "INDISPONIBLE",
      cause: "reponse_illisible",
      detail: "réponse non conforme au contrat",
    };
  }
  if (lue.data.status === "clean") return { etat: "SAINE" };

  /*
    Une infection sans nom de menace reste une infection : le fichier est
    détruit de toute façon, et exiger la signature pour conclure ferait
    d'un moteur avare un moteur permissif. Le nom sert au back-office,
    pas à la décision.
  */
  const menace = (lue.data.signature ?? "").trim();
  return { etat: "INFECTEE", menace: menace === "" ? "menace non nommée par le moteur" : menace };
}

/**
 * L'adresse du moteur est-elle utilisable ?
 *
 * Vérifiée avant tout appel, et sans jamais citer la valeur lue : une URL
 * de moteur peut porter un jeton dans son chemin ou ses paramètres, et un
 * motif d'erreur finit toujours par atteindre un journal.
 */
export function urlDuMoteurValide(brute: string | undefined): boolean {
  const texte = (brute ?? "").trim();
  if (texte === "") return false;
  try {
    const lue = new URL(texte);
    return lue.protocol === "http:" || lue.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Le nombre de tentatives au-delà duquel l'incident devient visible.
 *
 * Trois, parce qu'une reprise immédiate couvre le redémarrage d'un
 * conteneur, la seconde couvre une coupure réseau ordinaire, et la
 * troisième sépare l'incident passager de la panne installée. Le fichier
 * **n'est pas accepté** pour autant : c'est une visibilité, pas une
 * porte de sortie.
 */
export const TENTATIVES_AVANT_INCIDENT = 3;

/**
 * Ce qu'on fait d'une indisponibilité — la seule décision du lot qui
 * porte sur des fichiers déjà déposés.
 *
 * Deux questions, et elles ne se confondent pas :
 *
 * - **rejouer** — la file doit-elle reprendre la tâche ? Oui si la cause
 *   peut disparaître d'elle-même, non sinon. Rejouer trente fois un
 *   fichier trop volumineux ne le rétrécit pas ; cela remplit la file et
 *   noie l'incident qu'il fallait voir.
 * - **signaler** — l'exploitation doit-elle le savoir ? Tout de suite pour
 *   ce qui ne se reprend pas, au bout de `TENTATIVES_AVANT_INCIDENT` pour
 *   le reste : les deux premières couvrent un redémarrage et une coupure
 *   ordinaires, la troisième sépare le passager de la panne installée.
 *
 * **Aucune des deux réponses n'accepte le fichier.** C'est la propriété
 * que ce module existe pour tenir : quelle que soit la combinaison, la
 * pièce reste en quarantaine. Signaler est une visibilité, pas une porte
 * de sortie.
 */
export interface SuiteDIndisponibilite {
  rejouer: boolean;
  signaler: boolean;
}

export function suiteDeLIndisponibilite(
  cause: CauseDIndisponibilite,
  tentatives: number,
): SuiteDIndisponibilite {
  const rejouer = seReprendSeule(cause);
  return { rejouer, signaler: rejouer ? tentatives >= TENTATIVES_AVANT_INCIDENT : true };
}

/**
 * Le fichier d'essai EICAR — 68 octets, une norme, et aucune charge.
 *
 * Ce n'est pas un virus : c'est une chaîne que les moteurs se sont
 * accordés à signaler comme si c'en était un, précisément pour qu'on
 * puisse vérifier qu'ils balaient sans faire courir de risque. La
 * concaténation ci-dessous est là pour que le dépôt ne porte pas la
 * chaîne d'un seul tenant — sans quoi le balayeur du poste de travail
 * de qui clone le dépôt la signalerait, et c'est arrivé à d'autres.
 *
 * Elle sert à la sonde, et **elle seule prouve quelque chose**. Un moteur
 * qui répond `clean` à un octet quelconque prouve qu'il répond ; un
 * moteur qui répond `infected` à celle-ci prouve qu'il balaie. La
 * différence est tout l'objet de I.D : une chaîne de traitement qui
 * répond sans rien détecter laisserait passer chaque fichier en se
 * déclarant opérationnelle.
 */
export const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * Ce que l'état de service peut dire du balayeur.
 *
 * Même règle que pour le transport de courrier : **une URL qui
 * s'analyse ne prouve rien**. La sonde ne conclut que sur un fait — le
 * moteur a reconnu EICAR —, jamais sur la forme d'une variable. Un
 * moteur qui répondrait `clean` à EICAR est un moteur en panne, et il
 * vaut mieux le lire au démarrage que sur le premier fichier réellement
 * infecté.
 *
 * La règle de lecture est commune aux deux sondes et vit dans
 * `domain/exploitation/constats.ts`, avec la fraîcheur qui manquait ici
 * comme là-bas. Ce type-ci reste la forme de l'essai tel que le module
 * le tient pour son propre processus.
 */
export interface DernierBalayageDEssai {
  reconnu: boolean;
  quand: Date;
}
