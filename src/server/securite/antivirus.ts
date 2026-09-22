/**
 * Balayage antivirus — I.D (20/09/2026), branché le 22/09/2026.
 *
 * ── Ce qui n'a pas changé, et qui est tout ──────────────────────────
 *
 * **Une indisponibilité n'est jamais « sain ».** C'était la ligne à ne pas
 * franchir quand aucun moteur n'existait, et brancher un appel réseau
 * multiplie les façons de la franchir : un 500, un délai, un corps
 * illisible, un `status` inconnu. Tous rendent `INDISPONIBLE`, et
 * `balayerUnePiece` ne promeut que sur `SAINE`.
 *
 * ── Ce que l'adaptateur transmet ────────────────────────────────────
 *
 * Les octets, dans le corps d'un POST, une fois. **Jamais une URL** — ni
 * présignée, ni permanente. C'est la raison d'être des deux seaux : rien
 * ne lit la quarantaine hors d'ici, et confier à un tiers une adresse
 * qu'il pourrait rappeler demain rouvrirait exactement ce que la
 * quarantaine ferme.
 *
 * Le contrat lui-même vit dans le domaine (`domain/securite/balayage.ts`),
 * avec la raison pour laquelle c'est nous qui l'écrivons.
 *
 * ── Trois refus avant le réseau ─────────────────────────────────────
 *
 * L'URL doit être une adresse http(s) ; l'objet doit exister ; sa taille
 * doit tenir sous la limite. Les trois se vérifient sans appeler
 * personne, et les deux derniers évitent de charger en mémoire ce qu'on
 * refuserait ensuite.
 */
import {
  DELAI_BALAYAGE_MS,
  EICAR,
  TAILLE_MAXI_BALAYAGE_OCTETS,
  lireLaReponse,
  urlDuMoteurValide,
  type DernierBalayageDEssai,
  type Verdict,
} from "@/domain/securite/balayage";
import { sondeDuConstat, type Constat } from "@/domain/exploitation/constats";
import { lireEnQuarantaine, tailleEnQuarantaine } from "@/lib/storage";

export type { Verdict } from "@/domain/securite/balayage";

/**
 * Rend un verdict, toujours — y compris `INDISPONIBLE`. Ne lève pas : un
 * moteur muet est un cas ordinaire du métier, et c'est l'appelant qui
 * décide d'en faire une reprise.
 */
export type Balayeur = (objectKey: string) => Promise<Verdict>;

export const NON_BRANCHE: Balayeur = async () => ({
  etat: "INDISPONIBLE",
  cause: "non_configure",
  detail: "aucun moteur de balayage n'est configuré",
});

/** Les variables sans lesquelles le moteur n'existe pas. Voir `DEPENDANCES`. */
export const VARIABLES = ["ANTIVIRUS_URL"] as const;

/**
 * Lit le flux de quarantaine, sous plafond.
 *
 * Le plafond est appliqué **pendant** la lecture et non seulement sur la
 * taille annoncée : un objet dont les métadonnées mentent, ou qui grandit
 * entre la mesure et la lecture, ne doit pas pouvoir remplir la mémoire
 * du worker. La taille annoncée épargne le téléchargement dans le cas
 * ordinaire ; celle-ci est la garantie.
 */
async function lireSousPlafond(objectKey: string): Promise<Buffer | "trop_volumineux"> {
  const flux = await lireEnQuarantaine(objectKey);
  const morceaux: Buffer[] = [];
  let total = 0;
  for await (const morceau of flux) {
    const bloc = morceau as Buffer;
    total += bloc.length;
    if (total > TAILLE_MAXI_BALAYAGE_OCTETS) {
      flux.destroy();
      return "trop_volumineux";
    }
    morceaux.push(bloc);
  }
  return Buffer.concat(morceaux);
}

/**
 * L'appel lui-même, sur des octets déjà en main.
 *
 * Séparé de la lecture en quarantaine pour une raison de fond : la sonde
 * du moteur n'a pas de fichier déposé à lui donner, elle lui présente
 * EICAR. Les deux doivent emprunter **le même chemin réseau**, sans quoi
 * la sonde éprouverait un code que le balayage n'exécute pas.
 *
 * Le détail rendu décrit la **forme** de ce qui s'est passé — un code de
 * réponse, un délai — et jamais l'URL du moteur : elle peut porter un
 * jeton dans son chemin, et un détail finit toujours par atteindre un
 * journal.
 */
