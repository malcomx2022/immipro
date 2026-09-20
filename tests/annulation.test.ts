import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  avertissementSuppression,
  issueDeLAnnulation,
  MENTION_DELAI_REMBOURSEMENT,
  MOTIF_REMBOURSEMENT_SUPPRESSION,
} from "@/domain/consultants/annulation";
import { CONSULTATION_ANNULATION_HEURES } from "@/domain/payments/pricing";
import {
  agreger,
  estRembourse,
  estRemboursementDu,
  LIBELLE_RAPPROCHEMENT,
  type Paiement,
} from "@/domain/backoffice/reconciliation";

/**
 * K.C, tranché le 20/09/2026 — la suppression de compte n'annule pas les
 * conditions commerciales du rendez-vous.
 *
 * Trois choses se croisaient : la libération du créneau, la limite
 * d'annulation, et l'irréversibilité de la suppression. Ces tests tiennent
 * que chacune garde son régime propre.
 */

const lire = (f: string) => readFileSync(f, "utf8");
const LIMITE = "2026-09-25T10:00:00.000Z";

describe("la limite décide, pas la suppression", () => {
  it("avant la limite, le rendez-vous est remboursable", () => {
    expect(issueDeLAnnulation(LIMITE, new Date("2026-09-24T10:00:00Z"))).toBe("REMBOURSABLE");
  });

  /** La borne est incluse : à la seconde près, le candidat n'a pas dépassé. */
  it("à la limite exacte, il l'est encore", () => {
    expect(issueDeLAnnulation(LIMITE, new Date(LIMITE))).toBe("REMBOURSABLE");
  });

  it("après la limite, les frais restent dus", () => {
    expect(issueDeLAnnulation(LIMITE, new Date("2026-09-25T10:00:01Z"))).toBe("FRAIS_DUS");
  });

  /**
   * Rembourser à tout moment ferait de la suppression de compte un
   * contournement des conditions d'annulation : il suffirait de supprimer
   * son compte une heure avant pour ne rien payer.
   */
  it("la veille du créneau, supprimer son compte ne rend pas la somme", () => {
    const creneau = new Date("2026-09-26T10:00:00Z");
    const limite = new Date(
      creneau.getTime() - CONSULTATION_ANNULATION_HEURES * 3_600_000,
    ).toISOString();
    expect(issueDeLAnnulation(limite, new Date("2026-09-25T23:00:00Z"))).toBe("FRAIS_DUS");
  });

  /**
   * La limite lue est celle **stockée** avec le rendez-vous, jamais
   * recalculée : une grille qui passerait à quarante-huit heures ne doit
   * pas rendre payant, rétroactivement, ce qui ne l'était pas.
   */
  it("le code lit la limite du rendez-vous, pas la grille", () => {
    const suppression = lire("src/server/acces/suppression.ts");
    expect(suppression).toMatch(/issueDeLAnnulation\(rendezVous\.freeUntil\.toISOString\(\)/u);
    expect(suppression).not.toMatch(/CONSULTATION_ANNULATION_HEURES/u);
  });
});

describe("le créneau se libère indépendamment de l'argent", () => {
  const suppression = lire("src/server/acces/suppression.ts");

  /**
   * L'annulation est dans la transaction d'anonymisation ; l'ouverture du
   * remboursement est après. Un remboursement qui échouerait ne doit pas
   * faire échouer une suppression, qui est la promesse faite au candidat.
   */
  it("l'annulation est dans la transaction, le remboursement après", () => {
    const finDeLaTransaction = suppression.indexOf("  ]);");
    const annulation = suppression.indexOf("db.appointment.updateMany");
    const remboursement = suppression.indexOf("ouvrirUnRemboursement(");
    expect(annulation).toBeGreaterThan(-1);
    expect(annulation).toBeLessThan(finDeLaTransaction);
    expect(remboursement).toBeGreaterThan(finDeLaTransaction);
  });

  /**
   * Les rendez-vous sont lus avant d'être annulés : lus après, la
   * condition d'état ne trouverait plus rien et le traitement financier ne
   * porterait sur personne.
   */
  it("les rendez-vous sont lus avant d'être annulés", () => {
    expect(suppression.indexOf("const aAnnuler = await db.appointment.findMany")).toBeLessThan(
      suppression.indexOf("db.appointment.updateMany"),
    );
  });
});

describe("décidé n'est pas versé", () => {
  /**
   * La règle d'I.C appliquée à l'argent : aucun service absent n'est
   * simulé. Aucune API de remboursement n'est branchée, donc rien n'écrit
   * `REMBOURSEE` au moment de la décision.
   */
  it("ouvrir un remboursement n'écrit pas l'état remboursé", () => {
    const acces = lire("src/server/acces/paiements.ts");
    const fonction = /export async function ouvrirUnRemboursement[\s\S]*?\n\}/u.exec(acces)![0];
    expect(fonction).toMatch(/refundDueAt: maintenant/u);
    // Ce qu'elle écrit : l'obligation et son motif, rien d'autre. `refundedAt`
    // n'apparaît que comme garde en lecture, jamais dans un `data`.
    const ecriture = /data: \{[^}]*\}/u.exec(fonction)![0];
    expect(ecriture).not.toMatch(/refundedAt|REMBOURSEE|status/u);
    // On ne doit que ce qu'on a encaissé.
    expect(fonction).toMatch(/status !== "CONFIRMEE"/u);
  });

  it("une obligation déjà ouverte n'est pas réécrite", () => {
    const acces = lire("src/server/acces/paiements.ts");
    const fonction = /export async function ouvrirUnRemboursement[\s\S]*?\n\}/u.exec(acces)![0];
    expect(fonction).toMatch(/refundDueAt\) return \{ ouvert: false/u);
    expect(fonction).toMatch(/refundedAt\) return \{ ouvert: false/u);
  });

  it("la base tient l'obligation et son motif ensemble", () => {
    const migration = lire("prisma/migrations/20260920000600_remboursement_du/migration.sql");
    expect(migration).toContain("transaction_remboursement_du_porte_son_motif");
    expect(migration).toContain("transaction_remboursement_du_suppose_un_encaissement");
    expect(migration).toContain("transaction_remboursement_du_avant_le_versement");
  });
});

