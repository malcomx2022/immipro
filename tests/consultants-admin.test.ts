import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CONSEQUENCE_ETAT,
  LIBELLE_ETAT,
  RAPPEL_VERIFICATION,
  destinationsCouvertes,
  etatDuConsultant,
  motifDeRefusDuTitre,
  resumeCouverture,
  type ConsultantAdministre,
} from "@/domain/backoffice/consultants";
import { HABILITATIONS_SANS_ECRIVAIN } from "@/domain/exploitation/habilitations";
import { NAVIGATION_ADMIN } from "@/domain/backoffice/navigation";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * B-09 — l'administration des consultants. WF-15, RG-12.1.
 *
 * `Accreditation` était au registre des habilitations sans écrivain :
 * l'annuaire candidat filtre sur les habilitations non révoquées, rien
 * n'en créait, et il était vide pour toutes les destinations —
 * définitivement.
 */

const consultant = (
  partiel: Partial<ConsultantAdministre> = {},
): ConsultantAdministre => ({
  id: "c1",
  nom: "Maître F. Sow",
  cabinet: "Sow & Associés",
  ville: "Dakar",
  qualification: "Avocate, 12 ans",
  langues: ["Français"],
  delaiReponseHeures: 48,
  actif: true,
  habilitations: [],
  ...partiel,
});

const habilitation = (code: string, pays: string, retireeLe?: string) => ({
  code,
  pays,
  titre: "RCIC",
  verifieeLe: "2026-09-01",
  verifiePar: { genre: "PERSONNE" as const, libelle: "Awa Kone", identifiant: "adm-1" },
  ...(retireeLe ? { retireeLe } : {}),
});

describe("l'état dit ce que le candidat voit", () => {
  it("visible seulement avec une habilitation en cours", () => {
    expect(etatDuConsultant(consultant())).toBe("SANS_HABILITATION");
    expect(
      etatDuConsultant(consultant({ habilitations: [habilitation("CA", "Canada")] })),
    ).toBe("VISIBLE");
  });

  /**
   * Le cas qu'un « actif / inactif » laisse sans nom : la fiche est
   * complète, toutes les habilitations ont été retirées, et l'annuaire ne
   * sert plus personne.
   */
  it("nomme le consultant actif dont toutes les habilitations sont retirées", () => {
    const retire = consultant({
      habilitations: [habilitation("CA", "Canada", "2026-09-15")],
    });
    expect(etatDuConsultant(retire)).toBe("SANS_HABILITATION");
    expect(CONSEQUENCE_ETAT.SANS_HABILITATION).toContain("RG-12.1");
  });

  /** La suspension l'emporte : `annuaire()` filtre sur `active` d'abord. */
  it("la suspension l'emporte sur les habilitations", () => {
    const suspendu = consultant({
      actif: false,
      habilitations: [habilitation("CA", "Canada")],
    });
    expect(etatDuConsultant(suspendu)).toBe("SUSPENDU");
    expect(CONSEQUENCE_ETAT.SUSPENDU).toContain("quelles que soient ses habilitations");
  });

  it("ne compte que les habilitations en cours dans la couverture", () => {
    const mixte = consultant({
      habilitations: [habilitation("CA", "Canada"), habilitation("NL", "Pays-Bas", "2026-09-15")],
    });
    expect(destinationsCouvertes(mixte)).toEqual(["Canada"]);
  });

  it("donne un libellé à chaque état", () => {
    for (const etat of ["VISIBLE", "SANS_HABILITATION", "SUSPENDU"] as const) {
      expect(LIBELLE_ETAT[etat].length).toBeGreaterThan(0);
      expect(CONSEQUENCE_ETAT[etat].length).toBeGreaterThan(0);
    }
  });
});

