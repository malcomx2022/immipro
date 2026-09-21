import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { sansCommentaires } from "@/domain/copy/source";
import {
  TYPE_MIME_DOCX,
  documentXml,
  echapperXml,
  nomDuFichierRedige,
  piecesDuDocument,
} from "@/domain/redaction/docx";
import { MENTION_AIDE_A_LA_REDACTION } from "@/domain/redaction/versions";
import { archiver, crc32 } from "@/server/redaction/zip";

/**
 * L'export d'une pièce rédigée — WF-08 étape 6.
 *
 * Le PDF est celui du navigateur, comme pour l'archive d'un dossier (L.3) :
 * une page s'imprime, aucune bibliothèque n'entre au dépôt. Le DOCX ne peut
 * pas suivre cette voie — personne n'imprime un fichier Word — et un DOCX
 * n'étant qu'une archive de trois fichiers XML, il s'écrit sans dépendance.
 *
 * Ce qui se vérifie ici va donc plus loin que des chaînes : l'archive est
 * ouverte, ses pièces décompressées, leur XML analysé. Un DOCX que le
 * traitement de texte refuse d'ouvrir vaut moins que pas de DOCX, et cela
 * ne se voit pas en lisant une chaîne.
 */

const DOCUMENT = {
  titre: "Lettre de motivation — Pays-Bas",
  paragraphes: [
    {
      section: "MOTIVATION",
      texte: "Je souhaite étudier à Groningue.\nLe programme correspond à mon parcours.",
    },
    { section: "", texte: 'Des caractères à échapper : <b>& "guillemets" & \'apostrophes\'</b>.' },
  ],
  mention: MENTION_AIDE_A_LA_REDACTION,
};

const LE_JOUR = new Date("2026-09-21T10:00:00Z");

/** Ouvre l'archive sans bibliothèque : lecture du répertoire central. */
function ouvrir(archive: Buffer): Map<string, string> {
  const pieces = new Map<string, string>();
  // L'enregistrement de fin est en queue ; il dit où commence le central.
  const fin = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(fin, "enregistrement de fin de répertoire").toBeGreaterThan(-1);
  const nombre = archive.readUInt16LE(fin + 10);
  let position = archive.readUInt32LE(fin + 16);

  for (let i = 0; i < nombre; i += 1) {
    expect(archive.readUInt32LE(position), "signature de fiche centrale").toBe(0x02014b50);
    const compressee = archive.readUInt32LE(position + 20);
    const longueurNom = archive.readUInt16LE(position + 28);
    const decalage = archive.readUInt32LE(position + 42);
    const nom = archive.toString("utf8", position + 46, position + 46 + longueurNom);

    expect(archive.readUInt32LE(decalage), "signature d'en-tête local").toBe(0x04034b50);
    const nomLocal = archive.readUInt16LE(decalage + 26);
    const extra = archive.readUInt16LE(decalage + 28);
    const debut = decalage + 30 + nomLocal + extra;
    const brut = inflateRawSync(archive.subarray(debut, debut + compressee));

    /**
     * Le CRC et les tailles sont écrits **deux fois** — en-tête local et
     * fiche centrale — et c'est la copie locale qu'un lecteur vérifie.
     *
     * La première version de cette lecture ne contrôlait que la fiche
     * centrale : corrompre le CRC local passait au vert, alors que `unzip`
     * rejette l'archive. Un garde-fou qui lit l'autre copie que le lecteur
     * réel — la même leçon, sur un format binaire cette fois.
     */
    const attendu = crc32(brut);
    expect(archive.readUInt32LE(decalage + 14), `crc local de ${nom}`).toBe(attendu);
    expect(archive.readUInt32LE(position + 16), `crc central de ${nom}`).toBe(attendu);
    expect(archive.readUInt32LE(decalage + 18), `taille compressée locale de ${nom}`).toBe(
      compressee,
    );
    expect(archive.readUInt32LE(decalage + 22), `taille brute locale de ${nom}`).toBe(
      brut.length,
    );
    expect(archive.readUInt32LE(position + 24), `taille brute centrale de ${nom}`).toBe(
      brut.length,
    );
    pieces.set(nom, brut.toString("utf8"));
    position += 46 + longueurNom;
  }
  return pieces;
}