describe("le back-office voit la dette, et ne la confond pas", () => {
  const paiement = (etat: Paiement["etat"], montant = 20000): Paiement => ({
    reference: `IMP-${etat}`,
    compte: "a@ex.test",
    montant,
    devise: "XOF",
    moyen: "Mobile money",
    recuLe: "2026-09-20T10:00:00.000Z",
    etat,
  });

  it("un remboursement dû n'est ni encaissé ni remboursé", () => {
    const du = paiement("REMBOURSEMENT_DU");
    expect(estRemboursementDu(du)).toBe(true);
    expect(estRembourse(du)).toBe(false);
    const a = agreger([paiement("RAPPROCHE", 5000), du]);
    expect(a.encaisse).toEqual({ XOF: 5000 });
    expect(a.rembourse).toEqual({});
    expect(a.remboursementDu).toEqual({ XOF: 20000 });
    expect(a.remboursementsDus).toBe(1);
  });

  it("son libellé dit qu'il reste à verser", () => {
    expect(LIBELLE_RAPPROCHEMENT.REMBOURSEMENT_DU).toMatch(/verser/u);
    expect(LIBELLE_RAPPROCHEMENT.REMBOURSEMENT_DU).not.toBe(
      LIBELLE_RAPPROCHEMENT.REMBOURSE,
    );
  });

  /**
   * Une transaction rapprochée dont on doit l'argent se serait affichée
   * « Rapproché », et personne n'aurait rendu la somme : la dette passe
   * avant le rapprochement.
   */
  it("la dette prime sur le rapprochement", () => {
    const lecture = lire("src/server/lecture/backoffice.ts");
    const fonction = /function etatDuRapprochement[\s\S]*?\n\}/u.exec(lecture)![0];
    expect(fonction.indexOf('return "REMBOURSEMENT_DU"')).toBeLessThan(
      fonction.indexOf('t.status === "CONFIRMEE"'),
    );
  });
});