describe("la couverture, et non le décompte", () => {
  /**
   * Trois consultants tous habilités au Canada laissent les dossiers
   * néerlandais sans personne : c'est la destination découverte qui
   * appelle une action, pas le total.
   */
  it("nomme les destinations ouvertes sans consultant", () => {
    const resume = resumeCouverture(
      [consultant({ habilitations: [habilitation("CA", "Canada")] })],
      ["CA", "NL"],
    );
    expect(resume).toContain("NL");
    expect(resume).toContain("1 destination ouverte n'a");
  });

  it("dit quand tout est couvert", () => {
    const resume = resumeCouverture(
      [consultant({ habilitations: [habilitation("CA", "Canada")] })],
      ["CA"],
    );
    expect(resume).toContain("au moins un consultant habilité");
  });

  it("dit quand rien ne l'est", () => {
    expect(resumeCouverture([], ["CA", "NL"])).toContain("Aucune destination ouverte");
  });

  it("n'invente pas un manque sans destination ouverte", () => {
    expect(resumeCouverture([], [])).toContain("pas d'annuaire à remplir");
  });

  /**
   * Le cas qui isole le filtre : le consultant est bien visible — il garde
   * une habilitation au Canada — mais celle des Pays-Bas a été retirée.
   * Les Pays-Bas sont donc découverts, et compter toutes les lignes sans
   * regarder la date de retrait les dirait couverts.
   */
  it("ne compte pas l'habilitation retirée d'un consultant par ailleurs visible", () => {
    const resume = resumeCouverture(
      [
        consultant({
          habilitations: [
            habilitation("CA", "Canada"),
            habilitation("NL", "Pays-Bas", "2026-09-15"),
          ],
        }),
      ],
      ["CA", "NL"],
    );
    expect(resume).toContain("NL");
    expect(resume).toContain("1 destination ouverte n'a");
  });

  /** Un suspendu ne couvre rien, même habilité. */
  it("ne compte pas un consultant suspendu", () => {
    const resume = resumeCouverture(
      [consultant({ actif: false, habilitations: [habilitation("CA", "Canada")] })],
      ["CA"],
    );
    expect(resume).toContain("Aucune destination ouverte");
  });
});

describe("le titre vérifié est relevé tel quel", () => {
  it("refuse un titre vide, et dit quoi écrire", () => {
    expect(motifDeRefusDuTitre("")).toContain("RCIC");
    expect(motifDeRefusDuTitre(" ")).not.toBeNull();
    expect(motifDeRefusDuTitre("RCIC")).toBeNull();
  });
});

describe("qui vérifie ne se saisit pas", () => {
  const ROUTE = sansCommentaires(
    readFileSync("src/app/api/admin/consultants/route.ts", "utf8"),
  );

  /**
   * `verifiedBy` vient de la session. Un nom tapé dans un champ peut être
   * celui de n'importe qui, et c'est justement cette ligne qu'on relira si
   * une habilitation est contestée — même raison qu'au journal d'audit,
   * où l'acteur vient de la session (R.4).
   */
  it("prend le vérificateur dans la session, jamais dans le corps", () => {
    expect(ROUTE).toMatch(/verifiedBy:\s*acteur!\.id/u);
    expect(ROUTE).not.toMatch(/verifiedBy:\s*corps\./u);
    // Et le corps n'offre aucun champ où glisser un nom.
    expect(ROUTE).not.toMatch(/verifiePar|verifiedBy:\s*z\./u);
  });

  /** Chaque geste porte un motif : « habilité le 12 » ne répond à rien. */
  it("exige un motif sur chacun des quatre gestes", () => {
    const gestes = ROUTE.match(/geste:\s*z\.(literal|enum)\([^)]*\)/gu) ?? [];
    expect(gestes.length).toBeGreaterThanOrEqual(3);
    const branches = ROUTE.split("z.object({").slice(1);
    const avecGeste = branches.filter((b) => b.includes("geste:"));
    for (const branche of avecGeste) {
      expect(branche.slice(0, branche.indexOf("})"))).toContain("motif:");
    }
  });

  /**
   * Un retrait refusé laissait quand même sa ligne au journal : deux
   * `consultant.retirer` s'y lisaient là où un seul avait eu lieu. C'est
   * la ligne qu'on relit quand une habilitation est contestée.
   */
  it("prononce les refus avant d'écrire au journal", () => {
    const refus = ROUTE.indexOf("etat_incompatible");
    const trace = ROUTE.indexOf("await journaliser({", ROUTE.indexOf("PUT = route"));
    expect(refus).toBeGreaterThan(0);
    expect(trace).toBeGreaterThan(0);
    expect(refus).toBeLessThan(trace);
  });

  /** Un retrait date l'habilitation ; il ne la supprime pas. */
  it("ne supprime jamais une accréditation", () => {
    expect(ROUTE).toMatch(/revokedAt:\s*new Date\(\)/u);
    expect(ROUTE).not.toContain("accreditation.delete");
  });
});

