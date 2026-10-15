/** Préconditions synthétiques dans la seule base jetable du banc photo. */
import { Client } from "pg";
import { randomUUID } from "node:crypto";

export async function preparerContenus() {
  const cible = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(cible.hostname))
    throw Error("PostgreSQL local requis.");
  cible.pathname = "/immipro_recette_photos";
  const db = new Client({ connectionString: cible.toString() });
  const corps = JSON.stringify({
    blocs: [
      { type: "intertitre", texte: "Pièces de recette" },
      {
        type: "paragraphe",
        texte:
          "Contenu synthétique pour vérifier la présentation des photographies. Aucune exigence réglementaire.",
      },
    ],
    appel: {
      titre: "Préparer son projet",
      texte: "Six questions, aucun compte à créer.",
      action: "Essayer le simulateur",
      href: "/simulateur",
    },
  });
  try {
    await db.connect();
    for (const [kind, slug, status, title, country] of [
      ["GUIDE", "suisse", "PUBLIE", "Guide Suisse — recette synthétique", "Suisse"],
      [
        "ARTICLE",
        "relire-ses-documents",
        "PUBLIE",
        "Relire ses documents — recette synthétique",
        null,
      ],
      [
        "ARTICLE",
        "photo-sans-association",
        "PUBLIE",
        "Article sans photographie — recette synthétique",
        null,
      ],
      ["ARTICLE", "preparer-ses-pieces", "RETIRE", "Article retiré — recette synthétique", null],
      [
        "GUIDE",
        "recette-brouillon",
        "BROUILLON",
        "Guide brouillon — recette synthétique",
        "Recette",
      ],
    ]) {
      await db.query(
        `INSERT INTO "EditorialDoc" (id,kind,slug,status,title,standfirst,body,"sourceLabel","verifiedAt","publishedAt","updatedAt","countryLabel",section,author)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$12,now(),$9,$10,$11) ON CONFLICT (kind,slug) DO NOTHING`,
        [
          randomUUID(),
          kind,
          slug,
          status,
          title,
          "Précondition explicite du banc local de photographies.",
          corps,
          "immipro.test — recette synthétique",
          country,
          "Recette",
          "Banc local",
          status === "BROUILLON" ? null : new Date(),
        ],
      );
    }
  } finally {
    await db.end();
  }
}
