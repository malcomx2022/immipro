import { z } from "zod";
import { getPack, RECHARGE_ANALYSES, CONSULTATION, type Devise } from "./pricing";

/**
 * Ce qui s'achète, et comment cela se nomme d'un bout à l'autre.
 *
 * ── Ce qui n'allait pas ─────────────────────────────────────────────
 *
 * Le récapitulatif recevait `{ code, libelle, prix }` — trois chaînes
 * sans catégorie. Il la redevinait au moment d'envoyer, sur le code :
 *
 *     achat.code === "recharge" ? { type: "recharge" } : { type: "pack", code }
 *
 * Une consultation tombait donc dans la branche des packs. L'écran
 * affichait « Consultation de 45 minutes » et son prix, correctement, et
 * sérialisait `{ type: "pack", code: "consultation" }`. Rien ne s'en
 * plaignait : le serveur acceptait un pack nommé `consultation`,
 * enregistrait ce code, et `getPack("consultation")` ne rendant rien,
 * n'ouvrait aucun droit. Le montant partait, l'achat n'existait pas.
 *
 * Ce n'était pas une faute d'inattention : le type ne permettait pas de
 * mieux faire. `code: string` autorise toutes les catégories et n'en
 * décrit aucune, et la troisième est arrivée sans que rien n'oblige à
 * relire la conversion.
 *
 * ── Ce qui le remplace ──────────────────────────────────────────────
 *
 * Une union discriminée, portée par le domaine et partagée : l'écran, la
 * route et la couche d'accès nomment la même chose du même mot. La
 * catégorie ne se redevine plus, elle se transporte.
 *
 * Chaque fonction qui la traverse le fait par un `switch` exhaustif —
 * `jamais: never` en fin de liste. Une quatrième catégorie ne se
 * compilera pas tant qu'on n'aura pas dit, un par un : ce qu'elle coûte,
 * sous quel code elle s'enregistre, et si le récapitulatif peut l'ouvrir.
 * C'est la question qui n'a pas été posée pour la consultation.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
export type Achat =
  | { type: "pack"; code: string }
  | { type: "recharge" }
  | { type: "consultation" };

export type CategorieDAchat = Achat["type"];

/**
 * Le corps que la route accepte — et rien d'autre.
 *
 * Il vit ici plutôt que dans la route pour que les deux extrémités
 * dérivent du même type : `z.infer` de ce schéma **est** `Achat`, et la
 * route le vérifie en confiant le résultat de l'analyse à une fonction
 * qui attend un `Achat`, sans conversion forcée. Un schéma qui
 * divergerait de l'union ne compilerait plus.
 */
export const schemaAchat = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pack"), code: z.string().min(1) }),
  z.object({ type: z.literal("recharge") }),
  z.object({ type: z.literal("consultation") }),
]) satisfies z.ZodType<Achat>;

/**
 * Ce qui part sur le fil.
 *
 * On pourrait croire un `{ ...achat }` suffisant, puisque l'union a déjà
 * la forme attendue. Il ne l'est pas : le jour où une catégorie porte un
 * champ de plus — un libellé, un volume, un identifiant de créneau —, la
 * copie l'emporterait sans que personne l'ait voulu. Ici, ce qui n'est
 * pas écrit ne part pas.
 */
