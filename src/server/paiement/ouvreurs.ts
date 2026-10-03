/**
 * Le point de branchement de l'ouverture — un seul, comme ailleurs.
 *
 * Le rail suit la devise (N.A) : le client ne choisit jamais son
 * fournisseur, et n'a aucun moyen de le demander. Ce module traduit une
 * devise en adaptateur, et rend `null` quand la clé sortante manque.
 *
 * `null` n'est pas « on se débrouille sans » : c'est « on ne peut pas
 * ouvrir de paiement ». L'appelant refuse avant d'écrire quoi que ce soit,
 * plutôt que d'ouvrir une attente que rien ne viendra clore.
 *
 * Les clés ne sont lues qu'ici et passées aux adaptateurs, qui les
 * mettent dans un en-tête. Elles n'atteignent aucun journal, aucune
 * réponse, et aucun composant client — rien de ce module n'est importable
 * depuis le navigateur.
 */
import type { Devise } from "@/domain/payments/pricing";
import { fournisseurDe } from "@/domain/payments/rail";
import { CLES, clesDe, environnementNormalise, fournisseursActifs } from "./secrets";
import { adaptateurFedaPay } from "./fedapay";
import { adaptateurStripe } from "./stripe";
import type { Ouvreur } from "./ouvreur";

/**
 * Les variables sans lesquelles aucun paiement ne s'ouvre. `APP_URL` en
 * fait partie : les deux fournisseurs exigent une adresse de retour
 * absolue, et une adresse de retour relative n'en est pas une.
 */
export const VARIABLES: readonly string[] = [
  CLES.FEDAPAY.apiKey,
  CLES.STRIPE.apiKey,
  "APP_URL",
];

/**
 * Configurée quand chaque fournisseur **ouvert** a sa clé sortante, et
 * `APP_URL` posée. Un rail fermé par `PAIEMENT_FOURNISSEURS` n'en exige
 * pas : le pilote FedaPay seul ne se lit plus « non configuré » faute de
 * clé Stripe (03/10/2026).
 */
export const ouvertureConfiguree = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => {
  const lu = environnementNormalise(environnement);
  const requises = [...fournisseursActifs(lu).map((f) => clesDe(f).apiKey), "APP_URL"];
  return requises.every((v) => (lu[v] ?? "").trim() !== "");
};

const renseignee = (valeur: string | undefined): string | null => {
  const propre = (valeur ?? "").trim();
  return propre === "" ? null : propre;
};

/**
 * L'ouvreur que l'appelant exécutera pour cette devise, ou `null`.
 *
 * Demandé à l'appel et non au chargement du module : une clé ajoutée sans
 * redémarrage doit prendre effet, et un test doit pouvoir poser l'inverse.
 */
export function lOuvreur(
  devise: Devise,
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Ouvreur | null {
  const lu = environnementNormalise(environnement);
  const racine = renseignee(lu.APP_URL);
  if (!racine) return null;

  // L'adresse de retour est composée ici, à partir d'une racine que la
  // plateforme décide. Rien de ce que le navigateur envoie n'y entre.
  const retourAbsolu = (chemin: string): string => new URL(chemin, racine).toString();

  // Un rail fermé n'ouvre rien, même si une clé traîne dans l'environnement.
  if (!fournisseursActifs(lu).includes(fournisseurDe(devise))) return null;

  if (fournisseurDe(devise) === "FEDAPAY") {
    const cle = renseignee(lu[CLES.FEDAPAY.apiKey]);
    return cle ? adaptateurFedaPay(cle, lu[CLES.FEDAPAY.environnement], retourAbsolu) : null;
  }
  const cle = renseignee(lu[CLES.STRIPE.apiKey]);
  return cle ? adaptateurStripe(cle, retourAbsolu) : null;
}
