/**
 * Les noms des secrets des fournisseurs de paiement, en un seul endroit.
 *
 * ── Ce qui divergeait ────────────────────────────────────────────────
 *
 * `.env.example` portait `FEDAPAY_SECRET_KEY` et `STRIPE_SECRET_KEY` ; le
 * code demandait `FEDAPAY_API_KEY` et `STRIPE_API_KEY`. Personne ne lisait
 * les premières, personne ne renseignait les secondes : un exploitant qui
 * remplissait consciencieusement le fichier d'exemple obtenait une
 * installation que le registre des dépendances déclarait non configurée,
 * sans que rien ne dise laquelle des deux graphies était la bonne.
 *
 * ── La nomenclature ──────────────────────────────────────────────────
 *
 * `<FOURNISSEUR>_<USAGE>`, et l'usage distingue le **sens** de l'appel,
 * parce que c'est ce qui change tout en exploitation :
 *
 * | Suffixe | Sens | Ce que c'est |
 * |---|---|---|
 * | `_API_KEY` | sortant | la clé serveur avec laquelle **nous** appelons le fournisseur : création, consultation, remboursement |
 * | `_WEBHOOK_SECRET` | entrant | le secret avec lequel **il** signe ce qu'il nous envoie, et dont la vérification fait foi (RG-05.1) |
 * | `_ENVIRONMENT` | ni l'un ni l'autre | l'espace visé, `sandbox` ou `live` — ce n'est pas un secret |
 *
 * `_SECRET_KEY` disait « secret » sans dire dans quel sens, alors que
 * `_WEBHOOK_SECRET` en est un aussi. Une clé sortante et un secret entrant
 * ne se révoquent pas au même endroit et ne fuient pas de la même façon :
 * les confondre sur un incident coûte des minutes qu'on n'a pas.
 *
 * Une clé `_API_KEY` ne doit jamais atteindre le navigateur. Le seul code
 * qui la lira est un adaptateur serveur ; aucun composant client ne la
 * référence, et l'absence de préfixe `NEXT_PUBLIC_` le garantit.
 *
 * ── Aucune valeur de secret n'est jamais journalisée ─────────────────
 *
 * Ce module nomme des variables, il n'en lit la valeur que pour la
 * recopier. Les avertissements qu'il émet portent des **noms**, jamais des
 * valeurs, ni même une empreinte ou une longueur : un journal de serveur
 * se recopie dans un ticket, et un ticket se partage.
 */

/** Ce dont chaque fournisseur a besoin, par usage. */
export const CLES = {
  FEDAPAY: {
    apiKey: "FEDAPAY_API_KEY",
    webhook: "FEDAPAY_WEBHOOK_SECRET",
    environnement: "FEDAPAY_ENVIRONMENT",
  },
  STRIPE: {
    apiKey: "STRIPE_API_KEY",
    webhook: "STRIPE_WEBHOOK_SECRET",
  },
} as const;

/** Les clés sortantes, celles sans lesquelles aucune demande ne part. */
export const CLES_SORTANTES: readonly string[] = [CLES.FEDAPAY.apiKey, CLES.STRIPE.apiKey];

/** Les secrets entrants, ceux qui font foi sur une notification. */
export const SECRETS_ENTRANTS: readonly string[] = [CLES.FEDAPAY.webhook, CLES.STRIPE.webhook];

/**
 * Les anciens noms, acceptés le temps que les déploiements existants
 * suivent — et pas un jour de plus.
 *
 * Une compatibilité sans date se transforme en convention parallèle : au
 * bout de six mois, plus personne ne sait laquelle des deux graphies fait
 * autorité, et le défaut qu'on corrige aujourd'hui revient sous une autre
 * forme. Le retrait est donc daté, et un test échoue quand la date est
 * passée — voir `tests/secrets-paiement.test.ts`.
 */
export const RETRAIT_DES_ANCIENS_NOMS = "2026-12-31";

export const ANCIENS_NOMS: Readonly<Record<string, string>> = {
  FEDAPAY_SECRET_KEY: CLES.FEDAPAY.apiKey,
  STRIPE_SECRET_KEY: CLES.STRIPE.apiKey,
};

/** Une fois par nom et par processus : un avertissement répété ne se lit plus. */
const deja = new Set<string>();

/** Pour les tests, qui ont besoin de revoir l'avertissement. */
export const oublierLesAvertissements = (): void => deja.clear();

const renseignee = (valeur: string | undefined): boolean => (valeur ?? "").trim().length > 0;

/**
 * Rend l'environnement avec les anciens noms repliés sur les nouveaux.
 *
 * C'est **le seul** point où l'ancienne graphie est comprise. Tout ce qui
 * est en aval — le registre des dépendances, les adaptateurs, l'état de
 * service — ne connaît que la nomenclature, et ne peut donc pas en
 * diverger. Le jour du retrait, il n'y a qu'`ANCIENS_NOMS` à vider.
 *
 * Le nouveau nom l'emporte quand les deux sont renseignés : une migration
 * à moitié faite ne doit pas dépendre de l'ordre de lecture.
 */
export function environnementNormalise(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | undefined> {
  const normalise: Record<string, string | undefined> = { ...source };
  for (const [ancien, nouveau] of Object.entries(ANCIENS_NOMS)) {
    if (!renseignee(source[ancien]) || renseignee(source[nouveau])) continue;
    normalise[nouveau] = source[ancien];
    if (!deja.has(ancien)) {
      deja.add(ancien);
      // Des noms, jamais des valeurs. Et la date de retrait, parce qu'un
      // avertissement sans échéance se lit comme une préférence de style.
      console.warn(
        `[config] ${ancien} est dépréciée : renommer en ${nouveau}. ` +
          `L'ancien nom cesse d'être lu le ${RETRAIT_DES_ANCIENS_NOMS}.`,
      );
    }
  }
  return normalise;
}
