/**
 * Le transport des courriers transactionnels — arbitrage du 22/09/2026.
 *
 * ── Ce que ce module tient, et pourquoi il est pur ──────────────────
 *
 * Trois décisions qui n'ont rien à faire dans un adaptateur réseau, et
 * que des tests doivent pouvoir éprouver sans serveur :
 *
 * 1. **ce qu'on a le droit d'écrire au journal** — la réponse tient en
 *    peu de mots, et elle est plus restrictive qu'on ne croit ;
 * 2. **comment se lit `SMTP_URL`**, sans que son mot de passe puisse
 *    ressortir de la fonction qui la lit ;
 * 3. **les issues d'un envoi**, qui ne se traitent pas de la même façon.
 *
 * Module pur : aucune dépendance à Prisma, Next, nodemailer ou au réseau.
 */

/**
 * Ce qu'un envoi peut donner.
 *
 * `journalise` est la dégradation honnête : rien n'est parti, et
 * l'appelant le sait. Elle ne doit jamais être confondue avec `envoye` —
 * c'est exactement la confusion que la route de renvoi de code faisait,
 * en répondant « un nouveau code est parti » devant un transport muet.
 */
export type Envoi =
  | { issue: "envoye" }
  /** Aucun transport : le courrier est passé au journal, et rien de plus. */
  | { issue: "journalise" }
  /** `SMTP_URL` absente ou illisible. Rien n'est parti, et c'est dit. */
  | { issue: "non_configure"; detail: string }
  /**
   * Le serveur a répondu, et il refuse : identifiants rejetés, adresse
   * refusée, message refusé. Réessayer à l'identique ne changera rien.
   */
  | { issue: "refuse"; detail: string }
  /**
   * Injoignable, délai dépassé, coupure. On ne sait pas si le message est
   * passé — et c'est pourquoi un renvoi doit rester possible.
   */
  | { issue: "injoignable"; detail: string };

export type IssueDEnvoi = Envoi["issue"];

/**
 * Ce que l'appelant doit en conclure — `switch` exhaustif.
 *
 * Une sixième issue ne compilera pas tant qu'on n'aura pas répondu aux
 * deux questions qui décident du sort d'un courrier : est-il parti, et
 * peut-on le redemander tel quel ?
 */
export interface SuiteDeLEnvoi {
  /** Le message a réellement quitté la plateforme. */
  parti: boolean;
  /** Un renvoi à l'identique a une chance d'aboutir. */
  renvoyable: boolean;
}

export function suiteDeLEnvoi(issue: IssueDEnvoi): SuiteDeLEnvoi {
  switch (issue) {
    case "envoye":
      return { parti: true, renvoyable: false };
    case "injoignable":
      // Une coupure se reprend. On ne sait pas si le message est passé :
      // un second code de vérification est un moindre mal devant un
      // candidat qui n'en a reçu aucun.
      return { parti: false, renvoyable: true };
    case "journalise":
    case "non_configure":
      // Rien ne partira tant que la configuration n'aura pas changé :
      // renvoyer produirait le même silence.
      return { parti: false, renvoyable: false };
    case "refuse":
      return { parti: false, renvoyable: false };
    default: {
      const jamais: never = issue;
      throw new Error(`Issue d'envoi non arbitrée : ${JSON.stringify(jamais)}`);
    }
  }
}

// ── Ce qui a le droit d'atteindre le journal ────────────────────────────

/**
 * **L'objet d'un courrier ne se journalise pas.**
 *
 * Il paraissait anodin, et il ne l'est pas : `« 481920 — ton code de
 * vérification ImmiPro »`. Le transport de repli écrivait cette ligne à
 * chaque envoi, si bien que le code de vérification de chaque inscription
 * se lisait dans le journal du serveur — c'est-à-dire, en production,
 * dans un agrégateur conservé des semaines, consultable par qui a accès
 * aux journaux, et qui n'est pas soumis à la purge des pièces d'identité
 * (INV-5). Un code lu là ouvre le compte de quelqu'un.
 *
 * Le corps ne s'y écrit pas davantage : il porte des montants, des
 * références, des créneaux, le nom d'un consultant.
 *
 * Reste ce qui suffit à exploiter un incident — quel courrier, pour quel
 * domaine, avec quelle issue. L'adresse complète est elle-même une
 * donnée nominative ; le domaine dit ce qu'on a besoin de savoir (« tous
 * les envois vers ce domaine échouent ») sans nommer personne.
 */
export const domaineDe = (adresse: string): string => {
  const arobase = adresse.lastIndexOf("@");
  return arobase === -1 || arobase === adresse.length - 1
    ? "(adresse sans domaine)"
    : adresse.slice(arobase + 1).toLowerCase();
};

/**
 * La trace d'un envoi. Un genre, un domaine, une issue — et rien d'autre.
 *
 * Le genre est donné par l'appelant plutôt que déduit de l'objet : déduire
 * du texte reviendrait à en journaliser un morceau, et un jour ce morceau
 * contiendrait un code.
 */
export const traceDEnvoi = (genre: string, adresse: string, issue: IssueDEnvoi): string =>
  `[courrier] ${genre} → @${domaineDe(adresse)} · ${issue}`;

// ── La lecture de SMTP_URL ──────────────────────────────────────────────

