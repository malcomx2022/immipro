/**
 * L'adaptateur FedaPay — ouverture d'une transaction et de sa page.
 *
 * ── Documenté, et toujours pas éprouvé ───────────────────────────────
 *
 * Écrit sans clé de bac à sable et sans source, ce fichier supposait une
 * enveloppe `{"v1/transaction": …}` autour de chaque réponse. La
 * documentation publique de FedaPay, lue le 22/09/2026, décrit des
 * réponses **plates**. Autrement dit, tel qu'il a été déployé,
 * l'adaptateur refusait chaque réponse réelle et **aucun paiement en
 * francs CFA ne pouvait s'ouvrir** — sur le rail de la clientèle visée.
 * L'avertissement qui tenait cette place annonçait le risque ; il ne
 * pouvait pas nommer le défaut.
 *
 * Ce qui suit est donc conforme à une **documentation**, ce qui vaut
 * mieux qu'une supposition et moins qu'une exécution. Aucune clé de bac
 * à sable n'est disponible : rien ici n'a rencontré un serveur. Le jour
 * où des clés existent, `npm run sandbox:paiement` confronte tout cela
 * au bac à sable, et c'est cette exécution qui fera foi, pas ce
 * commentaire.
 *
 * L'adaptateur reste écrit pour **échouer bruyamment** sur ce qu'il ne
 * reconnaît pas, au lieu de continuer sur une supposition :
 *
 * - la réponse est lue au schéma, et ce qui n'y est pas déclaré n'atteint
 *   pas le code qui décide ;
 * - la référence interne rendue par le fournisseur est **comparée** à
 *   celle qu'on a envoyée. Si elle ne revient pas telle quelle, la
 *   notification signée ne saurait pas quel paiement elle confirme, et
 *   l'ouverture est refusée plutôt que de mener à un paiement orphelin ;
 * - l'URL est vérifiée — https, domaine du fournisseur — avant qu'un
 *   navigateur y soit envoyé.
 *
 * Le jour où des clés existent, `npm run sandbox:paiement` confronte tout
 * cela au bac à sable, et c'est cette exécution qui fait foi, pas ce
 * commentaire.
 *
 * ── Deux appels, et pourquoi l'issue intermédiaire existe ────────────
 *
 * La transaction est créée d'abord, sa page ensuite. Entre les deux, un
 * échec réseau laisserait une transaction chez le fournisseur dont on
 * aurait perdu l'identifiant — et la tentative suivante en créerait une
 * seconde. L'issue `creee_sans_url` rend cet identifiant : il est
 * enregistré, et `retrouver` reprend là où on s'est arrêté.
 */
import { z } from "zod";
import { verifierLUrlHebergee } from "@/domain/paiement/ouverture";
import { SANS_REPONSE } from "./ouvreur";
import type { DemandeDOuverture, Ouverture, Ouvreur } from "./ouvreur";
import type { Consultant, EtatConsulte } from "./consultation";
import { CAUSES_FEDAPAY, ETATS_FEDAPAY, referenceMarchande } from "./notifications";
import type { Rembourseur } from "./rembourseur";

/** Le domaine, pas l'hôte : l'hôte exact n'a pas pu être vérifié. */
export const DOMAINES = ["fedapay.com"] as const;

const DELAI_MS = 15_000;

export const baseDe = (espace: string | undefined): string =>
  (espace ?? "sandbox").toLowerCase() === "live"
    ? "https://api.fedapay.com/v1"
    : "https://sandbox-api.fedapay.com/v1";

/**
 * L'entité, telle que la documentation la décrit — correctif du 22/09/2026.
 *
 * ── Ce que ce schéma refusait ───────────────────────────────────────
 *
 * Il exigeait une clé racine, `"v1/transaction"` ou `"transaction"`, et
 * rendait « illisible » tout le reste. La documentation publique de
 * FedaPay montre des réponses **plates** sur les trois points d'appel
 * qu'on utilise — création, lecture, jeton de paiement. Si elle dit
 * vrai, chaque réponse tombait en `reponse_inattendue`, donc en
 * `ouverture_refusee` : **aucun paiement en francs CFA ne pouvait
 * s'ouvrir**, sur le rail de la clientèle visée.
 *
 * C'est le défaut que l'avertissement en tête de ce fichier annonçait
 * sans pouvoir le nommer : la forme n'avait pas été confrontée à une
 * source. Elle l'est maintenant à la documentation — pas à un serveur,
 * faute de clés de bac à sable, et la différence reste écrite ici.
 *
 * ── Pourquoi les deux formes sont acceptées ─────────────────────────
 *
 * La plate, parce que c'est celle que la documentation décrit.
 * L'enveloppée, parce qu'elle a été écrite à partir de quelque chose et
 * qu'une documentation peut retarder sur une API. Les accepter toutes
 * les deux ne coûte rien et ne rend rien ambigu : c'est une lecture, les
 * deux formes sont reconnaissables, et refuser la bonne est le seul des
 * deux risques qui se paie — il bloque le rail.
 */