describe("le XML d'un document Word", () => {
  it("échappe les cinq entités, et dans le bon ordre", () => {
    expect(echapperXml('<a href="x">&\'</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;",
    );
    // Remplacer `&` après `<` rendrait `&lt;` en `&amp;lt;`.
    expect(echapperXml("<")).toBe("&lt;");
    expect(echapperXml("&lt;")).toBe("&amp;lt;");
  });

  it("garde les retours à la ligne du candidat", () => {
    const xml = documentXml(DOCUMENT);
    // Un `<w:br/>` par retour : les recoller collerait deux phrases qu'il
    // avait séparées.
    expect([...xml.matchAll(/<w:br\/>/gu)]).toHaveLength(1);
  });

  /**
   * RG-08.1 : la mention voyage **dans le fichier**. C'est tout l'intérêt
   * de la règle — le document sort de la plateforme et sera lu par
   * quelqu'un qui n'a pas vu l'écran.
   */
  it("porte la mention d'aide à la rédaction, en dernier", () => {
    const xml = documentXml(DOCUMENT);
    expect(xml).toContain("aide à la rédaction");
    expect(xml.indexOf("aide à la rédaction")).toBeGreaterThan(
      xml.indexOf("Groningue"),
    );
  });

  /**
   * Ne pas nommer ce qui n'est pas là : la première version référençait des
   * styles `w:pStyle` qu'aucun `styles.xml` ne définissait.
   */
  it("ne référence aucun style absent, et met en forme directement", () => {
    const xml = documentXml(DOCUMENT);
    expect(xml).not.toContain("pStyle");
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:caps/>");
    expect(xml).toContain("<w:i/>");
  });

  it("nomme le fichier d'après la pièce et le jour", () => {
    expect(nomDuFichierRedige("Lettre de motivation", "2026-09-21", "docx")).toBe(
      "lettre-de-motivation-2026-09-21.docx",
    );
    // Accents et ponctuation retirés : un nom de fichier traverse des
    // systèmes qui ne les traitent pas tous de la même façon.
    expect(nomDuFichierRedige("Projet d'études — CV", "2026-01-02", "docx")).toBe(
      "projet-d-etudes-cv-2026-01-02.docx",
    );
  });
});

describe("l'archive est un vrai DOCX", () => {
  const archive = archiver(piecesDuDocument(DOCUMENT), LE_JOUR);

  it("porte les trois pièces d'un DOCX minimal", () => {
    const pieces = ouvrir(archive);
    expect([...pieces.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
    ]);
  });

  /**
   * Sans les types de contenu, un traitement de texte refuse l'archive
   * avant de la lire : c'est ce fichier qui dit que le paquet est un
   * document Word et non un ZIP quelconque.
   */
  it("déclare le type du document principal et la relation racine", () => {
    const pieces = ouvrir(archive);
    expect(pieces.get("[Content_Types].xml")).toContain(
      "wordprocessingml.document.main+xml",
    );
    expect(pieces.get("_rels/.rels")).toContain("word/document.xml");
  });

  it("les trois pièces se décompressent et leur CRC est juste", () => {
    // `ouvrir` vérifie le CRC de chaque pièce et lève sinon.
    const pieces = ouvrir(archive);
    for (const [nom, contenu] of pieces) {
      expect(contenu, nom).toMatch(/^<\?xml version="1\.0"/u);
    }
  });

  it("le texte du candidat survit au voyage, échappé", () => {
    const document = ouvrir(archive).get("word/document.xml")!;
    expect(document).toContain("Groningue");
    expect(document).toContain("&lt;b&gt;&amp;");
    // Aucune balise du candidat n'a pu s'ouvrir dans le XML.
    expect(document).not.toContain("<b>");
  });

  /** Deux exports du même texte rendent les mêmes octets, au bit près. */
  it("est déterministe à horodatage égal", () => {
    const bis = archiver(piecesDuDocument(DOCUMENT), LE_JOUR);
    expect(archive.equals(bis)).toBe(true);
  });

  it("date l'archive de l'horodatage passé, pas de maintenant", () => {
    const autre = archiver(piecesDuDocument(DOCUMENT), new Date("2020-01-02T03:04:05Z"));
    expect(autre.equals(archive)).toBe(false);
  });

  it("calcule un CRC-32 conforme", () => {
    // Valeur de référence du standard : « 123456789 ».
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.from(""))).toBe(0);
  });
});