describe("qui a vérifié se lit, et reste identifiable", () => {
  /**
   * « Vérifié par 3911f2ee-… » promet une personne et montre une clé
   * primaire — ce que l'arbitrage du 21/09/2026 a retiré du journal
   * d'audit. La lecture résout, l'écran affiche le libellé, et
   * l'identifiant durable reste en second.
   */
  it("l'écran lit un acteur, pas un identifiant", () => {
    const ecran = sansCommentaires(
      readFileSync("src/app/(admin)/habilitations/Consultants.tsx", "utf8"),
    );
    expect(ecran).toContain("h.verifiePar.libelle");
    expect(ecran).toContain("h.verifiePar.identifiant");
    expect(ecran).not.toMatch(/\{h\.verifiePar\}/u);
  });

  it("la lecture résout l'identifiant par le même chemin que le journal", () => {
    const lecture = sansCommentaires(
      readFileSync("src/server/lecture/backoffice.ts", "utf8"),
    );
    expect(lecture).toMatch(/verifiePar:\s*acteurLisible\(/u);
  });
});

describe("le registre s'est vidé d'une entrée", () => {
  it("Accreditation n'y est plus, PartnerActivation y reste", () => {
    const tables = HABILITATIONS_SANS_ECRIVAIN.map((h) => h.table);
    expect(tables).not.toContain("Accreditation");
    expect(tables).toContain("PartnerActivation");
  });

  it("l'écran est atteignable depuis la navigation du back-office", () => {
    expect(NAVIGATION_ADMIN.map((e) => e.href)).toContain("/habilitations");
  });

  /**
   * La collision que seul `next build` voyait : le groupe `(admin)` et
   * l'application candidat partagent l'espace d'adresses, et `/consultants`
   * était déjà l'annuaire (T-04). Next refuse deux pages parallèles sur la
   * même adresse — mais après lint, typecheck et 1570 tests.
   */
  it("aucune adresse du back-office ne recouvre une adresse candidat", () => {
    const adresses = (racine: string): string[] => {
      const sortie: string[] = [];
      const parcourir = (dossier: string, chemin: string) => {
        for (const entree of readdirSync(dossier, { withFileTypes: true })) {
          const complet = join(dossier, entree.name);
          if (entree.isDirectory()) {
            // Un groupe de routes — `(admin)` — ne crée pas de segment.
            const segment = /^\(.*\)$/u.test(entree.name) ? chemin : `${chemin}/${entree.name}`;
            parcourir(complet, segment);
          } else if (entree.name === "page.tsx") {
            sortie.push(chemin || "/");
          }
        }
      };
      parcourir(racine, "");
      return sortie;
    };

    const admin = adresses("src/app/(admin)");
    const candidat = [...adresses("src/app/(app)"), ...adresses("src/app/(public)")];
    const collisions = admin.filter((a) => candidat.includes(a));
    expect(collisions).toEqual([]);
  });

  it("le rappel de vérification ne prétend pas définir la preuve", () => {
    expect(RAPPEL_VERIFICATION).toContain("registre professionnel");
    expect(RAPPEL_VERIFICATION).toContain("Ton nom et la date");
  });
});