const champsDeLEntite = {
  id: z.union([z.string(), z.number()]),
  /**
   * La référence **de FedaPay** (`trx_…`), qu'il génère lui-même. Ce
   * n'est pas la nôtre — voir `referenceMarchande`.
   */
  reference: z.string().nullish(),
  /**
   * Là où voyage notre référence — 03/10/2026.
   *
   * `custom_metadata` est le seul champ de la création documentée qui
   * revienne tel quel (sur la lecture et dans l'événement). Lu en
   * `unknown` : un objet vide peut revenir sérialisé en tableau, et un
   * schéma strict refuserait alors toute la transaction.
   */
  custom_metadata: z.unknown().optional(),
  merchant_reference: z.string().nullish(),
  amount: z.number().nullish(),
  /** L'état de la transaction — lu par la consultation (RG-05.4). */
  status: z.string().nullish(),
  /**
   * La devise, sous l'une de ses deux formes documentées.
   *
   * La création accepte `currency: { iso }` ; la lecture rend
   * `currency_id`, un entier qui ne dit pas le code ISO. Une transaction
   * qui ne porte que l'identifiant n'est donc pas comparable en devise —
   * ce qui n'est pas une raison de la refuser, mais une raison de le
   * dire (voir `depuisLEntite`).
   */
  currency: z.object({ iso: z.string() }).nullish(),
  currency_id: z.union([z.string(), z.number()]).nullish(),
};

const entite = z.object(champsDeLEntite);

const schemaTransaction = z
  .union([
    // Plate, telle que la documentation la décrit.
    entite,
    // Enveloppée, sous l'une des deux graphies rencontrées.
    z
      .object({ "v1/transaction": entite.optional(), transaction: entite.optional() })
      .transform((o) => o["v1/transaction"] ?? o.transaction),
  ])
  .transform((lue) => lue ?? null);

/**
 * Le jeton de paiement — `POST /transactions/{id}/token`, réponse plate
 * `{ token, url }` d'après la documentation. Seule l'URL nous sert, et
 * elle est vérifiée avant qu'un navigateur y soit envoyé.
 */
const schemaJeton = z.object({ token: z.string().nullish(), url: z.string().nullish() });

async function appeler(
  base: string,
  cle: string,
  chemin: string,
  options: { corps?: unknown; idempotence?: string },
): Promise<{ statut: number; charge: unknown } | null> {
  const entetes: Record<string, string> = {
    Authorization: `Bearer ${cle}`,
    Accept: "application/json",
  };
  if (options.corps !== undefined) entetes["Content-Type"] = "application/json";
  /*
    `Idempotency-Key` n'est **pas documenté** chez FedaPay (vérifié le
    22/09/2026 sur la référence d'API). L'en-tête part quand même : il ne
    coûte rien, et un serveur qui l'honore nous rend service.

    Mais rien n'autorise à s'y fier, et le commentaire qui l'affirmait a
    été retiré. Ce qui protège réellement d'un second débit sur ce rail
    est la reprise de la transaction locale (`creerOuReprendre`) : une
    même référence rouvre la même session au lieu d'en créer une
    seconde. C'est une protection de notre côté, qui ne suppose rien du
    leur — et c'est la seule qu'on ait ici.
  */
  if (options.idempotence) entetes["Idempotency-Key"] = options.idempotence;

  try {
    const reponse = await fetch(`${base}${chemin}`, {
      method: options.corps === undefined ? "GET" : "POST",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
      signal: AbortSignal.timeout(DELAI_MS),
    });
    return { statut: reponse.status, charge: await reponse.json().catch(() => null) };
  } catch {
    return null;
  }
}