/**
 * Les délais, en millisecondes.
 *
 * Un envoi de courrier est sur le chemin d'une inscription : un candidat
 * attend devant son écran. Dix secondes pour ouvrir la connexion, dix
 * pour l'accueil, vingt pour la remise — au-delà, on rend la main plutôt
 * que de faire tourner un écran sur un serveur qui ne répondra pas.
 */
export const DELAI_CONNEXION_MS = 10_000;
export const DELAI_ACCUEIL_MS = 10_000;
export const DELAI_ENVOI_MS = 20_000;

/**
 * Une `SMTP_URL` lue.
 *
 * **Le mot de passe n'en sort pas.** La fonction rend `avecAuth: true`,
 * jamais l'identifiant ni le secret : ce qui n'est pas rendu ne peut pas
 * être journalisé par inadvertance, et l'adaptateur relit l'URL pour
 * lui-même au moment de construire le transport.
 */
export interface UrlSmtp {
  hote: string;
  port: number;
  /** Connexion chiffrée dès l'ouverture (`smtps:`), et non par STARTTLS. */
  implicite: boolean;
  avecAuth: boolean;
}

export type DefautDUrl =
  | "absente"
  | "illisible"
  | "schema_inconnu"
  | "hote_absent"
  | "port_invalide";

export const MOTIF_DEFAUT: Record<DefautDUrl, string> = {
  absente: "SMTP_URL n'est pas renseignée : aucun courrier ne part.",
  illisible: "SMTP_URL n'est pas une adresse lisible (attendu smtp://… ou smtps://…).",
  schema_inconnu: "SMTP_URL doit commencer par smtp:// ou smtps://.",
  hote_absent: "SMTP_URL ne nomme aucun hôte.",
  port_invalide: "Le port de SMTP_URL n'est pas un nombre entre 1 et 65535.",
};

/** Ports par défaut : 465 pour le TLS implicite, 587 pour la soumission. */
export const PORT_IMPLICITE = 465;
export const PORT_SOUMISSION = 587;

/**
 * Lit `SMTP_URL` et rend de quoi construire un transport — ou le défaut
 * qui l'en empêche.
 *
 * Aucun message d'erreur ne cite l'URL : une URL SMTP porte son mot de
 * passe, et un motif d'erreur finit toujours par être journalisé. Les
 * motifs décrivent donc la **forme** attendue, jamais la valeur reçue.
 */
export function analyserUrlSmtp(
  brute: string | undefined,
): { valide: true; url: UrlSmtp } | { valide: false; defaut: DefautDUrl } {
  const texte = (brute ?? "").trim();
  if (texte === "") return { valide: false, defaut: "absente" };

  let lue: URL;
  try {
    lue = new URL(texte);
  } catch {
    /*
      `URL` refuse en bloc, sans dire pourquoi — et les deux fautes
      qu'on commet réellement dans une URL SMTP sont un port hors
      bornes et un hôte oublié. Les nommer vaut la relecture qui suit :
      « SMTP_URL n'est pas lisible » devant `smtp://h:99999` envoie
      chercher le mauvais problème, et la règle du dépôt est qu'un
      message d'échec est actionnable.

      La relecture porte sur la **forme**, jamais sur la valeur : rien
      de ce qui est lu ici n'est rendu ni journalisé.
    */
    if (/^smtps?:\/\/[^/@]*@?:\d/iu.test(texte) && /^smtps?:\/\/:/iu.test(texte)) {
      return { valide: false, defaut: "hote_absent" };
    }
    const port = /^smtps?:\/\/[^/]*:(\d+)/iu.exec(texte)?.[1];
    if (port !== undefined) {
      const lu = Number(port);
      if (!Number.isInteger(lu) || lu < 1 || lu > 65535) {
        return { valide: false, defaut: "port_invalide" };
      }
    }
    return { valide: false, defaut: "illisible" };
  }

  if (lue.protocol !== "smtp:" && lue.protocol !== "smtps:") {
    return { valide: false, defaut: "schema_inconnu" };
  }
  if (lue.hostname === "") return { valide: false, defaut: "hote_absent" };

  const implicite = lue.protocol === "smtps:";
  let port = implicite ? PORT_IMPLICITE : PORT_SOUMISSION;
  if (lue.port !== "") {
    const lu = Number(lue.port);
    if (!Number.isInteger(lu) || lu < 1 || lu > 65535) {
      return { valide: false, defaut: "port_invalide" };
    }
    port = lu;
  }

  return {
    valide: true,
    url: { hote: lue.hostname, port, implicite, avecAuth: lue.username !== "" },
  };
}

/**
 * Ce que l'état de service peut dire du transport.
 *
 * **Une URL qui s'analyse ne prouve rien.** C'est la leçon de l'arbitrage
 * du 21/09 sur les capacités : une variable renseignée n'est pas un
 * service qui répond. La sonde ne conclut donc que sur un **fait** — un
 * envoi réel, ou une vérification de connexion réelle — et jamais sur la
 * forme d'une chaîne de caractères.
 *
 * La règle de lecture, elle, n'est plus ici : elle est commune à toutes
 * les sondes qui concluent sur un fait, et vit dans
 * `domain/exploitation/constats.ts` avec sa fraîcheur. Ce type-ci reste
 * la forme du fait tel que le module de courrier le tient pour son
 * propre processus.
 */
export interface DernierFait {
  reussi: boolean;
  quand: Date;
}
