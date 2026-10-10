import { revalidatePath } from "next/cache";
import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { documentPourEdition } from "@/server/lecture/editorial";
import {
  MOTIF_CORRECTION_EN_LIGNE,
  champsDeLaVersion,
  enregistrerUneVersion,
} from "@/server/acces/editorial";
import {
  corpsSchema,
  verifierLeDocument,
  type GenreDocument,
} from "@/domain/editorial/document";
import { exigerUnTexteAffichable } from "@/server/editorial/publication";

/** Le motif, consigné au journal d'audit : les trois actions l'exigent. */
const MOTIF = z.string().min(3).max(500);

const CHEMIN: Record<GenreDocument, string> = {
  GUIDE: "/guides",
  ARTICLE: "/articles",
};

/**
 * Le document **et** sa rubrique.
 *
 * Oublier l'index laisserait un guide publié invisible une heure depuis la
 * page qui existe pour le trouver — le pire des deux, puisque l'adresse
 * directe marcherait et que personne ne saurait pourquoi la liste ne le
 * montre pas.
 */
function revalider(genre: GenreDocument, slug: string): void {
  revalidatePath(`${CHEMIN[genre]}/${slug}`);
  revalidatePath(CHEMIN[genre]);
}

/**
 * Édition et publication d'un document éditorial — B-08, J.C.
 *
 * Le vocabulaire interdit est vérifié **à chaque enregistrement** et ne
 * bloque que ce que le public verra. La nuance est celle que `CLAUDE.md`
 * décrit : « sa publication est bloquée tant que la formulation est
 * refusée ». Refuser aussi le brouillon empêcherait d'enregistrer un texte
 * en cours d'écriture, et pousserait à rédiger ailleurs pour recoller à la
 * fin — c'est-à-dire hors du garde-fou.
 *
 * « Que la publication » était trop étroit, et la phrase suivante de ce
 * même fichier le disait déjà : enregistrer un document **en ligne** est
 * une publication, tout comme y restaurer une version. Les trois chemins
 * passent par `exigerUnTexteAffichable`, qui porte la règle et son motif.
 *
 * La négation reste reconnue, comme partout : « ImmiPro ne garantit pas
 * l'obtention du visa » est exactement la phrase qu'un guide doit pouvoir
 * écrire, et c'est celle qui protège.
 *
 * Le slug ne figure pas dans le corps de la requête. Il est l'adresse
 * publique : la changer casse les liens entrants, qui sont tout l'intérêt
 * d'un contenu de référencement.
 */
