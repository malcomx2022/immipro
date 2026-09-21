/**
 * L'adaptateur FedaPay — ouverture d'une transaction et de sa page.
 *
 * ── Ce qui n'a pas pu être vérifié ───────────────────────────────────
 *
 * **Aucune clé de bac à sable n'était disponible au moment d'écrire ce
 * fichier.** La forme des requêtes et des réponses ci-dessous est la
 * meilleure lecture qu'on ait pu faire de l'interface du fournisseur ;
 * elle n'a pas été confrontée à un serveur réel. C'est dit ici plutôt que
 * découvert en production.
 *
 * L'adaptateur est donc écrit pour **échouer bruyamment** sur tout ce
 * qu'il ne reconnaît pas, au lieu de continuer sur une supposition :
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
import type { DemandeDOuverture, Ouverture, Ouvreur } from "./ouvreur";
import type { Consultant } from "./consultation";

/** Le domaine, pas l'hôte : l'hôte exact n'a pas pu être vérifié. */
export const DOMAINES = ["fedapay.com"] as const;

const DELAI_MS = 15_000;

export const baseDe = (espace: string | undefined): string =>
  (espace ?? "sandbox").toLowerCase() === "live"
    ? "https://api.fedapay.com/v1"
    : "https://sandbox-api.fedapay.com/v1";

/**
 * Le fournisseur enveloppe l'entité dans une clé nommée d'après son type.
 * Les deux graphies rencontrées sont acceptées ; tout le reste est illisible.
 */
const schemaTransaction = z
  .object({
    "v1/transaction": z
      .object({
        id: z.union([z.string(), z.number()]),
        reference: z.string().nullish(),
        amount: z.number().nullish(),
        currency: z.object({ iso: z.string() }).nullish(),
      })
      .optional(),
    transaction: z
      .object({
        id: z.union([z.string(), z.number()]),
        reference: z.string().nullish(),
        amount: z.number().nullish(),
        currency: z.object({ iso: z.string() }).nullish(),
      })
      .optional(),
  })
  .transform((o) => o["v1/transaction"] ?? o.transaction);

const schemaJeton = z.object({ url: z.string().nullish() });

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
  if (statut >= 500) return { issue: "injoignable" };
  if (statut >= 400) return { issue: "refusee", detail: `réponse ${statut}` };
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
    if (!jeton) return { issue: "creee_sans_url", providerTxId, detail: "jeton injoignable" };
    const mauvais = issueDuStatut(jeton.statut);
    if (mauvais) {
      return { issue: "creee_sans_url", providerTxId, detail: `jeton refusé (${jeton.statut})` };
    }

    const lu = schemaJeton.safeParse(jeton.charge);
    const url = verifierLUrlHebergee(lu.success ? lu.data.url : null, DOMAINES);
    if (!url.valide) {
      return { issue: "creee_sans_url", providerTxId, detail: `url ${url.raison}` };
    }
    return { issue: "ouverte", session: { providerTxId, url: url.url, montant: 0, devise: "" } };
  }

  /** Lit l'entité, vérifie que notre référence revient, et rend la page. */
  async function depuisLEntite(charge: unknown, attendue: string): Promise<Ouverture> {
    const lu = schemaTransaction.safeParse(charge);
    if (!lu.success || !lu.data) {
      return { issue: "reponse_inattendue", detail: "transaction illisible au schéma" };
    }
    const entite = lu.data;

    /*
      La référence doit revenir telle quelle : c'est elle que
      `lireFedaPay` lit dans la notification signée pour retrouver le
      paiement. Si le fournisseur en impose une autre, le webhook
      arriverait sans savoir quoi confirmer — on refuse avant, plutôt que
      de laisser un paiement réglé sans dossier crédité.
    */
    if (entite.reference !== attendue) {
      return {
        issue: "reponse_inattendue",
        detail: "la référence interne n'est pas revenue telle quelle",
      };
    }
    if (typeof entite.amount !== "number" || !entite.currency?.iso) {
      return { issue: "reponse_inattendue", detail: "montant ou devise absents de la transaction" };
    }

    const providerTxId = `fedapay:${entite.id}`;
    const suite = await page(providerTxId, String(entite.id));
    if (suite.issue !== "ouverte") return suite;

    return {
      issue: "ouverte",
      session: {
        providerTxId,
        url: suite.session.url,
        // Le franc CFA n'a pas de sous-unité : le montant part et revient
        // en unités entières, sans conversion.
        montant: entite.amount,
        devise: entite.currency.iso.toUpperCase(),
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
          reference: demande.reference,
          callback_url: retourAbsolu(demande.retour),
        },
      });
      if (!reponse) return { issue: "injoignable" };
      const mauvais = issueDuStatut(reponse.statut);
      if (mauvais) return mauvais;
      return depuisLEntite(reponse.charge, demande.reference);
    },

    async retrouver(providerTxId: string, reference: string): Promise<Ouverture> {
      const identifiant = providerTxId.replace(/^fedapay:/u, "");
      const reponse = await appeler(
        base,
        cle,
        `/transactions/${encodeURIComponent(identifiant)}`,
        {},
      );
      if (!reponse) return { issue: "injoignable" };
      const mauvais = issueDuStatut(reponse.statut);
      if (mauvais) return mauvais;

      return depuisLEntite(reponse.charge, reference);
    },
  };
};

/* ------------------------------------------------------------------ *
 * Consultation — non opérationnelle, et c'est délibéré.
 * ------------------------------------------------------------------ */

/**
 * L'adaptateur de consultation FedaPay existe, et ne consulte rien.
 *
 * **Faute de documentation vérifiée, il n'y a pas de traduction
 * honnête.** Consulter une transaction demande de savoir quels états le
 * fournisseur prononce, et lesquels de ces états valent confirmation,
 * attente ou refus. Deviner cette table-là ne coûterait pas un défaut
 * d'affichage : elle décide si un candidat est crédité, et si un échec
 * lui est imputé. Un état mal traduit écrirait « paiement refusé » sur
 * le dossier de quelqu'un que personne n'a refusé.
 *
 * `lireFedaPay` traduit déjà des états reçus **en notification signée**,
 * et cette table-là a été écrite d'après des charges utiles observées.
 * La consultation est un autre appel, sur un autre objet, dont on n'a
 * pas la même assurance : la réutiliser telle quelle reviendrait à
 * supposer que les deux parlent le même vocabulaire.
 *
 * L'issue rendue est donc `indisponible`, qui est exacte : le job ne
 * conclut rien, la transaction suit la règle d'expiration de la
 * plateforme, et l'écart s'ouvre au délai prévu. C'est ce qui se passait
 * déjà — rien n'est perdu, et rien n'est inventé.
 *
 * Ce qu'il faut pour le brancher : la liste des états de transaction du
 * fournisseur et la forme de la réponse de consultation, vérifiées
 * contre le bac à sable (`npm run sandbox:paiement`).
 */
export const CONSULTATION_NON_OPERATIONNELLE =
  "consultation FedaPay non branchée : états du fournisseur non vérifiés";

export const consultantFedaPay = (): Consultant => ({
  fournisseur: "FEDAPAY",
  consulter: async () => ({
    issue: "indisponible",
    detail: CONSULTATION_NON_OPERATIONNELLE,
  }),
});
