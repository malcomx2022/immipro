import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nomDeLEntete } from "@/lib/telechargement";
import { sansCommentaires } from "@/domain/copy/source";
import {
  BOM,
  SEPARATEUR,
  cellule,
  fichierCsv,
  ligne,
  neutraliser,
  nomDatable,
  nombre,
  texte,
  vide,
} from "@/domain/format/csv";
import {
  ATTESTATION_ABSENCE,
  COLONNES_AUDIT,
  MENTION_EXPORT_VIDE,
  exportDuJournal,
  nomDeLExport,
  type EcritureAudit,
} from "@/domain/backoffice/audit";
import {
  ATTESTATION_TOTAL_SUSPENDU,
  COLONNES_GRAND_LIVRE,
  COMMANDES_ATTENDUES_B04,
  exportDuGrandLivre,
  nomDuGrandLivre,
  totauxDeLExport,
  type Paiement,
} from "@/domain/backoffice/reconciliation";

/**
 * Les exports — B-06 et B-04, WF-15.
 *
 * Quatre boutons promettaient un fichier, et le dépôt ne contenait pas une
 * ligne de CSV. Les deux promesses les plus précises étaient celles
 * qu'aucun code ne soutenait : B-06 décrivait le contenu d'une attestation
 * d'absence, B-04 nommait l'export comme le lieu où un total partiel
 * devient une erreur durable.
 */

const ECRITURE = (surcharge: Partial<EcritureAudit> = {}): EcritureAudit => ({
  id: "e1",
  horodatage: "2026-09-15T09:30:00.000Z",
  acteur: { genre: "PERSONNE", libelle: "Awa Diallo", identifiant: "user:abc" },
  categorie: "COMPTE",
  action: "compte.suspension",
  objet: "user:def",
  detail: "Usage détourné du compte, signalé le 14 septembre.",
  origine: "back-office",
  ...surcharge,
});

const PERIODE = { du: "2026-09-01", au: "2026-09-30" };

const PAIEMENT = (surcharge: Partial<Paiement> = {}): Paiement => ({
  reference: "IMM-2026-0912-0001",
  compte: "awa@exemple.test",
  montant: 15_000,
  devise: "XOF",
  moyen: "Mobile Money",
  recuLe: "2026-09-21T08:12:00.000Z",
  etat: "RAPPROCHE",
  ...surcharge,
});