export async function balayerDesOctets(url: string, octets: Buffer): Promise<Verdict> {
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(octets),
      signal: AbortSignal.timeout(DELAI_BALAYAGE_MS),
    });
  } catch (erreur) {
    /*
      `AbortSignal.timeout` lève un `TimeoutError`. Le distinguer d'une
      coupure ne change pas la suite — les deux se reprennent — mais
      change ce que l'exploitant cherche : un moteur lent n'est pas un
      moteur injoignable.
    */
    const nom = (erreur as { name?: unknown })?.name;
    return nom === "TimeoutError" || nom === "AbortError"
      ? {
          etat: "INDISPONIBLE",
          cause: "delai_depasse",
          detail: `sans réponse après ${DELAI_BALAYAGE_MS} ms`,
        }
      : { etat: "INDISPONIBLE", cause: "injoignable", detail: "le moteur n'a pas répondu" };
  }

  if (!reponse.ok) {
    return { etat: "INDISPONIBLE", cause: "injoignable", detail: `réponse ${reponse.status}` };
  }

  const charge = await reponse.json().catch(() => null);
  return lireLaReponse(charge);
}

/**
 * L'adaptateur HTTP.
 *
 * Le détail rendu décrit la **forme** de ce qui s'est passé — un code de
 * réponse, un délai — et jamais l'URL du moteur : elle peut porter un
 * jeton dans son chemin, et un détail finit toujours par atteindre un
 * journal.
 */
export const balayeurHttp =
  (url: string): Balayeur =>
  async (objectKey: string): Promise<Verdict> => {
    if (!urlDuMoteurValide(url)) {
      return {
        etat: "INDISPONIBLE",
        cause: "non_configure",
        detail: "ANTIVIRUS_URL n'est pas une adresse http(s) utilisable",
      };
    }

    /*
      La taille d'abord : un objet absent et un objet trop gros se
      distinguent ici, sans qu'un octet soit transféré. Les deux cas se
      produisent pour de bon — le premier après une promotion déjà faite
      que la file rejoue.
    */
    const taille = await tailleEnQuarantaine(objectKey);
    if (taille === null) {
      return {
        etat: "INDISPONIBLE",
        cause: "objet_absent",
        detail: "aucun objet sous cette clé en quarantaine",
      };
    }
    if (taille > TAILLE_MAXI_BALAYAGE_OCTETS) {
      return {
        etat: "INDISPONIBLE",
        cause: "trop_volumineux",
        detail: `${taille} octets, au-delà de la limite de transmission`,
      };
    }

    let octets: Buffer;
    try {
      const lu = await lireSousPlafond(objectKey);
      if (lu === "trop_volumineux") {
        return {
          etat: "INDISPONIBLE",
          cause: "trop_volumineux",
          detail: "le flux dépasse la limite annoncée par les métadonnées",
        };
      }
      octets = lu;
    } catch {
      return {
        etat: "INDISPONIBLE",
        cause: "objet_absent",
        detail: "la lecture en quarantaine a échoué",
      };
    }

    return balayerDesOctets(url, octets);
  };

/**
 * Le balayeur que l'appelant exécutera, demandé au moment de s'en servir.
 *
 * L'état de service interroge cette fonction-là, et non une déclaration
 * tenue à la main : comparer ce qu'elle rend à `NON_BRANCHE` dit si un
 * adaptateur existe, sans qu'aucun registre puisse survivre au code qu'il
 * décrit.
 */
export const leBalayeur = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Balayeur => {
  const url = (environnement.ANTIVIRUS_URL ?? "").trim();
  return urlDuMoteurValide(url) ? balayeurHttp(url) : NON_BRANCHE;
};

