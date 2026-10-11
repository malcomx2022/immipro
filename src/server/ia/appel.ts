import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { CauseDAppel } from "@/domain/ia/appel";
import { coutMicrosDesJetons } from "@/domain/backoffice/couts";
import { tarifDu, type CodeFournisseur } from "@/domain/ia/fournisseurs";
import { etatDeMesure, partConnue } from "@/domain/ia/usage";

/**
 * La plomberie que les deux chaînes d'appel au modèle partagent — WF-06,
 * WF-08, INV-6.
 *
 * ── Pourquoi ce module, à côté de `domain/ia/appel.ts` ──────────────
 *
 * Le module de domaine a déjà tranché la **politique** : les six causes,
 * et laquelle se rejoue. Son commentaire dit pourquoi il existe —
 * « recopier ces six causes dans le second module aurait produit deux
 * sources pour une même règle ; elles divergent toujours ».
 *
 * La plomberie qui l'alimente, elle, était restée en double. Trois
 * fonctions identiques vivaient à la fois dans `dossiers/extracteur.ts`
 * et dans `redaction/adaptateur.ts` : celle qui traduit une erreur du SDK
 * en cause, celle qui concatène le texte rendu, et celle qui écrit les
 * jetons consommés. Elles ne pouvaient pas vivre dans le domaine — il
 * s'interdit le SDK et Prisma, et c'est exactement ce que ces trois-là
 * touchent. Elles vivent donc ici, une fois.
 *
 * Les deux copies ont été comparées avant d'être fusionnées, sur onze
 * erreurs y compris `null`, une `Error` nue et un `TimeoutError` sans
 * prototype du SDK : **zéro écart de classification**. La fusion ne change
 * donc aucun comportement — c'est ce qu'il fallait établir avant de la
 * faire, et le test qui l'a établi reste comme garde-fou.
 */

/**
 * De quelle chaîne il s'agit, pour le journal d'exploitation.
 *
 * Les détails partent dans `engineLog`, que lit un exploitant : « le
 * service de lecture n'a pas répondu » lui dit laquelle des deux chaînes
 * est en cause, là où « le service » le laisse chercher. C'est la seule
 * chose qui différait entre les deux copies, et elle est conservée.
 */
export interface ChaineDAppel {
  /** « la clé d'extraction », « la clé d'appel ». */
  cle: string;
  /** « le service de lecture », « le service ». */
  service: string;
  /** Délai au-delà duquel l'appel est abandonné, en millisecondes. */
  delaiMs: number;
}

/**
 * Traduit une erreur du SDK en l'une des six causes du domaine.
 *
 * L'ordre des branches est significatif : les erreurs du SDK héritent les
 * unes des autres — `APIConnectionTimeoutError` étend `APIConnectionError`,
 * qui étend `APIError` — et tester la plus générale d'abord absorberait
 * les deux autres.
 *
 * Le dernier cas ne suppose rien : une erreur qui n'est pas du SDK peut
 * venir d'un `AbortController` posé au-dessus, et elle se reconnaît alors
 * à son nom. Tout le reste est « injoignable », qui est la conclusion la
 * plus prudente — elle fait rejouer, ce qu'une erreur inconnue mérite plus
 * qu'un abandon.
 */
export function causeDeLErreur(
  erreur: unknown,
  chaine: ChaineDAppel,
): { cause: CauseDAppel; detail: string } {
  const horsDelai = {
    cause: "delai_depasse" as const,
    detail: `sans réponse après ${chaine.delaiMs} ms`,
  };
  const muet = { cause: "injoignable" as const, detail: `${chaine.service} n'a pas répondu` };

  if (erreur instanceof Anthropic.AuthenticationError) {
    return { cause: "non_configure", detail: `${chaine.cle} est refusée` };
  }
  if (erreur instanceof Anthropic.PermissionDeniedError) {
    return { cause: "non_configure", detail: `${chaine.cle} n'a pas accès à ce modèle` };
  }
  if (erreur instanceof Anthropic.RateLimitError) {
    return { cause: "service_sature", detail: "la cadence d'appel est dépassée" };
  }
  if (erreur instanceof Anthropic.BadRequestError) {
    return {
      cause: "reponse_illisible",
      detail: "la demande a été refusée telle qu'elle est formée",
    };
  }
  if (erreur instanceof Anthropic.APIConnectionTimeoutError) return horsDelai;
  if (erreur instanceof Anthropic.APIConnectionError) return muet;
  // Le client ne suit aucune redirection (`OPTIONS_DU_CLIENT`, S.171).
  if (erreur instanceof Anthropic.APIError && typeof erreur.status === "number" && erreur.status >= 300 && erreur.status < 400) {
    return {
      cause: "non_configure",
      detail: `${chaine.service} renvoie vers une autre adresse (réponse ${erreur.status}) : rien n'y a été envoyé ; vérifier ANTHROPIC_BASE_URL`,
    };
  }
  if (erreur instanceof Anthropic.APIError) {
    return { cause: "injoignable", detail: `réponse ${erreur.status ?? "sans code"}` };
  }

  const nom = (erreur as { name?: unknown })?.name;
  return nom === "TimeoutError" || nom === "AbortError" ? horsDelai : muet;
}