export function corpsDAchat(achat: Achat): Achat {
  switch (achat.type) {
    case "pack":
      return { type: "pack", code: achat.code };
    case "recharge":
      return { type: "recharge" };
    case "consultation":
      return { type: "consultation" };
    default: {
      const jamais: never = achat;
      throw new Error(`Achat non sérialisable : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Le paramètre `achat` d'une adresse, relu en catégorie.
 *
 * Un code inconnu rend `null` plutôt qu'un achat à zéro : c'est une
 * adresse fabriquée, et l'écran ne doit rien proposer de payer.
 */
export function achatDuParametre(parametre: string): Achat | null {
  if (parametre === "recharge") return { type: "recharge" };
  if (parametre === "consultation") return { type: "consultation" };
  return getPack(parametre) ? { type: "pack", code: parametre } : null;
}

export interface Tarif {
  libelle: string;
  prix: Record<Devise, number>;
}

/**
 * Le tarif d'un achat, pris sur la grille et jamais recopié.
 *
 * Le récapitulatif l'affiche, le serveur le recalcule à la création : les
 * deux passent par ici, si bien qu'un montant affiché est le montant
 * enregistré, ou rien ne s'ouvre.
 *
 * Rend `null` pour un code de pack absent de la grille — le seul cas où
 * une catégorie connue ne porte pas de prix.
 */
export function tarifDe(achat: Achat): Tarif | null {
  switch (achat.type) {
    case "pack": {
      const pack = getPack(achat.code);
      return pack ? { libelle: pack.libelle, prix: pack.prix } : null;
    }
    case "recharge":
      return { libelle: RECHARGE_ANALYSES.libelle, prix: RECHARGE_ANALYSES.prix };
    case "consultation":
      return { libelle: CONSULTATION.libelle, prix: CONSULTATION.prix };
    default: {
      const jamais: never = achat;
      throw new Error(`Achat sans tarif : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Le code écrit dans `Transaction.packCode`.
 *
 * La colonne porte historiquement le code du pack ; les compléments y
 * inscrivent leur catégorie. Ce n'est pas élégant, c'est ce que la base
 * contient depuis l'origine — et ce que la relecture doit savoir défaire,
 * d'où `achatDepuisLeCode` juste en dessous. Les deux vivent côte à côte
 * pour qu'on ne puisse pas en changer une sans voir l'autre.
 */
export function codeEnregistre(achat: Achat): string {
  switch (achat.type) {
    case "pack":
      return achat.code;
    case "recharge":
      return "recharge";
    case "consultation":
      return "consultation";
    default: {
      const jamais: never = achat;
      throw new Error(`Achat sans code : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Les catégories dont le code est le nom, et qui ne sont donc pas des
 * packs. Elles vivent ici parce que `codeEnregistre` juste au-dessus les
 * écrit, et qu'une requête qui cherche « tout ce qui n'est pas un pack »
 * doit lire cette liste plutôt qu'en tenir une seconde.
 */
const SANS_CODE_PROPRE = {
  recharge: { type: "recharge" },
  consultation: { type: "consultation" },
} as const satisfies Record<string, Achat>;

export const CODES_HORS_PACK: readonly string[] = Object.keys(SANS_CODE_PROPRE);

/**
 * La relecture de `Transaction.packCode`.
 *
 * ── Une catégorie relue comme si un inconnu l'avait fournie ─────────
 *
 * Cette fonction déléguait à `achatDuParametre`, qui lit **un paramètre
 * d'adresse** : une chaîne qu'un visiteur peut fabriquer, et dont un code
 * de pack absent de la grille ne doit rien ouvrir. Appliquée à un code
 * que `codeEnregistre` a écrit, la même règle rend `null` pour un pack
 * simplement **retiré de l'offre** — et les lecteurs se sont mis à
 * compenser, chacun à sa façon :
 *
 *     achatDepuisLeCode("essentiel_2025") = null
 *       Attente.tsx   : « pack »     (par un `?? { type: "pack" }`)
 *       confirme/page : « pack »     (le même `??`)
 *       Echec.tsx     : « inconnue » (pas de repli — et donc aucun lien
 *                                     de reprise proposé)
 *     tunnelDuPaiement : « pack »    (par `notIn: ["recharge",
 *                                     "consultation"]`, la liste
 *                                     complémentaire écrite à la main)
 *
 * Quatre lecteurs du même code, trois réponses. C'est le défaut que ce
 * module a été écrit pour clore — « le récapitulatif la redevinait au
 * moment d'envoyer, sur le code » — réapparu de l'autre côté de la base.
 *
 * ── Deux questions, et une seule était posée ────────────────────────
 *
 * **De quelle catégorie est cet achat ?** La réponse est toujours
 * connue : c'est `codeEnregistre` qui a écrit ce code, et il n'écrit que
 * trois formes. Un pack retiré reste un pack.
 *
 * **Peut-on le racheter ?** Non, s'il n'est plus à la grille — mais cela
 * se demande à `tarifDe`, qui rend `null` pour un pack sans prix, et non
 * à la catégorie.
 *
 * Les confondre faisait perdre au candidat le bouton qui le ramène au
 * paiement, sur l'écran où il en a le plus besoin.
 */
export function achatDepuisLeCode(code: string): Achat {
  return SANS_CODE_PROPRE[code as keyof typeof SANS_CODE_PROPRE] ?? { type: "pack", code };
}

/**
 * Les achats que le récapitulatif ($-02) a le droit d'ouvrir.
 *
 * ── Pourquoi une consultation n'en est pas ──────────────────────────
 *
 * Depuis l'arbitrage du 21/09/2026, une consultation payée confirme un
 * créneau **tenu** : la notification signée retrouve le rendez-vous par
 * `Appointment.transactionId`, le passe à `RESERVE` et ouvre l'accès du
 * consultant. Une transaction de consultation ouverte hors de T-05 ne
 * cite aucun rendez-vous — la notification ne trouverait rien à
 * confirmer, et le candidat aurait payé une consultation abstraite : pas
 * d'horaire, pas de consultant, rien à tenir.
 *
 * Le récapitulatif ne sait pas tenir un créneau, et ce n'est pas son
 * office. La consultation se paie donc là où l'horaire existe.
 *
 * Le `switch` est exhaustif à dessein : la question « cet achat
 * a-t-il besoin de quelque chose que le récapitulatif ne fournit pas ? »
 * doit se poser pour chaque catégorie ajoutée, plutôt que de se répondre
 * toute seule par un `true` par défaut.
 */
export function ouvrableDepuisLeRecapitulatif(achat: Achat): boolean {
  switch (achat.type) {
    case "pack":
      return true;
    case "recharge":
      return true;
    case "consultation":
      return false;
    default: {
      const jamais: never = achat;
      throw new Error(`Achat non arbitré : ${JSON.stringify(jamais)}`);
    }
  }
}