/** Traduit un code de réponse en issue, avant toute lecture du corps. */
const issueDuStatut = (statut: number): Ouverture | null => {
  if (statut >= 500) {
    return { issue: "injoignable", statut, detail: "le fournisseur est en panne" };
  }
  if (statut >= 400) return { issue: "refusee", statut, detail: `réponse ${statut}` };
  return null;
};

export const adaptateurFedaPay = (
  cle: string,
  espace: string | undefined,
  retourAbsolu: (chemin: string) => string,
): Ouvreur => {
  const base = baseDe(espace);

  /** La seconde étape, partagée par `creer` et `retrouver`. */
  async function page(providerTxId: string, identifiant: string): Promise<Ouverture> {
    const jeton = await appeler(base, cle, `/transactions/${identifiant}/token`, { corps: {} });
    if (!jeton) {
      return { issue: "creee_sans_url", providerTxId, detail: `jeton : ${SANS_REPONSE}` };
    }
    const mauvais = issueDuStatut(jeton.statut);
    if (mauvais) {
      return {
        issue: "creee_sans_url",
        providerTxId,
        statut: jeton.statut,
        detail: `jeton refusé (${jeton.statut})`,
      };
    }

    const lu = schemaJeton.safeParse(jeton.charge);
    const url = verifierLUrlHebergee(lu.success ? lu.data.url : null, DOMAINES);
    if (!url.valide) {
      return { issue: "creee_sans_url", providerTxId, detail: `url ${url.raison}` };
    }
    return { issue: "ouverte", session: { providerTxId, url: url.url, montant: 0, devise: "" } };
  }

  /** Lit l'entité, vérifie que notre référence revient, et rend la page. */
  async function depuisLEntite(
    charge: unknown,
    attendue: string,
    deviseDemandee: string,
  ): Promise<Ouverture> {
    const lu = schemaTransaction.safeParse(charge);
    if (!lu.success || !lu.data) {
      return { issue: "reponse_inattendue", detail: "transaction illisible au schéma" };
    }
    const entite = lu.data;

    /*
      Notre référence, si elle revient, doit être la nôtre : une autre
      désignerait une transaction qui n'est pas celle qu'on ouvre. Si elle
      ne revient pas — la réponse de création n'est pas tenue de rendre
      les métadonnées —, l'identifiant suffit : il est enregistré à
      l'ouverture, et la notification signée retrouve le paiement par lui.
      La référence que FedaPay génère (`reference`) n'est jamais comparée.
    */
    const lue = referenceMarchande(entite);
    if (lue !== null && lue !== attendue) {
      return {
        issue: "reponse_inattendue",
        detail: "la référence interne n'est pas revenue telle quelle",
      };
    }
    if (typeof entite.amount !== "number") {
      return { issue: "reponse_inattendue", detail: "montant absent de la transaction" };
    }

    const providerTxId = `fedapay:${entite.id}`;
    const suite = await page(providerTxId, String(entite.id));
    if (suite.issue !== "ouverte") return suite;

    /*
      La devise ne revient pas toujours sous une forme comparable : la
      documentation montre `currency_id`, un entier, là où la création
      accepte `currency: { iso }`. Sans code ISO, la comparaison de
      `ouvertureConcorde` n'a rien à comparer.

      On rend alors **la devise demandée**, et non une devise inventée ni
      une chaîne vide. Ce n'est pas une vérification qu'on contourne :
      c'en est une qu'on n'a pas, et l'appelant continue de comparer le
      montant, qui est le chiffre par lequel une divergence se manifeste.
      Rendre une chaîne vide, comme avant, faisait échouer la comparaison
      à tous les coups et refusait l'ouverture.
    */
    return {
      issue: "ouverte",
      session: {
        providerTxId,
        url: suite.session.url,
        // Le franc CFA n'a pas de sous-unité : le montant part et revient
        // en unités entières, sans conversion.
        montant: entite.amount,
        devise: (entite.currency?.iso ?? deviseDemandee).toUpperCase(),
      },
    };
  }

  return {
    fournisseur: "FEDAPAY",

    async creer(demande: DemandeDOuverture): Promise<Ouverture> {
      const reponse = await appeler(base, cle, "/transactions", {
        idempotence: demande.cle,
        corps: {
          description: demande.intitule,
          amount: demande.montant,
          currency: { iso: demande.devise },
          // Notre référence voyage ici, pas dans `reference`, que FedaPay
          // génère lui-même — voir `referenceMarchande`.
          custom_metadata: { reference: demande.reference },
          callback_url: retourAbsolu(demande.retour),
        },
      });
      if (!reponse) return { issue: "injoignable", detail: SANS_REPONSE };
      const mauvais = issueDuStatut(reponse.statut);
      if (mauvais) return mauvais;
      return depuisLEntite(reponse.charge, demande.reference, demande.devise);
    },

    async retrouver(providerTxId: string, reference: string, devise: string): Promise<Ouverture> {
      const identifiant = providerTxId.replace(/^fedapay:/u, "");
      const reponse = await appeler(
        base,
        cle,
        `/transactions/${encodeURIComponent(identifiant)}`,
        {},
      );
      if (!reponse) return { issue: "injoignable", detail: SANS_REPONSE };
      const mauvais = issueDuStatut(reponse.statut);
      if (mauvais) return mauvais;

      /*
        La devise de la transaction locale est passée en repli, et c'est
        nécessaire ici plus qu'à la création : la documentation montre
        `currency_id`, un entier, sur **la lecture**. Une chaîne vide —
        ce que ce code passait — faisait échouer `ouvertureConcorde` à
        tous les coups : chaque reprise d'un paiement en francs CFA
        ouvrait un écart en back-office et refusait le candidat, alors
        que rien ne divergeait.

        Le montant, lui, reste comparé à ce que la plateforme a décidé,
        et c'est par lui qu'une divergence réelle se manifeste.
      */
      return depuisLEntite(reponse.charge, reference, devise);
    },
  };
};

