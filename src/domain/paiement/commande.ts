import type { Pack } from "@/domain/payments/pricing";

/**
 * Ce qui retient le candidat sur un écran du tunnel — WF-05, $-01 et $-02.
 *
 * ── Un modèle que personne ne construisait ──────────────────────────
 *
 * Ce module portait un type `Commande` — pack, devise, numéro, conditions —
 * et son en-tête annonçait « deux règles tenues par le type » : aucun pack
 * présélectionné, aucune case pré-cochée. Le type ne tenait rien : **aucun
 * fichier de `src/` ne le construisait ni ne le lisait**. Le tunnel est déjà
 * modélisé par `Achat` et `Tunnel`, que les écrans emploient pour de bon.
 *
 * Les deux règles étaient donc tenues ailleurs, par hasard plutôt que par le
 * type : chaque écran garde son propre état, et tous deux partaient bien au
 * bon défaut. Ce qui ne l'était pas, c'est la conséquence :
 *
 *     obstacleAuRecapitulatif  → « Choisis un pack pour continuer. »
 *     ChoixDuPack.tsx:167      → « Choisis un pack pour continuer. »
 *
 *     obstacleAuPaiement       → « Accepte les conditions d'utilisation
 *                                  pour payer. »
 *     Recapitulatif.tsx:215    → « Accepte les conditions d'utilisation
 *                                  pour payer. »
 *
 * Deux phrases, chacune écrite deux fois : une fois ici, où un test la
 * tient, et une fois dans l'écran, où le candidat la lit. La copie tenue
 * était la morte. Changer la phrase de l'écran ne faisait échouer aucun
 * test ; changer celle du domaine ne changeait rien à l'écran.
 *
 * ── Ce qui reste, et sur quoi ───────────────────────────────────────
 *
 * Les décisions, exprimées sur ce que les écrans ont réellement sous la
 * main : un pack retenu ou non, une case cochée ou non. Le modèle parallèle
 * disparaît — l'introduire dans les écrans aurait mis deux représentations
 * du même tunnel dans du code vivant, ce qui est pire que le défaut.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Ce qui manque pour passer au récapitulatif, ou `null`.
 *
 * **Aucun pack n'est présélectionné sur $-01.** Une mise en avant visuelle
 * n'est pas un choix fait à la place du candidat, et c'est sur un écran de
 * paiement que la nuance compte le plus. La règle vit dans l'état de
 * l'écran, et un test lit cet état plutôt qu'une fabrique que personne
 * n'appelle.
 */
export const obstacleAuRecapitulatif = (packRetenu: Pack | null): string | null =>
  packRetenu === null ? "Choisis un pack pour continuer." : null;

/**
 * Ce qui manque pour déclencher le paiement, ou `null`.
 *
 * **La case des conditions part décochée.** Le prototype la cochait d'avance
 * sur $-02 — l'écran même qui porte l'acceptation et la mention de
 * non-garantie. Une case pré-cochée n'est pas un consentement.
 *
 * Le pack n'entre pas dans cette question : sur $-02 il est déjà retenu, ou
 * bien l'achat est une recharge ou une consultation, qui n'ont pas de pack.
 * L'ancienne version exigeait un pack ici, et aurait refusé de payer une
 * recharge.
 */
export const obstacleAuPaiement = (conditionsAcceptees: boolean): string | null =>
  conditionsAcceptees ? null : "Accepte les conditions d'utilisation pour payer.";

export const paiementPossible = (conditionsAcceptees: boolean): boolean =>
  obstacleAuPaiement(conditionsAcceptees) === null;

/**
 * Référence de transaction, préfixe IMP. Elle est la seule chose à citer au
 * support : elle apparaît sur $-04, $-05 et $-06, et jamais un code d'erreur.
 */
export const formaterReference = (reference: string): string =>
  reference.toUpperCase();
