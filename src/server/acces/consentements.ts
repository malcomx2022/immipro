import type { ConsentKind } from "@prisma/client";
import { db } from "@/lib/db";
import type { CodeConsentement } from "@/domain/comptes/consentements";

/**
 * Consentements — A-05, RG-02.1.
 *
 * La correspondance entre le code affiché et le genre stocké vit ici, et
 * non dans la route : deux lecteurs s'en servent désormais — l'écran des
 * autorisations, et la proposition de partenaire, qui ne se fait pas sans
 * accord (RG-13.1). Deux tables de correspondance divergeraient, et la
 * seconde lirait alors une autorisation que la première n'écrit plus.
 *
 * Une autorisation, un genre. La première version en regroupait plusieurs
 * par catégorie juridique, si bien que la lecture « la dernière ligne de ce
 * genre » répondait pour deux codes à la fois.
 */
export const GENRE_DU_CONSENTEMENT: Record<CodeConsentement, ConsentKind> = {
  pieces_identite: "PIECES_IDENTITE",
  pieces_financieres: "PIECES_FINANCIERES",
  alertes_regles: "ALERTES_REGLES",
  partenaires: "PARTENAIRES",
  mesure_audience: "MESURE_AUDIENCE",
};

/**
 * Version des textes acceptés. Elle date la preuve : « il a accepté », sans
 * dire quoi, ne prouve rien le jour où le texte a changé.
 */
export const VERSION_TEXTES = "1.0";

/**
 * Une autorisation est accordée quand la **dernière** ligne de son genre
 * l'accorde et n'a pas été retirée. Pas « une ligne à `granted: true`
 * quelque part » : un accord donné puis retiré laisse deux lignes, et la
 * première dirait oui pour toujours.
 */
export async function autorisationAccordee(
  userId: string,
  code: CodeConsentement,
): Promise<boolean> {
  const derniere = await db.consent.findFirst({
    where: { userId, kind: GENRE_DU_CONSENTEMENT[code] },
    orderBy: { grantedAt: "desc" },
  });
  return Boolean(derniere?.granted && !derniere.revokedAt);
}

/**
 * Écriture d'un changement d'autorisation.
 *
 * On ne modifie jamais la ligne précédente : on la date comme retirée, puis
 * on en écrit une nouvelle. Un consentement est une preuve, et une preuve
 * qu'on réécrit n'en est plus une — la question n'est pas « a-t-il
 * accepté ? » mais « qu'avait-il accepté le jour où la pièce a été
 * analysée ? ».
 */
export async function enregistrerLAutorisation(
  userId: string,
  code: CodeConsentement,
  accorde: boolean,
  version = VERSION_TEXTES,
  maintenant = new Date(),
): Promise<void> {
  const kind = GENRE_DU_CONSENTEMENT[code];
  await db.$transaction([
    db.consent.updateMany({
      where: { userId, kind, revokedAt: null },
      data: { revokedAt: maintenant },
    }),
    db.consent.create({
      data: { userId, kind, granted: accorde, version, grantedAt: maintenant },
    }),
  ]);
}