/* ------------------------------------------------------------------ *
 * Consultation — RG-05.4, branchée le 22/09/2026.
 * ------------------------------------------------------------------ */

/**
 * La consultation d'une transaction, pour rattraper un webhook perdu.
 *
 * ── Ce qui la débloque ──────────────────────────────────────────────
 *
 * Elle était laissée non opérationnelle faute de savoir « quels états le
 * fournisseur prononce, et lesquels valent confirmation, attente ou
 * refus ». Deviner cette table-là ne coûte pas un défaut d'affichage :
 * elle décide si un candidat est crédité, et si un échec lui est imputé.
 *
 * La documentation publique donne la liste, lue le 22/09/2026 :
 * `pending`, `approved`, `canceled`, `refunded`, `declined`,
 * `transferred`. Elle **coïncide** avec `ETATS_FEDAPAY`, écrite d'après
 * des charges utiles de notification observées — deux sources
 * indépendantes qui disent la même chose, ce qui est la meilleure
 * assurance qu'on puisse avoir sans clés de bac à sable.
 *
 * La table n'est donc pas recopiée ici : c'est **la même**, importée. Une
 * seconde table divergerait le jour où l'une des deux serait corrigée, et
 * la notification signée et la réconciliation se mettraient à traduire
 * le même mot différemment.
 *
 * ── Ce qu'elle refuse toujours de conclure ──────────────────────────
 *
 * Un état hors table rend `indisponible`, jamais un refus : c'est la
 * frontière du module de consultation, et elle vaut ici comme ailleurs —
 * une absence de réponse n'est pas un refus bancaire.
 */
export const consultantFedaPay = (cle: string, espace: string | undefined): Consultant => {
  const base = baseDe(espace);

  return {
    fournisseur: "FEDAPAY",

    async consulter(providerTxId: string | null, reference: string): Promise<EtatConsulte> {
      // Sans identifiant, aucune session n'a été ouverte : il n'y a rien
      // à demander, et le dire vaut mieux que d'appeler à vide.
      if (!providerTxId) {
        return { issue: "indisponible", detail: "aucun identifiant de transaction" };
      }

      const identifiant = providerTxId.replace(/^fedapay:/u, "");
      const reponse = await appeler(
        base,
        cle,
        `/transactions/${encodeURIComponent(identifiant)}`,
        {},
      );
      if (!reponse) return { issue: "indisponible", detail: "fournisseur injoignable" };
      if (reponse.statut === 404) return { issue: "introuvable" };
      if (reponse.statut >= 400) {
        return { issue: "indisponible", detail: `réponse ${reponse.statut}` };
      }

      const lu = schemaTransaction.safeParse(reponse.charge);
      if (!lu.success || !lu.data) {
        return { issue: "indisponible", detail: "transaction illisible au schéma" };
      }
      const entite = lu.data;

      /*
        La transaction rendue doit être la nôtre. Une référence qui ne
        correspond pas n'est pas une panne : c'est un désaccord, et on
        n'applique rien dessus.
      */
      const lue = referenceMarchande(entite);
      if (lue !== null && lue !== reference) {
        return { issue: "incoherent", detail: "la référence rendue n'est pas la nôtre" };
      }

      const brut = (entite.status ?? "").toLowerCase();
      const statut = ETATS_FEDAPAY[brut];
      if (!statut) {
        /*
          Un état que la table ne connaît pas. On ne le traduit pas « au
          plus proche » : le job ne conclut rien, la transaction suit la
          règle d'expiration de la plateforme, et l'écart s'ouvre au
          délai prévu. C'est ce qui se passait quand rien n'était branché
          — rien n'est perdu, et rien n'est inventé.
        */
        return { issue: "indisponible", detail: "état non reconnu" };
      }

      const cause = CAUSES_FEDAPAY[brut];
      return {
        issue: "connu",
        statut,
        providerTxId: `fedapay:${entite.id}`,
        ...(cause ? { cause } : {}),
      };
    },
  };
};

