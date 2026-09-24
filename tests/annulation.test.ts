import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { sansCommentaires } from "@/domain/copy/source";
import {
  MENTION_DECALAGE,
  MENTION_DELAI_REMBOURSEMENT,
  MOTIF_REMBOURSEMENT_SUPPRESSION,
  RENDEZ_VOUS_VIDES,
  avertissementAnnulation,
  avertissementSuppression,
  issueDeLAnnulation,
  refusDeLAnnulation,
  suiteDeLAnnulation,
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

/**
 * Le geste que trois surfaces promettaient — T-05, WF-12, RG-12.5.
 *
 * `conditions()` sous les créneaux, l'écran de confirmation de paiement et
 * le courrier de confirmation annonçaient tous « **annulation ou report
 * sans frais** jusqu'au […] ». `issueDeLAnnulation` n'avait que deux
 * appelants — une lecture d'écran, et `acheverLaSuppression` : le seul
 * moyen d'annuler une consultation était de **supprimer son compte**.
 *
 * Le garde-fou central est la réciproque de la promesse : une surface qui
 * annonce une annulation doit nommer l'endroit où on l'exerce, et cet
 * endroit doit exister. Le mot « report », lui, ne doit plus figurer :
 * déplacer un rendez-vous demande trois arbitrages que WF-12 ne porte pas,
 * et une promesse sans mécanisme est ce que ce lot corrige.
 */
describe("l'annulation par le candidat", () => {
  const CRENEAU = new Date("2026-10-09T13:30:00.000Z");
  const AVANT = new Date("2026-10-01T09:00:00.000Z");

  it("un rendez-vous réservé et à venir s'annule", () => {
    expect(refusDeLAnnulation({ etat: "RESERVE", debut: CRENEAU }, AVANT)).toBeNull();
    expect(refusDeLAnnulation({ etat: "REPORTE", debut: CRENEAU }, AVANT)).toBeNull();
  });

  it("un créneau seulement tenu n'a rien à annuler", () => {
    // Rien n'est payé, rien n'est promis, et la tenue expire d'elle-même.
    expect(refusDeLAnnulation({ etat: "TENU", debut: CRENEAU }, AVANT)).toBe("sans_objet");
    expect(refusDeLAnnulation({ etat: "ANNULE", debut: CRENEAU }, AVANT)).toBe("sans_objet");
  });

  it("un créneau passé ne s'annule plus, même dans la limite", () => {
    // Le seul cas où l'annulation n'a plus de sens : la consultation a eu
    // lieu, ou elle n'a pas été honorée, et ni l'un ni l'autre ne se défait.
    const apres = new Date(CRENEAU.getTime() + 60_000);
    expect(refusDeLAnnulation({ etat: "RESERVE", debut: CRENEAU }, apres)).toBe("passe");
  });

  it("la limite dépassée retient les frais, elle n'interdit pas d'annuler", () => {
    /*
      `FRAIS_DUS` dit « les frais restent dus », pas « c'est trop tard » :
      le créneau se libère quand même, parce qu'un consultant qui attend
      quelqu'un qui ne viendra pas perd son heure.
    */
    const tard = new Date(CRENEAU.getTime() - 3_600_000);
    expect(refusDeLAnnulation({ etat: "RESERVE", debut: CRENEAU }, tard)).toBeNull();
    expect(issueDeLAnnulation(new Date(CRENEAU.getTime() - 24 * 3_600_000).toISOString(), tard))
      .toBe("FRAIS_DUS");
  });

  it("l'avertissement dit ce qu'on perd, et le cas qui coûte ne s'ouvre pas bien", () => {
    const rendu = avertissementAnnulation({ quand: "vendredi 9 octobre", issue: "REMBOURSABLE" });
    expect(rendu).toMatch(/remboursée/u);
    expect(rendu).toMatch(/redevient libre/u);

    const du = avertissementAnnulation({ quand: "vendredi 9 octobre", issue: "FRAIS_DUS" });
    // La phrase chère commence par ce qu'elle coûte : quelqu'un qui
    // s'arrête à la première ligne doit s'arrêter sur celle-là.
    expect(du.startsWith("La consultation")).toBe(true);
    expect(du).toMatch(new RegExp(`${CONSULTATION_ANNULATION_HEURES} h`, "u"));
    expect(du).toMatch(/ne sera pas rendue/u);
  });

  it("la suite dit si le remboursement est parti, sans promettre de date", () => {
    expect(suiteDeLAnnulation("REMBOURSABLE")).toContain(MENTION_DELAI_REMBOURSEMENT);
    expect(suiteDeLAnnulation("REMBOURSABLE")).not.toMatch(/\d+\s*(heures?|jours?)/u);
    expect(suiteDeLAnnulation("FRAIS_DUS")).toMatch(/reste due/u);
  });

  /**
   * Le garde-fou : une surface qui promet une annulation nomme l'endroit,
   * et cet endroit existe. Les trois phrases se lisent dans leur source
   * plutôt que recopiées ici — les deux bougeraient sinon séparément.
   */
  it("les trois surfaces qui annoncent l'annulation nomment où elle se prend", () => {
    const SURFACES = [
      "src/domain/consultants/rendez-vous.ts",
      "src/server/courrier.ts",
      "src/app/(app)/paiement/confirme/page.tsx",
    ];
    for (const f of SURFACES) {
      /*
        Les commentaires sont écartés : ceux qui expliquent la correction
        citent la phrase d'avant, et un garde-fou qui punit sa propre
        justification finit contourné.

        Le repère est « Annulation sans frais », la promesse elle-même, et
        non un identifiant qui contiendrait le mot. L'endroit se cherche
        dans les quatre cents caractères qui suivent : à l'écran, la phrase
        traverse un lien et des entités JSX.
      */
      const texte = sansCommentaires(lire(f));
      const promesses = [...texte.matchAll(/Annulation sans frais/gu)].map((m) =>
        texte.slice(m.index, m.index + 400),
      );
      expect(promesses.length).toBeGreaterThan(0);
      for (const phrase of promesses) expect(phrase).toMatch(/autorisations/u);
    }
  });

  it("et le mot que rien ne tenait a disparu de l'interface", () => {
    /*
      « Report » figurait dans les trois phrases sans qu'aucun mécanisme ne
      déplace un rendez-vous. Déplacer demande de savoir si le consultant y
      consent, si l'ancien créneau se libère avant que le nouveau soit tenu,
      et ce qu'il advient du paiement entre les deux : trois arbitrages que
      WF-12 ne porte pas.
    */
    const partout = [
      "src/domain/consultants/rendez-vous.ts",
      "src/server/courrier.ts",
      "src/app/(app)/paiement/confirme/page.tsx",
      "src/domain/consultants/annulation.ts",
    ].map((f) => sansCommentaires(lire(f)));
    for (const texte of partout) expect(texte).not.toMatch(/report sans frais/iu);
  });

  it("et cet endroit est une route, pas une intention", () => {
    // Une promesse dont le geste n'a pas de route est exactement le défaut
    // corrigé : trois surfaces l'annonçaient, aucune ne l'offrait.
    expect(existsSync("src/app/api/comptes/rendez-vous/route.ts")).toBe(true);
    expect(
      existsSync("src/app/api/comptes/rendez-vous/[reference]/annulation/route.ts"),
    ).toBe(true);
  });

  it("l'état vide de la liste dit où l'on prend un rendez-vous", () => {
    expect(RENDEZ_VOUS_VIDES).toMatch(/annuaire des consultants/u);
    expect(MENTION_DECALAGE).toMatch(/annule-le avant sa limite/u);
  });
});