describe("les deux sorties de WF-08 étape 6", () => {
  const routeExport = sansCommentaires(
    readFileSync(
      "src/app/api/dossiers/[id]/redaction/[type]/export/route.ts",
      "utf8",
    ),
  );
  const impression = sansCommentaires(
    readFileSync(
      "src/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/impression/page.tsx",
      "utf8",
    ),
  );
  /**
   * Espaces normalisés : le JSX coupe ses phrases en fin de ligne, et
   * « rien à\n            imprimer » ne contient pas « rien à imprimer ».
   * Le piège coûte un test qui accuse du code juste.
   */
  const impressionLue = impression.replace(/\s+/gu, " ");

  it("le DOCX descend dans les téléchargements, avec son type", () => {
    expect(routeExport).toContain("attachment; filename=");
    expect(routeExport).toContain("TYPE_MIME_DOCX");
    expect(TYPE_MIME_DOCX).toContain("wordprocessingml.document");
  });

  /**
   * Une pièce sans texte n'a rien à exporter, et le refus passe **avant**
   * l'archivage.
   *
   * Le critère portait sur la présence de la chaîne : neutraliser la
   * condition laissait le message dans le fichier, et le test au vert. La
   * position de la garde, elle, dit ce qui se passe.
   */
  it("refuse d'exporter une pièce sans version, avant de rien produire", () => {
    const garde = routeExport.indexOf("if (!courante)");
    expect(garde).toBeGreaterThan(0);
    expect(garde).toBeLessThan(routeExport.indexOf("archiver("));
    expect(routeExport).toContain('echec("etat_incompatible"');
    expect(routeExport).toContain("rien à exporter");
    expect(impressionLue).toContain("rien à imprimer");
  });

  /**
   * L'archive est datée de la version : un fichier retrouvé plus tard dit
   * quand la lettre a été écrite.
   */
  it("date l'export de la version, pas de la demande", () => {
    expect(routeExport).toContain("new Date(courante.enregistreeLe)");
    expect(routeExport).not.toContain("archiver(piecesDuDocument");
  });

  /**
   * L'impression masque sa propre chrome par classe, jamais par nom de
   * balise : c'est la correction de L.3, où masquer `header` emportait
   * l'en-tête de l'archive elle-même.
   */
  it("la page d'impression marque ce qui ne s'imprime pas", () => {
    expect(impression).toContain("a-imprimer");
    expect([...impression.matchAll(/pas-a-imprimer/gu)].length).toBeGreaterThan(1);
    const styles = readFileSync("src/styles/globals.css", "utf8");
    expect(styles).toContain(".pas-a-imprimer");
    expect(styles).not.toMatch(/@media print[\s\S]{0,400}\bheader\s*,/u);
  });

  /**
   * RG-08.1 s'imprime aussi. Le critère porte sur l'**emploi**, pas sur la
   * présence du nom : la ligne d'import le contient, et retirer l'usage
   * laissait le test au vert — deux fois la même leçon dans un seul lot.
   */
  it("les deux sorties emploient la mention de RG-08.1", () => {
    const sansImports = (source: string) =>
      source
        .split("\n")
        .filter((ligne) => !/^\s*(import|  MENTION_AIDE)/u.test(ligne))
        .join("\n");
    expect(sansImports(routeExport)).toContain("mention: MENTION_AIDE_A_LA_REDACTION");
    expect(sansImports(impression)).toContain("{MENTION_AIDE_A_LA_REDACTION}");
  });

  /** Le texte s'imprime comme un texte, pas comme un champ de saisie. */
  it("la page d'impression rend le texte, pas le champ de l'éditeur", () => {
    expect(impression).not.toContain("textarea");
    expect(impression).toContain("whitespace-pre-line");
  });
});
