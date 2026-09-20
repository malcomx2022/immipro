import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { documentsEditoriaux } from "@/server/lecture/editorial";
import { slugDe } from "@/domain/editorial/document";

/**
 * Documents éditoriaux — B-08, J.C.
 *
 * La liste et la création. L'édition et la publication vivent sous `[id]`.
 *
 * `veilleur` et non `admin` : c'est le rôle qui tient déjà le référentiel
 * (B-02) et la veille (B-06). Un guide pays dit la même chose qu'une règle,
 * en prose — le séparer aurait fait deux vérités à tenir par deux
 * personnes.
 */
export const GET = route({
  nom: "admin.contenus",
  acces: "veilleur",
  limite: "lecture",
  traiter: async () => ({ documents: await documentsEditoriaux() }),
});

/**
 * Création. Le document naît en brouillon, sans source ni date : ce sont
 * les deux champs que la publication exigera, et les demander avant
 * d'avoir écrit une ligne ferait saisir n'importe quoi pour passer.
 *
 * Le slug se dérive du titre et se fige ensuite : c'est l'adresse publique,
 * et un lien entrant qui tombe est un lecteur perdu.
 */
export const POST = route({
  nom: "admin.contenus.creation",
  acces: "veilleur",
  limite: "sensible",
  corps: z.object({
    genre: z.enum(["GUIDE", "ARTICLE"]),
    titre: z.string().min(3).max(200),
    pays: z.string().max(80).optional(),
    rubrique: z.string().max(80).optional(),
    auteur: z.string().max(80).optional(),
  }),
  async traiter({ corps }) {
    const slug = slugDe(corps.titre);
    if (!slug) {
      throw echec("champs_invalides", {
        champs: { titre: "Ce titre ne donne aucune adresse lisible. Ajoute des lettres." },
      });
    }

    // Le genre décide des champs obligatoires, et la base les refuse aussi.
    // Les refuser ici permet de le dire, plutôt que de rendre une erreur
    // de contrainte.
    if (corps.genre === "GUIDE" && !corps.pays?.trim()) {
      throw echec("champs_invalides", {
        champs: { pays: "Un guide nomme son pays : il est en surtitre de la page." },
      });
    }
    if (corps.genre === "ARTICLE" && (!corps.rubrique?.trim() || !corps.auteur?.trim())) {
      throw echec("champs_invalides", {
        champs: {
          rubrique: "Un article porte sa rubrique et sa signature.",
        },
      });
    }

    const existant = await db.editorialDoc.findUnique({
      where: { kind_slug: { kind: corps.genre, slug } },
    });
    if (existant) {
      throw echec("champs_invalides", {
        champs: { titre: `L'adresse « ${slug} » est déjà prise par un autre document.` },
      });
    }

    const document = await db.editorialDoc.create({
      data: {
        kind: corps.genre,
        slug,
        title: corps.titre,
        standfirst: "",
        body: { blocs: [{ type: "paragraphe", texte: "À écrire." }], appel: APPEL_VIDE },
        ...(corps.pays ? { countryLabel: corps.pays } : {}),
        ...(corps.rubrique ? { section: corps.rubrique } : {}),
        ...(corps.auteur ? { author: corps.auteur } : {}),
      },
    });

    return { id: document.id, slug: document.slug };
  },
});

/**
 * L'appel à l'action de départ mène au simulateur : c'est la seule page
 * qui ne demande ni compte ni paiement, donc la seule qu'on peut proposer
 * sans rien savoir du document qu'on vient d'ouvrir.
 */
const APPEL_VIDE = {
  titre: "Voir si cette destination te correspond",
  texte: "Six questions, aucun compte à créer.",
  action: "Lancer le simulateur",
  href: "/simulateur",
};