export const PUT = route({
  nom: "admin.contenu.maj",
  acces: "veilleur",
  limite: "sensible",
  corps: z.object({
    titre: z.string().min(3).max(200),
    chapeau: z.string().max(600),
    corps: z.unknown().optional(),
    source: z.string().max(200).optional(),
    verifieeLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
    pays: z.string().max(80).optional(),
    rubrique: z.string().max(80).optional(),
    auteur: z.string().max(80).optional(),
  }),
  async traiter({ corps, params, acteur }) {
    const document = await db.editorialDoc.findUnique({ where: { id: params.id } });
    if (!document) throw echec("introuvable");

    const lu = corpsSchema.safeParse(corps.corps);
    if (!lu.success) {
      throw echec("champs_invalides", {
        champs: Object.fromEntries(
          lu.error.issues.map((i) => [i.path.map(String).join(".") || "corps", i.message]),
        ),
      });
    }

    /**
     * Un document en ligne n'a pas de brouillon : l'enregistrer publie.
     * Le refus vient donc **avant** l'écriture, et non après — un texte
     * refusé ne doit pas même s'installer dans la ligne que la page
     * publique relit.
     */
    if (document.status === "PUBLIE") {
      exigerUnTexteAffichable({ titre: corps.titre, chapeau: corps.chapeau }, lu.data, "enLigne");
    }

    await db.editorialDoc.update({
      where: { id: document.id },
      data: {
        title: corps.titre,
        standfirst: corps.chapeau,
        body: lu.data,
        sourceLabel: corps.source?.trim() || null,
        verifiedAt: corps.verifieeLe ? new Date(`${corps.verifieeLe}T00:00:00Z`) : null,
        ...(corps.pays !== undefined ? { countryLabel: corps.pays.trim() || null } : {}),
        ...(corps.rubrique !== undefined ? { section: corps.rubrique.trim() || null } : {}),
        ...(corps.auteur !== undefined ? { author: corps.auteur.trim() || null } : {}),
      },
    });

    /**
     * Un document déjà publié dont on enregistre une correction doit la
     * montrer : la page est en cache, et rien d'autre ne l'invalide.
     *
     * **Et cet enregistrement-là est une publication** — P.B. Le texte
     * change sous les yeux du public à la seconde, sans passer par le
     * bouton. Ne versionner que le bouton aurait laissé l'historique
     * troué sur le chemin le plus courant, la correction d'un guide en
     * ligne, tout en promettant une preuve de ce qui était public.
     *
     * Le motif n'est pas demandé ici, parce que cette route n'en demande
     * pas et qu'exiger une justification pour corriger une coquille
     * pousserait à ne pas corriger. Il dit donc ce qui s'est passé, ce
     * qui est déjà plus que rien.
     */
    if (document.status === "PUBLIE") {
      const rang = await enregistrerUneVersion(document.id, {
        par: acteur!.id,
        motif: MOTIF_CORRECTION_EN_LIGNE,
      });
      await journaliser({
        acteurId: acteur!.id,
        action: "contenu.publication",
        cible: `contenu:${document.id}`,
        motif: MOTIF_CORRECTION_EN_LIGNE,
        details: { genre: document.kind, slug: document.slug, version: rang },
      }).catch(() => undefined);
      revalider(document.kind as GenreDocument, document.slug);
    }

    // Les fautes sont rendues, pas opposées : elles s'affichent à côté du
    // champ, et c'est la publication qui les refusera.
    return {
      enregistre: true,
      refus: verifierLeDocument({ titre: corps.titre, chapeau: corps.chapeau }, lu.data),
    };
  },
});

/**
 * Publication, retrait et restauration — WF-14 dans l'esprit.
 *
 * Un guide n'a pas de version figée par un dossier : INV-3 ne s'y applique
 * pas, et publier une correction n'alerte personne. Ce qui reste de la
 * publication d'une règle, c'est le refus sur le vocabulaire, l'exigence de
 * source (INV-8) et la ligne de journal.
 *
 * **Et, depuis P.B, une version.** Ne pas figer un guide dans un dossier
 * ne dispense pas de savoir ce qui était public : le journal gardait qui
 * avait publié et pourquoi, sur un texte que la republication effaçait —
 * la trace désignait un contenu disparu. Chaque publication en conserve
 * désormais une copie immuable, que la ligne de journal référence par son
 * rang, et qu'on peut restaurer.
 */