/* ------------------------------------------------------------------ *
 * Remboursement sortant — il n'y a pas d'API, et c'est un fait.
 * ------------------------------------------------------------------ */

/**
 * L'adaptateur de remboursement FedaPay : une procédure, pas un appel.
 *
 * ── Pourquoi aucun appel ne part — relu le 25/09/2026 ───────────────
 *
 * La documentation de FedaPay, dans sa version courante comme dans la
 * v1, ne décrit **aucune API de remboursement** : le remboursement est un
 * geste au tableau de bord (bouton « Rembourser », courriel du client,
 * motif), possible **par MTN Mobile Money seulement**. La référence d'API
 * liste la création, la lecture, la mise à jour et la suppression d'une
 * transaction, son jeton de paiement, et des dépôts (`/payouts`) — rien
 * qui rende un paiement.
 *
 * Les deux chemins qui y ressemblent ont été écartés, et la raison reste
 * écrite pour qu'on ne les rouvre pas par distraction :
 *
 * - `PUT /transactions/{id}` avec `status: "refunded"` : rien ne
 *   documente qu'écrire cet état **déplace de l'argent**. Il pourrait
 *   n'étiqueter que la ligne — une dette « soldée » chez eux sans que le
 *   candidat ait rien reçu ;
 * - `POST /payouts` : un **nouveau** versement vers un numéro, sans lien
 *   avec le paiement d'origine, sans idempotence documentée. Une reprise
 *   après une coupure pourrait payer deux fois. C'est une autre décision
 *   métier, pas un remboursement.
 *
 * ── La procédure retenue (arbitrage S.91) ───────────────────────────
 *
 * L'initiation se fait comme sur l'autre rail — tentative réservée,
 * droits non consommés retirés une fois (K.C) —, puis cet adaptateur rend
 * `procedure_manuelle`. L'appelant ouvre un écart en B-04 avec le geste à
 * faire, ce qui sort la dette de la passe de relance : cinq relances d'un
 * rail sans API n'auraient compté que des tentatives qui n'ont pas eu lieu.
 *
 * L'opérateur rembourse au tableau de bord, puis déclare la référence du
 * remboursement (`declarerLeRemboursementManuel`). Cette déclaration pose
 * `refundRequestedAt` — « demandé », pas « versé ». La dette reste due et
 * visible jusqu'à la notification signée `refunded` de FedaPay, seule à
 * écrire `refundedAt` (INV-7).
 *
 * L'adaptateur ne reçoit pas la clé d'API : il n'en a pas l'usage, et ce
 * qu'il n'a pas, il ne peut ni l'envoyer ni le journaliser.
 *
 * `operationnel` reste `false` : rien d'automatique ne rembourse sur ce
 * rail, et la capacité continue de se lire non branchée. C'est la vérité,
 * et c'est ce que la décision d'exploitation doit voir.
 */
export const REMBOURSEMENT_NON_OPERATIONNEL =
  "FedaPay n'expose aucune API de remboursement : le geste se fait au tableau de bord du fournisseur, par MTN Mobile Money uniquement, puis sa référence se déclare en B-04";

export const remboursementFedaPay = (): Rembourseur => ({
  fournisseur: "FEDAPAY",
  operationnel: false,
  demander: async () => ({
    issue: "procedure_manuelle",
    detail: REMBOURSEMENT_NON_OPERATIONNEL,
  }),
});