describe("l'écrivain CSV", () => {
  /**
   * Le point le plus important du module, et le seul qui coûte cher à
   * oublier : un tableur exécute une cellule qui commence par `=`, `+`,
   * `-`, `@`, une tabulation ou un retour chariot. Le journal porte du
   * texte libre saisi par un opérateur.
   */
  it("ne laisse jamais un texte devenir une formule", () => {
    for (const amorce of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(neutraliser(`${amorce}cmd|' /C calc'!A0`), amorce).toMatch(/^'/u);
    }
    expect(neutraliser("Motif ordinaire")).toBe("Motif ordinaire");
    // L'amorce au milieu ne fait rien : seule la première position compte.
    expect(neutraliser("10 = dix")).toBe("10 = dix");
  });

  /**
   * Et un nombre n'y passe pas. Un montant négatif commence par « - » :
   * neutralisé, il cesserait d'être un nombre pour le tableur, et aucune
   * somme ne le reprendrait. C'est pourquoi la cellule est typée plutôt
   * que devinée au contenu.
   */
  it("laisse un montant négatif être un nombre", () => {
    expect(cellule(nombre(-15_000))).toBe("-15000");
    expect(cellule(nombre(-15_000))).not.toMatch(/^'/u);
    expect(cellule(texte("-15000"))).toBe("'-15000");
  });

  it("échappe le séparateur, les guillemets et les retours à la ligne", () => {
    expect(cellule(texte("Diallo; Awa"))).toBe('"Diallo; Awa"');
    expect(cellule(texte('Il a dit "non"'))).toBe('"Il a dit ""non"""');
    expect(cellule(texte("deux\nlignes"))).toBe('"deux\nlignes"');
    // Les espaces de bord se perdent sans guillemets, et un motif qui
    // commence par une espace se relit mal.
    expect(cellule(texte(" marge"))).toBe('" marge"');
    expect(cellule(texte("simple"))).toBe("simple");
  });

  it("écrit les décimales à la virgule, sous un séparateur point-virgule", () => {
    expect(SEPARATEUR).toBe(";");
    expect(cellule(nombre(1234.5, 2))).toBe("1234,50");
    expect(cellule(nombre(15_000))).toBe("15000");
    expect(cellule(vide)).toBe("");
    expect(ligne([texte("a"), nombre(2), vide])).toBe("a;2;");
  });

  /** Sans marque d'octets, un tableur lit « Écritures » en « Ã‰critures ». */
  it("ouvre le fichier par la marque d'octets et ferme les lignes en CRLF", () => {
    const fichier = fichierCsv([[texte("a")], [texte("b")]]);
    expect(fichier.startsWith(BOM)).toBe(true);
    expect(fichier).toBe(`${BOM}a\r\nb\r\n`);
  });

  it("date le nom du fichier, et dit s'il porte une période ou un jour", () => {
    expect(nomDatable("journal-audit", "2026-09-01", "2026-09-30")).toBe(
      "immipro-journal-audit-2026-09-01_2026-09-30.csv",
    );
    expect(nomDatable("grand-livre", "2026-09-21", "2026-09-21")).toBe(
      "immipro-grand-livre-2026-09-21.csv",
    );
  });
});

describe("B-06 — l'export du journal atteste ce qu'il porte", () => {
  it("nomme son périmètre exact, période et catégories", () => {
    const rendu = exportDuJournal([ECRITURE()], PERIODE, ["COMPTE"]);
    const texteDuFichier = fichierCsv(rendu);
    expect(texteDuFichier).toContain("du 2026-09-01 au 2026-09-30");
    expect(texteDuFichier).toContain("Comptes");
    // Sans le périmètre, un fichier d'une ligne ne distingue pas « une
    // écriture sur la période » de « une écriture parce qu'un filtre en
    // cachait quarante ».
    expect(texteDuFichier).toContain("Écritures;1");
  });

  /**
   * La promesse que rien ne tenait. Une attestation d'absence n'est pas un
   * fichier vide : un fichier vide se confond avec un export qui a échoué.
   */
  it("atteste l'absence d'écriture sur une période vide", () => {
    const rendu = fichierCsv(exportDuJournal([], PERIODE, []));
    expect(rendu).toContain(ATTESTATION_ABSENCE);
    expect(rendu).toContain("Écritures;0");
    // Les colonnes sont là malgré tout : un contrôleur doit voir ce qui
    // aurait été rempli.
    for (const colonne of COLONNES_AUDIT) expect(rendu).toContain(colonne);
    expect(MENTION_EXPORT_VIDE).toContain("attestant l'absence");
  });

  it("n'atteste rien quand il y a des écritures", () => {
    const rendu = fichierCsv(exportDuJournal([ECRITURE()], PERIODE, []));
    expect(rendu).not.toContain(ATTESTATION_ABSENCE);
    /**
     * Et l'en-tête n'en garde pas la place : une ligne vide tenant lieu
     * d'attestation ajoutait une rangée vide au tableur, et donnait aux
     * deux fichiers des en-têtes de hauteurs différentes. Visible en
     * ouvrant les deux côte à côte, jamais dans une assertion sur le
     * contenu — c'est l'exécution qui l'a montré.
     */
    const avant = rendu.slice(0, rendu.indexOf(COLONNES_AUDIT[0]!));
    expect([...avant.matchAll(/\r\n\r\n/gu)]).toHaveLength(1);
    const videRendu = fichierCsv(exportDuJournal([], PERIODE, []));
    const avantVide = videRendu.slice(0, videRendu.indexOf(COLONNES_AUDIT[0]!));
    expect([...avantVide.matchAll(/\r\n\r\n/gu)]).toHaveLength(1);
  });

  /**
   * L'acteur tient deux colonnes, comme à l'écran depuis l'arbitrage du
   * 21/09/2026 : le libellé pour qui relit, l'identifiant pour qui
   * recoupe. Les fondre perdait l'identifiant, et c'est lui qui sert.
   */
  it("porte le libellé de l'acteur et son identifiant durable", () => {
    const rendu = fichierCsv(exportDuJournal([ECRITURE()], PERIODE, []));
    expect(rendu).toContain("Awa Diallo");
    expect(rendu).toContain("user:abc");
  });

  it("respecte la période et les catégories, comme l'écran", () => {
    const ecritures = [
      ECRITURE({ id: "dedans", horodatage: "2026-09-15T09:00:00.000Z" }),
      ECRITURE({ id: "dehors", horodatage: "2026-10-02T09:00:00.000Z" }),
      ECRITURE({ id: "autre", categorie: "PAIEMENT", action: "paiement.remboursement" }),
    ];
    const rendu = fichierCsv(exportDuJournal(ecritures, PERIODE, ["COMPTE"]));
    expect(rendu).toContain("Écritures;1");
    expect(rendu).not.toContain("paiement.remboursement");
  });

  it("nomme le fichier d'après la période", () => {
    expect(nomDeLExport(PERIODE)).toBe(
      "immipro-journal-audit-2026-09-01_2026-09-30.csv",
    );
  });
});

describe("B-04 — le grand livre ne présente jamais un total partiel", () => {
  const OPERATEUR_MUET = {
    disponible: false,
    dernierRapprochement: "2026-09-21T06:00:00.000Z",
    operateur: "MTN",
  };
  const OPERATEUR = { ...OPERATEUR_MUET, disponible: true };

  /**
   * La règle était écrite dans le domaine et ne valait qu'à l'écran. Un
   * total faux affiché disparaît au rechargement ; le même dans un fichier
   * part au comptable et revient dans un rapport six semaines plus tard.
   */
  it("retient ses totaux pendant un incident, et dit pourquoi", () => {
    const livre = {
      paiements: [PAIEMENT()],
      operateur: OPERATEUR_MUET,
      journee: "Journée du 21 septembre 2026",
    };
    expect(totauxDeLExport(livre)).toBeNull();
    const rendu = fichierCsv(exportDuGrandLivre(livre));
    expect(rendu).toContain(ATTESTATION_TOTAL_SUSPENDU);
    expect(rendu).not.toContain("Total encaissé (XOF)");
    // Les lignes partent quand même : chaque paiement est ce qu'il est, et
    // retenir le fichier entier ferait croire que la journée n'existe pas.
    expect(rendu).toContain("IMM-2026-0912-0001");
  });

  it("ne calcule aucun total tant qu'aucun rapprochement n'a abouti", () => {
    expect(
      totauxDeLExport({ paiements: [PAIEMENT()], operateur: null, journee: "j" }),
    ).toBeNull();
  });

  it("publie ses totaux quand l'opérateur répond, une somme par monnaie", () => {
    const livre = {
      paiements: [
        PAIEMENT(),
        PAIEMENT({ reference: "IMM-2", montant: 29.5, devise: "EUR" }),
      ],
      operateur: OPERATEUR,
      journee: "Journée du 21 septembre 2026",
    };
    const rendu = fichierCsv(exportDuGrandLivre(livre));
    // Additionner les deux donnerait « 15 029,50 », un nombre qui n'est ce
    // qu'il annonce dans aucune des deux monnaies.
    expect(rendu).toContain("Total encaissé (XOF);15000");
    expect(rendu).toContain("Total encaissé (EUR);29,50");
    expect(rendu).not.toContain("15029");
    expect(rendu).not.toContain(ATTESTATION_TOTAL_SUSPENDU);
  });

  it("écrit les montants en euros à deux décimales et ceux en francs sans", () => {
    const rendu = fichierCsv(
      exportDuGrandLivre({
        paiements: [PAIEMENT({ montant: 29.5, devise: "EUR" })],
        operateur: OPERATEUR,
        journee: "j",
      }),
    );
    expect(rendu).toContain("29,50;EUR");
  });

  it("porte le constat d'un écart et son issue", () => {
    const rendu = fichierCsv(
      exportDuGrandLivre({
        paiements: [
          PAIEMENT({
            etat: "ECART",
            ecart: {
              constat: "Montant reçu inférieur au pack",
              resolution: {
                issue: "REMBOURSEMENT_A_INITIER",
                note: "Vu avec la candidate",
                par: "ops@immipro.test",
                le: "2026-09-21T10:00:00.000Z",
              },
            },
          }),
        ],
        operateur: OPERATEUR,
        journee: "j",
      }),
    );
    expect(rendu).toContain("Montant reçu inférieur au pack");
    for (const colonne of COLONNES_GRAND_LIVRE) expect(rendu).toContain(colonne);
  });

  it("nomme le fichier d'après la journée", () => {
    expect(nomDuGrandLivre("2026-09-21")).toBe("immipro-grand-livre-2026-09-21.csv");
  });

  it("nomme ce qui manque au rapprochement manuel retiré", () => {
    expect(COMMANDES_ATTENDUES_B04).toHaveLength(1);
    expect(COMMANDES_ATTENDUES_B04[0]!.manque).toContain("interrogation");
  });
});

/**
 * Un export tronqué en silence est une attestation fausse — exactement le
 * contraire de ce qu'un contrôle vient chercher.
 *
 * La lecture d'écran se plafonne à deux cents lignes ; l'export n'a pas ce
 * droit. La propriété se lit dans le source parce qu'elle porte sur une
 * requête : la vérifier en base demanderait deux cent une écritures pour
 * dire ce qu'un mot dit.
 *
 * Le plafond est un paramètre **obligatoire** pour cette raison : un
 * paramètre facultatif se laisse oublier, et l'oubli irait dans le sens du
 * danger.
 */
describe("un export n'est jamais plafonné", () => {
  const lecture = readFileSync("src/server/lecture/backoffice.ts", "utf8");

  const declaration = (nom: string): string => {
    const debut = lecture.indexOf(`function ${nom}(`);
    const suite = lecture.indexOf("\nexport ", debut);
    const fin = lecture.indexOf("\nasync function", debut);
    const bornes = [suite, fin].filter((i) => i > debut);
    return lecture.slice(debut, Math.min(...bornes, lecture.length));
  };

  it("la lecture de période le dit explicitement", () => {
    const periode = declaration("journalDeLaPeriode");
    expect(periode).toContain('lireLeJournal("aucun"');
    // Ni `take`, ni un plafond numérique passé au lecteur. Les nombres de
    // la fenêtre de dates — 86 400 000, les millisecondes d'un jour — ne
    // sont pas des plafonds, d'où le critère porté sur l'appel.
    expect(periode).not.toContain("take");
    expect(periode).not.toMatch(/lireLeJournal\(\s*\d/u);
  });

  it("la lecture d'écran garde son plafond, elle", () => {
    expect(declaration("journal")).toContain("lireLeJournal(200)");
  });

  it("le plafond ne peut pas être omis", () => {
    expect(declaration("lireLeJournal")).toMatch(/plafond: Plafond,/u);
    expect(declaration("lireLeJournal")).not.toMatch(/plafond\?:/u);
  });
});

/**
 * Un export est une lecture en gros, pas une lecture d'écran.
 *
 * `limite: "lecture"` autorise deux cent quarante appels par minute. Une
 * route qui rassemble en un fichier tout ce qu'un périmètre contient est
 * exactement ce qu'un accès volé chercherait à obtenir d'un seul appel :
 * c'est le raisonnement de l'export de portabilité, et il vaut ici.
 *
 * Et les deux exports sont journalisés **avant** d'être produits. Après
 * coup, un export qui échoue à l'écriture du fichier ne laisserait aucune
 * trace — et c'est celui-là qu'on voudrait voir.
 */
describe("les deux exports sont des accès en gros", () => {
  const ROUTES = [
    "src/app/api/admin/journal/export/route.ts",
    "src/app/api/admin/paiements/export/route.ts",
  ];

  /**
   * Les commentaires sont retirés avant de conclure.
   *
   * La première version lisait le source brut, et l'en-tête de la route
   * explique justement pourquoi le régime est « sensible » et non
   * « lecture » : le garde-fou était satisfait par sa propre prose, et
   * passer la route en `limite: "lecture"` ne le faisait pas broncher.
   * Troisième fois de cette revue qu'un garde-fou ne connaît que la forme
   * pour laquelle il a été écrit — et troisième fois que la réponse est
   * `sansCommentaires`.
   */
  const code = (route: string) => sansCommentaires(readFileSync(route, "utf8"));

  it("limitées au régime sensible, réservées à l'administration", () => {
    for (const route of ROUTES) {
      expect(code(route), route).toContain('limite: "sensible"');
      expect(code(route), route).toContain('acces: "admin"');
      expect(code(route), route).not.toContain('limite: "lecture"');
    }
  });

  /**
   * Et la trace est **attendue** avant le fichier. Le critère portait sur
   * la position de `journaliser(` : envelopper l'appel dans une fonction
   * jamais appelée le laissait au même endroit du fichier, et le
   * garde-fou au vert. C'est l'attente qui fait la trace.
   */
  it("journalisées avant de produire le fichier", () => {
    for (const route of ROUTES) {
      const source = code(route);
      const trace = source.indexOf("await journaliser(");
      expect(trace, route).toBeGreaterThan(0);
      expect(trace, route).toBeLessThan(source.indexOf("new Response("));
      // Aucune trace différée : `.catch(() => undefined)` ferait d'un
      // échec d'écriture du journal un export sans trace.
      expect(source, route).not.toMatch(/journaliser\([\s\S]*?\}\)\.catch/u);
    }
  });

  it("le fichier descend dans les téléchargements, pas dans un onglet", () => {
    for (const route of ROUTES) {
      const source = code(route);
      expect(source, route).toContain("content-disposition");
      expect(source, route).toContain("attachment; filename=");
      expect(source, route).toContain("TYPE_MIME");
    }
  });
});

/**
 * Le nom vient du serveur quand il le donne : c'est lui qui connaît le
 * périmètre exact du fichier — la période retenue, les catégories
 * filtrées —, et un nom recalculé côté client s'en écarterait le jour où
 * la route changerait de bornes.
 */
describe("le nom du fichier se lit dans l'en-tête", () => {
  it("lit un nom entre guillemets, ou nu", () => {
    expect(
      nomDeLEntete('attachment; filename="immipro-journal-audit-2026-09-01_2026-09-30.csv"'),
    ).toBe("immipro-journal-audit-2026-09-01_2026-09-30.csv");
    expect(nomDeLEntete("attachment; filename=grand-livre.csv")).toBe("grand-livre.csv");
  });

  it("rend null plutôt qu'un nom inventé quand l'en-tête manque", () => {
    expect(nomDeLEntete(null)).toBeNull();
    expect(nomDeLEntete("attachment")).toBeNull();
    expect(nomDeLEntete("")).toBeNull();
  });
});
