import { revalidatePath } from "next/cache";
import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { documentPourEdition } from "@/server/lecture/editorial";
import {
  corpsSchema,
  messageDeRefusEditorial,
  verifierLeDocument,
  type GenreDocument,
} from "@/domain/editorial/document";

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
 * bloque **que la publication**. La nuance est celle que `CLAUDE.md`
 * décrit : « sa publication est bloquée tant que la formulation est
 * refusée ». Refuser aussi le brouillon empêcherait d'enregistrer un texte
 * en cours d'écriture, et pousserait à rédiger ailleurs pour recoller à la
 * fin — c'est-à-dire hors du garde-fou.
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
    corps: z.unknown(),
    source: z.string().max(200).optional(),
    verifieeLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
    pays: z.string().max(80).optional(),
    rubrique: z.string().max(80).optional(),
    auteur: z.string().max(80).optional(),
  }),
  async traiter({ corps, params }) {
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

    // Un document déjà publié dont on enregistre une correction doit la
    // montrer : la page est en cache, et rien d'autre ne l'invalide.
    if (document.status === "PUBLIE") {
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
 * Publication et retrait — WF-14 dans l'esprit, sans le versionnement.
 *
 * Un guide n'a pas de version figée par un dossier : INV-3 ne s'y applique
 * pas, et publier une correction n'alerte personne. Ce qui reste de la
 * publication d'une règle, c'est le refus sur le vocabulaire, l'exigence de
 * source (INV-8) et la ligne de journal.
 */
export const POST = route({
  nom: "admin.contenu.publication",
  acces: "veilleur",
  limite: "sensible",
  corps: z.object({
    action: z.enum(["publier", "retirer"]),
    motif: z.string().min(3).max(500),
  }),
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

    const refus = verifierLeDocument({ titre: vue.titre, chapeau: vue.chapeau }, vue.corps);
    if (refus.length > 0) {
      // Le refus nomme le fait : la publication est refusée, et les champs
      // ne sont pas « invalides » — le document est bien formé, c'est sa
      // formulation qui ne peut pas s'afficher (DOC-12 §16 règle 1).
      throw echec("publication_refusee", {
        champs: Object.fromEntries(refus.map((f) => [f.chemin, messageDeRefusEditorial(f)])),
      });
    }

    await db.editorialDoc.update({
      where: { id: vue.id },
      data: {
        status: "PUBLIE",
        // La date de première publication ne bouge plus : un article
        // republié après correction n'est pas un article du jour.
        publishedAt: vue.publieLe ? undefined : new Date(),
      },
    });

    await journaliser({
      acteurId: acteur!.id,
      action: "contenu.publication",
      cible: `contenu:${vue.id}`,
      motif: `Publication — ${corps.motif}`,
      details: { genre: vue.genre, slug: vue.slug },
    });

    revalider(vue.genre, vue.slug);
    return { etat: "PUBLIE" as const, adresse: `${CHEMIN[vue.genre]}/${vue.slug}` };
  },
});
