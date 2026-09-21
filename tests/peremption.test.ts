import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Document } from "@prisma/client";
import {
  corpsEchue,
  estEchue,
  mentionEchue,
  piecesEchues,
  TITRE_ECHUE,
} from "@/domain/dossiers/peremption";
import { mentionDeLaPiece, completudeDesPieces, type Piece } from "@/domain/dossiers/piece";
import { versPiece } from "@/server/vue/dossier";
import { sansCommentaires } from "@/domain/copy/source";
import {
  INTERDITS_ECRAN_CANDIDAT,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";

/**
 * RG-07.4 — « une pièce passant en EXPIREE fait régresser le score et
 * repasse le dossier de PRET à ACTIF ».
 *
 * La seconde moitié existait ; la première, non. `DocumentStatus.EXPIREE`
 * n'était écrit nulle part — seulement lu. Un passeport pouvait expirer
 * sans que rien ne bouge, et le tableau de bord continuait d'annoncer que
 * rien ne bloquait le dépôt.
 */

const AUJOURDHUI = "2026-09-21";

describe("une pièce échue, et le jour où elle l'est", () => {
  /**
   * Strictement avant. Une pièce valable « jusqu'au 21 septembre » l'est
   * encore le 21 septembre : la déclasser ce jour-là ferait refaire un
   * document que l'autorité accepte.
   */
  it("n'est pas échue le jour de sa limite", () => {
    expect(estEchue("2026-09-21", AUJOURDHUI)).toBe(false);
    expect(estEchue("2026-09-22", AUJOURDHUI)).toBe(false);
    expect(estEchue("2026-09-20", AUJOURDHUI)).toBe(true);
  });

  const piece = (etat: string, perimeLe?: string | null) => ({
    id: etat + String(perimeLe),
    libelle: "Relevé bancaire",
    etat,
    ...(perimeLe === undefined ? {} : { perimeLe }),
  });

  /**
   * Seule une pièce conforme régresse : une pièce déjà à corriger n'a rien
   * à perdre, et l'étiquette « expirée » remplacerait son message
   * actionnable par quelque chose de plus vague.
   */
  it("ne déclasse que les pièces conformes", () => {
    const lot = [
      piece("CONFORME", "2026-08-01"),
      piece("A_CORRIGER", "2026-08-01"),
      piece("ATTENDUE", "2026-08-01"),
      piece("CONFORME", "2027-01-01"),
      piece("CONFORME", null),
      piece("CONFORME"),
    ];
    expect(piecesEchues(lot, AUJOURDHUI).map((p) => p.etat)).toEqual(["CONFORME"]);
    expect(piecesEchues(lot, AUJOURDHUI)[0]!.perimeLe).toBe("2026-08-01");
  });
});

describe("la lecture n'attend pas le travail de fond", () => {
  const document = (
    status: Document["status"],
    expiresAt: string | null,
  ): Document =>
    ({
      id: "d1",
      code: "releve_bancaire",
      label: "Relevé bancaire",
      family: "OBLIGATOIRE",
      status,
      remedy: "TELEVERSER",
      expiresAt: expiresAt === null ? null : new Date(`${expiresAt}T00:00:00Z`),
      feedback: null,
      finding: null,
      hint: null,
    }) as unknown as Document;

  /**
   * Le même partage que `depublierLesFichesEchues` : l'écran dit vrai tout
   * de suite, le job rend l'état stocké conforme à ce qui s'affiche.
   */
  it("déclasse une pièce conforme dont la validité est dépassée", () => {
    const vue = versPiece(document("CONFORME", "2026-08-01"), AUJOURDHUI);
    expect(vue.etat).toBe("EXPIREE");
    // « Ajouter » ferait chercher un fichier déjà envoyé.
    expect(vue.remede).toBe("REMPLACER");
  });

  it("ne touche pas une pièce encore valable", () => {
    expect(versPiece(document("CONFORME", "2027-01-01"), AUJOURDHUI).etat).toBe("CONFORME");
    expect(versPiece(document("CONFORME", null), AUJOURDHUI).etat).toBe("CONFORME");
  });

  it("ne relève pas une pièce déjà à corriger", () => {
    expect(versPiece(document("A_CORRIGER", "2026-08-01"), AUJOURDHUI).etat).toBe("A_CORRIGER");
  });

  /** Ce qui rend le tableau de bord honnête : la complétude suit. */
  it("la complétude retombe avec la pièce", () => {
    const pieces = [
      versPiece(document("CONFORME", "2026-08-01"), AUJOURDHUI),
    ] as unknown as Piece[];
    expect(completudeDesPieces(pieces).compteurs.obligatoiresManquantes).toBe(1);

    const valides = [
      versPiece(document("CONFORME", "2027-01-01"), AUJOURDHUI),
    ] as unknown as Piece[];
    expect(completudeDesPieces(valides).compteurs.obligatoiresManquantes).toBe(0);
  });
});

describe("ce que la ligne de checklist dit", () => {
  const piece = (etat: string, perimeLe: string): Piece =>
    ({ id: "p", code: "REL", libelle: "Relevé", famille: "OBLIGATOIRE", etat, remede: "REMPLACER", perimeLe }) as unknown as Piece;

  /**
   * « Expire le 3 mars, avant le dépôt visé » sur une pièce expirée depuis
   * un mois parle au futur d'un fait passé.
   */
  it("parle au passé d'une pièce déjà expirée", () => {
    const mention = mentionDeLaPiece(piece("EXPIREE", "2026-08-01"), "2027-06-03");
    expect(mention).toBe(mentionEchue("2026-08-01"));
    expect(mention).toContain("dépassée depuis");
    expect(mention).not.toContain("Expire le");
  });

  it("prévient encore d'une pièce valable aujourd'hui mais pas au dépôt", () => {
    const mention = mentionDeLaPiece(piece("CONFORME", "2027-03-01"), "2027-06-03");
    expect(mention).toContain("avant le dépôt visé");
  });
});

describe("ce que le candidat lit quand une pièce expire", () => {
  it("dit le constat, la conséquence et l'action", () => {
    const corps = corpsEchue("Relevé bancaire", "2026-08-01", true);
    expect(corps).toContain("valable jusqu'au 1er août 2026");
    expect(corps).toContain("repasse en préparation");
    expect(corps).toContain("Téléverse");
  });

  /** La régression n'est annoncée que si elle a eu lieu. */
  it("n'annonce pas un retour en arrière sur un dossier qui n'était pas prêt", () => {
    expect(corpsEchue("Relevé bancaire", "2026-08-01", false)).not.toContain(
      "repasse en préparation",
    );
  });

  it("ne promet rien et ne pronostique rien", () => {
    const textes = [
      TITRE_ECHUE("Relevé bancaire"),
      corpsEchue("Relevé bancaire", "2026-08-01", true),
      corpsEchue("Relevé bancaire", "2026-08-01", false),
      mentionEchue("2026-08-01"),
    ].join("\n");
    expect(verifierTexte(textes, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
    expect(textes).not.toMatch(/\d\s?%/u);
  });
});

describe("l'état EXPIREE a enfin un écrivain", () => {
  function fichiers(dir: string, acc: string[] = []): string[] {
    for (const nom of readdirSync(dir)) {
      const p = join(dir, nom);
      if (statSync(p).isDirectory()) fichiers(p, acc);
      else if (/\.tsx?$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
    }
    return acc;
  }

  /**
   * Le garde-fou qui aurait trouvé le défaut : un état de document que
   * personne n'écrit ne se produit jamais, et tout ce qui en dépend — ici
   * RG-07.4 tout entier — est mort sans que rien ne le signale.
   *
   * La première version cherchait `status: "EXPIREE"` n'importe où dans
   * le dépôt, et passait au vert alors que le job ne l'écrivait plus :
   * `TransactionStatus` porte la même valeur, et la réconciliation des
   * paiements l'écrit. Un état de **document** se cherche donc dans une
   * écriture de **document**, et nulle part ailleurs.
   */
  it("un état de document lu par le barème est écrit sur un document", () => {
    const ecritures = /db\.document\.(update|updateMany|create|createMany)\s*\(([\s\S]{0,400}?)\n\s*\}\)/gu;
    const ecrits = new Set<string>();
    for (const f of fichiers("src")) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      for (const bloc of code.matchAll(ecritures)) {
        for (const etat of (bloc[2] ?? "").matchAll(/status:\s*["'](\w+)["']/gu)) {
          ecrits.add(etat[1]!);
        }
      }
    }
    /*
      `EXPIREE` seul, et la portée de la garde est dite plutôt que
      supposée : `CONFORME` et `A_CORRIGER` sont écrits par l'analyse à
      travers une table de correspondance, pas en littéral, et les
      chercher ici ferait échouer la garde sur du code correct. C'est
      `EXPIREE` que personne n'écrivait, et c'est lui qu'on tient.
    */
    expect([...ecrits], "EXPIREE n'est écrit sur aucun document").toContain("EXPIREE");
  });
});
