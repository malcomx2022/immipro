import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ISSUES_ECART,
  LIBELLE_ISSUE,
  NOTE_MINIMUM,
  SUITE_DE_L_ISSUE,
  ecartOuvert,
  obstacleALaResolution,
} from "@/domain/backoffice/ecart";

/**
 * La résolution d'un écart de réconciliation — arbitrage du 21/09/2026.
 *
 * B-04 affichait « Traiter les N écarts » sur un bouton sans action. Deux
 * conséquences, et la seconde était invisible : le compteur ne pouvait
 * pas redescendre, et O.B — dont le sursis de trente jours court depuis
 * la clôture d'un dossier — n'avait aucun événement pour la dater.
 */

const lire = (f: string) => readFileSync(f, "utf8");
const ACCES = "src/server/acces/paiements.ts";
const ROUTE = "src/app/api/admin/paiements/[reference]/ecart/route.ts";

describe("un écart se referme, il ne s'efface pas", () => {
  it("ouvert veut dire : il existe, et personne ne l'a refermé", () => {
    expect(ecartOuvert({ discrepancy: "Sans confirmation.", discrepancyResolvedAt: null })).toBe(
      true,
    );
    expect(
      ecartOuvert({ discrepancy: "Sans confirmation.", discrepancyResolvedAt: new Date() }),
    ).toBe(false);
    expect(ecartOuvert({ discrepancy: null, discrepancyResolvedAt: null })).toBe(false);
  });

  /**
   * Le constat survit à sa réponse. Un historique qui ne garde que la
   * conclusion a perdu la question — et c'est la question qu'on relit
   * quand le même cas se représente.
   */
  it("l'écriture ne touche pas au texte du constat", () => {
    const fonction = /export async function resoudreLEcart[\s\S]*?\n\}$/mu.exec(lire(ACCES))![0];
    const ecriture = /data: \{[\s\S]*?\n {4}\},/u.exec(fonction)![0];
    expect(ecriture).not.toMatch(/\bdiscrepancy:/u);
    for (const champ of ["discrepancyOutcome", "discrepancyNote", "discrepancyResolvedAt", "discrepancyResolvedBy"]) {
      expect(ecriture, champ).toContain(champ);
    }
  });

  /**
   * Et aucun code n'efface un écart, nulle part.
   *
   * La vérification porte sur ce qui est **écrit**, et non sur le
   * fichier entier : `discrepancy: null` en condition d'une mise à jour
   * est l'inverse d'un effacement — c'est ce qui fait que le premier
   * constat reste, parce qu'il empêche le suivant de l'écraser. Le
   * fichier entier ne sait pas distinguer les deux, et interdire la
   * lecture pour protéger l'écriture pousserait à écrire la garde
   * autrement, donc ailleurs.
   */
  it("rien ne remet le constat à nul", () => {
    for (const f of [ACCES, ROUTE, "src/server/jobs/reconciliation.ts"]) {
      const source = lire(f);
      const ecritures = [...source.matchAll(/\.update\w*\(\{/gu)].map((m) => {
        const reste = source.slice(m.index!);
        const debut = reste.indexOf("data: {");
        return debut === -1 ? "" : reste.slice(debut, reste.indexOf("});", debut));
      });
      for (const ecriture of ecritures) {
        expect(ecriture, f).not.toMatch(/discrepancy: null/u);
      }
      // Et la seule manière d'échapper à ce qui précède — un effacement
      // en SQL brut — n'existe pas non plus.
      expect(source, f).not.toMatch(/discrepancy"?\s*=\s*NULL/iu);
    }
  });
});

describe("le guichet ne fabrique pas la vérité financière", () => {
  /**
   * **Le test central de cet arbitrage.** Une action manuelle ne déclare
   * pas un paiement encaissé ni remboursé : seule la notification signée
   * du fournisseur fait bouger l'argent (INV-7). « Remboursement à
   * initier » est une issue de guichet, pas un virement.
   *
   * La vérification porte sur le `data` de l'écriture, pas sur
   * l'intention du commentaire : c'est la seule forme qui tombe le jour
   * où quelqu'un ajoute un champ « pendant qu'on y est ».
   */
  it("l'écriture ne touche à aucun champ d'argent", () => {
    const fonction = /export async function resoudreLEcart[\s\S]*?\n\}$/mu.exec(lire(ACCES))![0];
    const ecriture = /data: \{[\s\S]*?\n {4}\},/u.exec(fonction)![0];
    for (const interdit of [
      "status",
      "confirmedAt",
      "refundedAt",
      "refundDueAt",
      "refundBasis",
      "amount",
      "reconciledAt",
    ]) {
      expect(ecriture, interdit).not.toContain(interdit);
    }
  });

  /**
   * Et l'écran le dit à celui qui choisit : deux issues referment sans
   * suite, deux en appellent une ailleurs. Les confondre est la faute qui
   * laisse une somme non rendue derrière un écart marqué résolu.
   */
  it("l'issue qui appelle un remboursement dit qu'elle ne le fait pas", () => {
    expect(SUITE_DE_L_ISSUE.REMBOURSEMENT_A_INITIER).toMatch(/ne rend aucune somme/u);
    for (const issue of ISSUES_ECART) {
      expect(SUITE_DE_L_ISSUE[issue].length, issue).toBeGreaterThan(40);
      expect(LIBELLE_ISSUE[issue], issue).toBeTruthy();
    }
    expect(ISSUES_ECART).toHaveLength(4);
  });
});

describe("une résolution est entière, ou elle n'est pas", () => {
  it("il faut une issue et une note qui se relise", () => {
    expect(obstacleALaResolution({}, true)).toMatch(/issue/u);
    expect(obstacleALaResolution({ issue: "INCIDENT_TRANSMIS" }, true)).toMatch(/constaté/u);
    expect(
      obstacleALaResolution({ issue: "INCIDENT_TRANSMIS", note: "ok" }, true),
    ).toMatch(/constaté/u);
    expect(
      obstacleALaResolution(
        { issue: "INCIDENT_TRANSMIS", note: "Relancé le fournisseur, sans réponse." },
        true,
      ),
    ).toBeNull();
  });

  /** Un écart déjà refermé ne se referme pas deux fois. */
  it("un écart refermé le dit plutôt que de griser sans raison", () => {
    expect(
      obstacleALaResolution(
        { issue: "INCIDENT_TRANSMIS", note: "Relancé le fournisseur." },
        false,
      ),
    ).toMatch(/déjà refermé/u);
  });

  /** La base exige les quatre ensemble : le service ne peut pas en oublier un. */
  it("la base refuse une résolution partielle", () => {
    const sql = lire("prisma/migrations/20260921000100_resolution_des_ecarts/migration.sql");
    expect(sql).toContain("transaction_resolution_ecart_est_entiere");
    expect(sql).toContain("transaction_resolution_suppose_un_ecart");
    expect(sql).toContain("transaction_resolution_apres_l_ouverture");
  });

  it("la note a un minimum, et le même des deux côtés", () => {
    expect(NOTE_MINIMUM).toBeGreaterThan(5);
    expect(lire(ROUTE)).toContain("z.string().trim().min(NOTE_MINIMUM)");
  });
});

describe("la file se vide, et la trace reste", () => {
  /**
   * Un écart refermé n'est plus à traiter. Sans cela le compteur ne
   * redescend jamais, et un nombre qui ne bouge pas cesse d'être lu.
   */
  it("le compteur ne compte que les écarts ouverts", () => {
    const lecture = lire("src/server/lecture/backoffice.ts");
    const fonction = /function etatDuRapprochement[\s\S]*?\n\}/u.exec(lecture)![0];
    expect(fonction).toMatch(/if \(ecartOuvert\(t\)\) return "ECART"/u);
    expect(fonction).not.toMatch(/if \(t\.discrepancy\) return "ECART"/u);
  });

  /**
   * **Et la déduction par l'âge non plus.** Trouvé en refermant un écart
   * dans l'écran : la base portait l'issue, la note et la date, et la
   * ligne réaffichait « Écart à traiter » au rechargement. La dernière
   * ligne de la fonction ne lit pas `discrepancy` — elle déduit l'écart
   * de l'âge de la transaction — et rouvrait donc ce que la résolution
   * venait de refermer. Le compteur n'aurait jamais pu redescendre.
   */
  it("une transaction traitée sort de la file, même restée en attente", () => {
    const lecture = lire("src/server/lecture/backoffice.ts");
    const fonction = /function etatDuRapprochement[\s\S]*?\n\}/u.exec(lecture)![0];
    expect(fonction).toMatch(
      /aReconcilier\(t\.createdAt, maintenant\) && t\.discrepancyResolvedAt === null/u,
    );
    expect(fonction).not.toMatch(/return aReconcilier\(t\.createdAt, maintenant\) \? "ECART"/u);
  });

  it("la résolution est journalisée, avec son issue et sa note", () => {
    const route = lire(ROUTE);
    expect(route).toMatch(/action: "paiement\.reconciliation"/u);
    expect(route).toMatch(/motif: `Écart refermé — \$\{LIBELLE_ISSUE\[issue\]\} — \$\{corps\.note\}`/u);
    expect(route).toMatch(/acces: "admin"/u);
  });

  /** L'écran montre le constat avant de demander l'issue. */
  it("l'écran fait relire le constat avant de refermer", () => {
    const ecran = lire("src/app/(admin)/paiements/Paiements.tsx");
    const bloc = /function TraitementDeLEcart[\s\S]*?\n\}/u.exec(ecran)![0];
    expect(bloc.indexOf("ecart?.constat")).toBeLessThan(bloc.indexOf("Choisir une issue"));
    expect(bloc).toContain("SUITE_DE_L_ISSUE[issue]");
    expect(bloc).toContain("Refermer l'écart".replace("'", "&apos;"));
  });
});

describe("O.B a enfin son déclencheur", () => {
  /**
   * C'est la raison d'être de ce lot. O.B avait écrit la règle du sursis
   * de trente jours et constaté qu'aucun événement ne pouvait la
   * déclencher. La date de résolution est cet événement.
   */
  it("la purge lit la date de résolution comme date de clôture", () => {
    const purge = lire("src/server/jobs/purge.ts");
    const litige = /function litigeDe[\s\S]*?\n\}$/mu.exec(purge)![0];
    expect(litige).toMatch(/ouvert: ecartOuvert\(t\)/u);
    expect(litige).toMatch(/closLe: t\.discrepancyResolvedAt/u);
    // Et la requête la lit, sinon la fonction recevrait toujours nul.
    expect(purge).toMatch(/discrepancyResolvedAt: true/u);
  });
});