/**
 * Le dépôt s'appuie dessus pour refuser un téléversement qu'il ne pourrait
 * pas contrôler.
 *
 * **Il exige un adaptateur disponible, et non une variable renseignée.**
 * Une `ANTIVIRUS_URL` remplie avec « à définir » passait le test de
 * présence et ne désigne aucun moteur : le dépôt se serait ouvert devant
 * un balayage qui n'aurait jamais lieu, et les pièces se seraient
 * accumulées en quarantaine sans que personne le sache avant la première
 * réclamation. La question posée est donc « le balayeur que j'obtiens
 * sait-il parler à quelque chose ? », ce qui est la même mécanique que
 * pour le reste des points de branchement.
 */
export const antivirusConfigure = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => leBalayeur(environnement) !== NON_BRANCHE;

/* ------------------------------------------------------------------ *
 * La sonde du moteur — ce qui autorise à dire « opérationnel ».
 * ------------------------------------------------------------------ */

/**
 * Le dernier essai d'EICAR, et rien d'autre.
 *
 * Même mécanique que le transport de courrier, et pour la même raison :
 * **une URL qui s'analyse ne prouve rien**. Une `ANTIVIRUS_URL` bien
 * formée devant un service muet, ou devant un service qui répond
 * poliment `{"status":"clean"}` à tout, passerait pour opérationnelle et
 * laisserait entrer chaque fichier dans le stockage de confiance. C'est
 * exactement la panne que I.D existe pour empêcher, et c'est la seule
 * qui ne se remarquerait pas.
 *
 * Le fait est établi par le worker au démarrage, jamais par
 * `/api/health` : cette adresse est interrogée par un répartiteur de
 * charge, et la décision du 21/09 est qu'elle ne déclenche rien.
 */
let dernierEssai: DernierBalayageDEssai | null = null;

export const noterLEssai = (reconnu: boolean, quand = new Date()): void => {
  dernierEssai = { reconnu, quand };
};

export const leDernierEssai = (): DernierBalayageDEssai | null => dernierEssai;

export const oublierLesEssais = (): void => {
  dernierEssai = null;
};

/**
 * La sonde de l'état de service. Locale, sans réseau, sans effet de bord.
 *
 * Le constat lui est **passé** : il vient de la base, parce que l'essai
 * est fait par le worker et lu par le processus web. À défaut — un
 * test, une commande hors ligne —, elle retombe sur l'essai du
 * processus courant.
 */
export const sonderLeBalayage = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
  constat: Constat | undefined = dernierEssai
    ? { reussi: dernierEssai.reconnu, quand: dernierEssai.quand }
    : undefined,
  maintenant = new Date(),
): ReturnType<typeof sondeDuConstat> =>
  sondeDuConstat(
    urlDuMoteurValide((environnement.ANTIVIRUS_URL ?? "").trim()),
    constat,
    maintenant,
  );

/**
 * Présente EICAR au moteur, et note ce qu'il en a dit.
 *
 * `INFECTEE` est la seule réponse qui vaut preuve. `SAINE` sur EICAR
 * n'est pas une bonne nouvelle : c'est un moteur qui répond sans
 * détecter, et il vaut mieux l'apprendre au démarrage du worker que sur
 * le premier fichier réellement infecté.
 *
 * Aucun fichier de candidat n'est transmis, aucune version n'est
 * touchée, rien n'est promu : la sonde emprunte le chemin réseau du
 * balayage et s'arrête là.
 */
export async function verifierLeMoteur(
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{ issue: "reconnu" | "muet" | "non_configure"; detail: string } | null> {
  const url = (environnement.ANTIVIRUS_URL ?? "").trim();
  if (!urlDuMoteurValide(url)) {
    // Pas de fait à noter : il n'y a pas de moteur à qui reprocher quoi
    // que ce soit. La capacité se lira « adaptateur absent », ce qui est
    // la vérité, et non « en panne ».
    return { issue: "non_configure", detail: "aucune adresse de moteur utilisable" };
  }

  const verdict = await balayerDesOctets(url, Buffer.from(EICAR, "ascii"));
  const reconnu = verdict.etat === "INFECTEE";
  noterLEssai(reconnu);
  return reconnu
    ? { issue: "reconnu", detail: "le moteur a signalé le fichier d'essai" }
    : {
        issue: "muet",
        detail:
          verdict.etat === "SAINE"
            ? "le moteur a déclaré sain le fichier d'essai : il répond sans détecter"
            : `le moteur n'a rien conclu (${verdict.cause})`,
      };
}