describe("la force majeure reste une décision de support", () => {
  const geste = lire("src/app/api/admin/paiements/[reference]/remboursement/route.ts");

  it("elle passe par une route d'administration, jamais par une branche", () => {
    expect(geste).toContain('acces: "admin"');
    const suppression = lire("src/server/acces/suppression.ts");
    expect(suppression).not.toMatch(/force majeure/iu);
  });

  /** Un motif obligatoire, sans valeur par défaut ni liste à cocher. */
  it("le motif est écrit, et le geste est journalisé", () => {
    expect(geste).toMatch(/motif: z\.string\(\)\.trim\(\)\.min\(10\)/u);
    expect(geste).toMatch(/action: "paiement\.remboursement"/u);
    expect(geste).toMatch(/motif: corps\.motif/u);
  });
});

describe("le candidat lit la conséquence avant le bouton", () => {
  it("aucun rendez-vous, aucun encadré", () => {
    expect(avertissementSuppression([])).toEqual([]);
  });

  it("un rendez-vous remboursable le dit, et le nomme", () => {
    const [texte] = avertissementSuppression([
      { quand: "vendredi 25 septembre à 15 h 30", issue: "REMBOURSABLE" },
    ]);
    expect(texte).toContain("vendredi 25 septembre à 15 h 30");
    expect(texte).toMatch(/annulé et remboursé/u);
  });

  /**
   * Le cas qui coûte de l'argent est celui qui doit être le plus clair :
   * découvrir après coup qu'une consultation a été retenue, c'est avoir
   * été trompé, même quand la retenue est légitime.
   */
  it("des frais dus se disent, avec la raison", () => {
    const [texte] = avertissementSuppression([
      { quand: "samedi 26 septembre à 9 h 00", issue: "FRAIS_DUS" },
    ]);
    expect(texte).toMatch(/reste due/u);
    expect(texte).toContain(`${CONSULTATION_ANNULATION_HEURES} h`);
    expect(texte).toMatch(/supprimer le compte ne la lève pas/u);
  });

  /**
   * Une phrase par cas, et celle qui coûte en premier : sur l'écran, les
   * deux tenaient dans le même paragraphe et la retenue se lisait comme la
   * fin de la bonne nouvelle.
   */
  it("les deux cas font deux phrases, la plus chère d'abord", () => {
    const phrases = avertissementSuppression([
      { quand: "vendredi 25", issue: "REMBOURSABLE" },
      { quand: "samedi 26", issue: "FRAIS_DUS" },
      { quand: "dimanche 27", issue: "FRAIS_DUS" },
    ]);
    expect(phrases).toHaveLength(2);
    expect(phrases[0]).toMatch(/Tes 2 rendez-vous sont annulés, mais la consultation reste due/u);
    expect(phrases[1]).toMatch(/Ton rendez-vous est annulé et remboursé : vendredi 25\./u);
  });

  /** Le délai ne se promet pas : il n'est pas le nôtre. */
  it("le délai de remboursement n'annonce aucune durée", () => {
    expect(MENTION_DELAI_REMBOURSEMENT).not.toMatch(/\d+\s*(heures?|jours?|h\b)/iu);
    expect(MENTION_DELAI_REMBOURSEMENT).toMatch(/reçus/u);
  });

  it("l'écran rend l'encadré, et le motif dit d'où vient la somme", () => {
    const ecran = lire("src/app/(auth)/compte/suppression/SuppressionDuCompte.tsx");
    expect(ecran).toContain("Tes rendez-vous à venir");
    expect(ecran).toContain("MENTION_DELAI_REMBOURSEMENT");
    expect(MOTIF_REMBOURSEMENT_SUPPRESSION).toMatch(/Suppression de compte/u);
  });
});