export const POST = route({
  nom: "admin.contenu.publication",
  acces: "veilleur",
  limite: "sensible",
  /**
   * Une union discriminée, et non un champ optionnel : le rang n'a de sens
   * que pour la restauration, et le rendre facultatif aurait obligé la
   * route à vérifier à la main ce que le schéma sait exiger — puis à
   * refuser une requête mal formée avec le vocabulaire d'un refus de
   * publication, qui n'en est pas un.
   */
  corps: z.discriminatedUnion("action", [
    z.object({ action: z.literal("publier"), motif: MOTIF }),
    z.object({ action: z.literal("retirer"), motif: MOTIF }),
    z.object({
      action: z.literal("restaurer"),
      motif: MOTIF,
      /** Le rang de la version à restaurer — P.B. */
      version: z.number().int().positive(),
    }),
  ]),
  async traiter({ corps, params, acteur }) {
    const vue = await documentPourEdition(params.id!);

    if (corps.action === "retirer") {
      if (vue.etat !== "PUBLIE") {
        throw echec("etat_incompatible", {
          corps: "Ce document n'est pas publié : il n'y a rien à retirer.",
        });
      }
      await db.editorialDoc.update({
        where: { id: vue.id },
        data: { status: "RETIRE" },
      });
      await journaliser({
        acteurId: acteur!.id,
        action: "contenu.publication",
        cible: `contenu:${vue.id}`,
        motif: `Retrait — ${corps.motif}`,
        details: { genre: vue.genre, slug: vue.slug },
      });
      revalider(vue.genre, vue.slug);
      return { etat: "RETIRE" as const };
    }

    /**
     * Restaurer — P.B. Le texte d'une ancienne version revient sur le
     * document ; si celui-ci est publié, ce retour est lui-même une
     * publication et crée une version de plus. L'ancienne version n'est
     * pas ressuscitée : elle reste où elle est, et l'historique dit « le
     * 20 septembre, retour au texte du 3 mars ».
     */
    if (corps.action === "restaurer") {
      const version = await db.editorialVersion.findUnique({
        where: { docId_rang: { docId: vue.id, rang: corps.version } },
      });
      if (!version) {
        throw echec("introuvable");
      }

      /**
       * Une version d'avant le garde-fou peut porter ce qu'il refuse
       * aujourd'hui. La remettre sur un document en ligne la republie :
       * elle passe donc la même porte que le texte courant.
       */
      const restauree = champsDeLaVersion(version);
      const corpsRestaure = corpsSchema.safeParse(restauree.body);
      if (vue.etat === "PUBLIE") {
        if (!corpsRestaure.success) {
          throw echec("etat_incompatible", {
            corps: `Le corps de la version ${version.rang} ne se relit plus. Elle ne peut pas revenir sur un document en ligne.`,
          });
        }
        exigerUnTexteAffichable(
          { titre: restauree.title, chapeau: restauree.standfirst },
          corpsRestaure.data,
          "restauration",
        );
      }

      await db.editorialDoc.update({
        where: { id: vue.id },
        data: restauree,
      });

      const motif = `Restauration de la version ${version.rang} — ${corps.motif}`;
      const rang =
        vue.etat === "PUBLIE"
          ? await enregistrerUneVersion(vue.id, { par: acteur!.id, motif })
          : null;

      await journaliser({
        acteurId: acteur!.id,
        action: "contenu.publication",
        cible: `contenu:${vue.id}`,
        motif,
        details: {
          genre: vue.genre,
          slug: vue.slug,
          restauree: version.rang,
          ...(rang ? { version: rang } : {}),
        },
      });
      if (vue.etat === "PUBLIE") revalider(vue.genre, vue.slug);
      return { etat: vue.etat, restauree: version.rang };
    }

    if (!vue.corps) {
      throw echec("etat_incompatible", {
        corps: "Le corps de ce document ne se relit pas. Il faut le reprendre avant de publier.",
      });
    }

    // INV-8 avant tout le reste : c'est le refus le moins coûteux à
    // corriger, et la base le refuserait de toute façon.
    if (!vue.source || !vue.verifieeLe) {
      throw echec("publication_refusee", {
        corps:
          "Une publication porte sa source et sa date de vérification (INV-8). Elles s'affichent en bas du document, là où le lecteur cherche d'où vient ce qu'il vient de lire.",
      });
    }

    exigerUnTexteAffichable({ titre: vue.titre, chapeau: vue.chapeau }, vue.corps, "publication");

    await db.editorialDoc.update({
      where: { id: vue.id },
      data: {
        status: "PUBLIE",
        // La date de première publication ne bouge plus : un article
        // republié après correction n'est pas un article du jour.
        publishedAt: vue.publieLe ? undefined : new Date(),
      },
    });

    // La version d'abord, la ligne de journal ensuite : c'est elle qui la
    // référence (P.B), et une ligne citant un rang qui n'existe pas
    // vaudrait moins que pas de rang du tout.
    const rang = await enregistrerUneVersion(vue.id, {
      par: acteur!.id,
      motif: corps.motif,
    });

    await journaliser({
      acteurId: acteur!.id,
      action: "contenu.publication",
      cible: `contenu:${vue.id}`,
      motif: `Publication — ${corps.motif}`,
      details: { genre: vue.genre, slug: vue.slug, version: rang },
    });

    revalider(vue.genre, vue.slug);
    return { etat: "PUBLIE" as const, version: rang, adresse: `${CHEMIN[vue.genre]}/${vue.slug}` };
  },
});
