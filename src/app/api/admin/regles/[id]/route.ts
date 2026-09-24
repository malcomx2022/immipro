import { z } from "zod";
import { route } from "@/server/http/route";
import { enregistrerLesTextes } from "@/server/regles/edition";
import { publierLaRegle } from "@/server/regles/publication";

/**
 * Édition et publication d'une règle — B-02, WF-14.
 *
 * Trois garde-fous, et aucun n'est décidé ici : la route valide la forme de
 * ce qu'elle reçoit, et passe la main.
 *
 * 1. **INV-3.** L'enregistrement écrit toujours un brouillon — celui qui
 *    existe, ou celui qu'il ouvre à partir de la version en vigueur. Il
 *    écrivait dans la version en vigueur quand la procédure n'avait pas de
 *    brouillon, c'est-à-dire dans la ligne que `Application.visaRuleId`
 *    fige : la checklist de tous les dossiers ouverts dessus changeait d'un
 *    coup. `server/regles/edition.ts` porte la décision.
 * 2. **Le vocabulaire (INV-1, INV-2).** Refusé là où le candidat verra le
 *    texte, et pas sur un brouillon : `CLAUDE.md` protège le texte en cours
 *    d'écriture, et la publication oppose le refus.
 * 3. **La source (RG-14.2).** Une règle de source secondaire ne se publie
 *    pas — `publierLaRegle` le refuse, et le dit au lieu de rendre une
 *    erreur de contrainte.
 *
 * Deux façons d'écrire, et l'écran n'en emploie qu'une. B-02 n'édite que
 * les deux textes destinés au candidat ; la branche `payload` reste la
 * porte de WF-14 étape 3 pour un éditeur complet. Aucune des deux ne porte
 * le payload chargé à l'ouverture de la page : le serveur part de la ligne
 * qu'il écrit, et recolle. Un autre veilleur a pu passer entre-temps.
 */
export const PUT = route({
  nom: "admin.regle.maj",
  acces: "veilleur",
  limite: "sensible",
  corps: z.discriminatedUnion("champ", [
    z.object({
      champ: z.literal("payload"),
      rules: z.unknown(),
      sourceUrl: z.string().url().optional(),
      nextReviewAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
      notes: z.string().max(4000).optional(),
    }),
    z.object({
      champ: z.literal("textes"),
      libelleCandidat: z.string().trim().min(1).max(300),
      reserveCandidat: z.string().trim().max(1000),
    }),
  ]),
  traiter: ({ corps, params, acteur }) =>
    enregistrerLesTextes(
      params.id!,
      corps.champ === "textes"
        ? {
            champ: "textes",
            libelleCandidat: corps.libelleCandidat,
            reserveCandidat: corps.reserveCandidat,
          }
        : {
            champ: "payload",
            payload: corps.rules as never,
            ...(corps.sourceUrl ? { sourceUrl: corps.sourceUrl } : {}),
            ...(corps.nextReviewAt ? { nextReviewAt: corps.nextReviewAt } : {}),
            ...(corps.notes !== undefined ? { notes: corps.notes } : {}),
          },
      { email: acteur!.email },
    ),
});

/**
 * Publication — WF-14 étape 5. La version en vigueur passe en `ARCHIVED`
 * avec son `effectiveTo`, la nouvelle en `PUBLISHED`, et WF-11 se déclenche.
 *
 * L'accès est administrateur et non veilleur : séparer qui rédige de qui
 * publie est la première moitié de la relecture que WF-14 §4 demande pour
 * toute modification de condition bloquante. La seconde vit dans
 * `server/regles/publication.ts` : le publicateur ne peut pas être celui
 * qui a écrit la version.
 */
export const POST = route({
  nom: "admin.regle.publication",
  acces: "admin",
  limite: "sensible",
  corps: z.object({ motif: z.string().trim().min(3).max(500) }),
  traiter: ({ corps, params, acteur }) =>
    publierLaRegle(params.id!, { id: acteur!.id, email: acteur!.email }, corps.motif),
});