/** Le texte que le modèle a rendu, concaténé. Les blocs de réflexion sont ignorés. */
export const texteRendu = (message: Anthropic.Message): string =>
  message.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === "text")
    .map((bloc) => bloc.text)
    .join("");

/**
 * Ce qu'un appel a consommé — INV-6.
 *
 * Écrit même quand l'appel n'a rien rendu : une réponse coupée au plafond
 * a coûté ses jetons. L'omettre en ferait un appel gratuit dans B-07, ce
 * que l'invariant appelle un dépassement silencieux.
 *
 * ── Ce qui décide d'écrire — S.173, REV11-L2 ────────────────────────
 *
 * La ligne s'écrivait dès qu'un compteur n'était pas nul, et l'appel sans
 * mesure disparaissait : un fournisseur qui ne transmet pas l'usage
 * passait pour gratuit, sans trace. Ce qui décide est désormais **la
 * réponse du fournisseur** (`appel`) : présente, l'appel a eu lieu et a pu
 * être facturé, et il s'inscrit — mesuré, en partie, ou pas du tout, et
 * l'état le dit (`usageMeasure`). Absente, aucun appel n'a abouti à une
 * réponse, et rien n'est écrit. Un zéro mesuré est une mesure : il
 * s'inscrit aussi.
 *
 * Les compteurs arrivent déjà validés (`domain/ia/usage.ts`) : des entiers
 * positifs qui tiennent dans la colonne, ou `null`. Aucune écriture ne peut
 * plus échouer en SQL après l'appel à cause d'eux — l'échec faisait
 * rejouer le job, et payer l'appel deux fois.
 *
 * Le prix du jeton n'est pas mesuré tant qu'aucun tarif n'est configuré ;
 * `costMicros` porte alors zéro, et B-07 ne le lit pas — il recalcule
 * depuis les jetons et le tarif du jour, pour qu'une ligne écrite avant le
 * tarif ne compte pas comme gratuite. La route de rédaction écrivait `0`
 * en dur, ce qui donnait le même nombre pour une raison différente : elle
 * ne l'aurait pas mis à jour le jour du tarif. C'est la divergence que
 * cette fonction a déjà coûté une fois, et la raison pour laquelle elle
 * n'existe plus qu'ici.
 */
export async function noterLesJetons(
  userId: string,
  applicationId: string,
  operation: string,
  jetonsEntree: number | null,
  jetonsSortie: number | null,
  /**
   * Chez qui l'appel est parti — S.94. Absent quand aucun appel n'a abouti
   * à une réponse : rien n'est alors écrit. La ligne est sinon datée de son
   * fournisseur et de son modèle, et tarifée au prix **de ce fournisseur**,
   * jamais à celui d'un autre.
   */
  appel?: AppelMesure,
): Promise<void> {
  if (!appel) return;
  const entree = partConnue(jetonsEntree);
  const sortie = partConnue(jetonsSortie);
  await db.aiUsage.create({
    data: {
      userId,
      applicationId,
      operation,
      provider: appel.fournisseur,
      model: appel.modele,
      inputTokens: entree,
      outputTokens: sortie,
      usageMeasure: etatDeMesure(jetonsEntree, jetonsSortie),
      // La part connue, au tarif de ce fournisseur : un minorant quand la
      // mesure est incomplète, et B-07 le dit.
      costMicros: coutMicrosDesJetons(tarifDu(process.env, appel.fournisseur), entree, sortie) ?? 0,
    },
  });
}

/** Le fournisseur et le modèle d'un appel qui a eu lieu. */
export interface AppelMesure {
  fournisseur: CodeFournisseur;
  modele: string;
}
