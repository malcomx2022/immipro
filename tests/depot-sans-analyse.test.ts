import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sansCommentaires } from "@/domain/copy/source";
import {
  mentionPendantEnvoi,
  mentionPied,
  messageQuotaEpuise,
  quotaEpuise,
} from "@/domain/dossiers/televersement";
import {
  LIBELLE_CONSERVEE_NON_VERIFIEE,
  MENTION_CONSERVEE_NON_VERIFIEE,
  estDeposeeNonVerifiee,
  libelleAction,
  type Piece,
} from "@/domain/dossiers/piece";

/**
 * Le dépôt sans analyse — C-07, RG-06.5.
 *
 * Il n'y avait rien à décider ni de route à écrire : RG-06.5 avait tranché
 * depuis le début, et toute la chaîne serveur l'appliquait. Ce qui manquait
 * tenait à l'écran — un bouton relié à rien, et une phrase qui promettait
 * une analyse qui n'aurait pas lieu.
 */

const piece = (surcharge: Partial<Piece> = {}): Piece => ({
  id: "passeport",
  code: "ID",
  libelle: "Passeport",
  famille: "OBLIGATOIRE",
  etat: "ATTENDUE",
  remede: "TELEVERSER",
  ...surcharge,
});

describe("l'écran ne promet plus une analyse qui n'aura pas lieu", () => {
  /**
   * Le défaut : la phrase était affirmée sans condition, alors que le
   * serveur répond `analyseraLaPiece` à chacun des deux appels du dépôt —
   * et que personne ne lisait ce champ.
   */
  it("dit ce qui va se passer, selon que l'analyse suivra ou non", () => {
    expect(mentionPendantEnvoi(true)).toContain("L'analyse démarre automatiquement");
    expect(mentionPendantEnvoi(false)).not.toContain("L'analyse démarre");
    // Et ce qu'on veut savoir d'abord : le fichier est gardé.
    expect(mentionPendantEnvoi(false)).toContain("conservée sans être analysée");
  });

  it("dit dans les deux cas qu'on peut continuer autre chose", () => {
    for (const analysera of [true, false]) {
      expect(mentionPendantEnvoi(analysera)).toContain("continuer à remplir ton dossier");
    }
  });

  /** RG-06.5 : le quota ferme l'analyse, jamais le dépôt. */
  it("garde le dépôt ouvert quand le quota est épuisé", () => {
    expect(quotaEpuise({ restantes: 0, total: 30, pack: "Dossier" })).toBe(true);
    expect(mentionPied("QUOTA_EPUISE")).toContain("toujours possible sans analyse");
    expect(messageQuotaEpuise(10, "3 000 F")).toContain("téléverser et conserver");
  });

  /**
   * Le bouton n'était relié à rien, et c'est le même geste qu'« Ajouter la
   * pièce » : la chaîne serveur se débrouille du reste. Un test qui clique
   * n'aurait pas vu la différence entre les deux boutons ; celui-ci vérifie
   * que le second en a un.
   */
  it("branche le bouton du quota épuisé sur le même envoi", () => {
    const ecran = sansCommentaires(
      readFileSync(
        "src/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier.tsx",
        "utf8",
      ),
    );
    const bouton = ecran.indexOf("Téléverser sans analyse");
    expect(bouton).toBeGreaterThan(0);
    // L'`onClick` est dans les attributs qui précèdent le libellé.
    expect(ecran.slice(bouton - 260, bouton)).toContain("onClick={() => void envoyer()}");
  });

  it("lit la réponse du serveur, aux deux appels du dépôt", () => {
    const ecran = sansCommentaires(
      readFileSync(
        "src/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier.tsx",
        "utf8",
      ),
    );
    // Deux écritures : la préparation estime, la confirmation décide.
    expect([...ecran.matchAll(/setAnalysera\(/gu)]).toHaveLength(2);
    expect(ecran).toContain("mentionPendantEnvoi(analysera)");
  });
});

describe("une pièce déposée ne se dit plus « attendue »", () => {
  /**
   * La pastille affichait « Attendue » sur une pièce dont le fichier était
   * sur le serveur, à côté d'une action « Remplacer ». Le candidat lisait
   * qu'on attendait toujours sa pièce, et la renvoyait — en dépensant ses
   * données une seconde fois.
   */
  it("reconnaît l'état déposé-non-vérifié, et lui seul", () => {
    expect(estDeposeeNonVerifiee(piece({ etat: "ATTENDUE", remede: "REMPLACER" }))).toBe(
      true,
    );
    // Jamais déposée : le remède est encore « téléverser ».
    expect(estDeposeeNonVerifiee(piece({ etat: "ATTENDUE", remede: "TELEVERSER" }))).toBe(
      false,
    );
    // Déposée et analysée : l'état porte le verdict.
    for (const etat of ["CONFORME", "A_CORRIGER", "ILLISIBLE", "HORS_SUJET"] as const) {
      expect(estDeposeeNonVerifiee(piece({ etat, remede: "REMPLACER" })), etat).toBe(false);
    }
    // En cours de balayage : ce n'est pas encore fini.
    expect(estDeposeeNonVerifiee(piece({ etat: "EN_ANALYSE", remede: "REMPLACER" }))).toBe(
      false,
    );
  });

  it("dit le fichier arrivé avant de dire la vérification manquante", () => {
    expect(LIBELLE_CONSERVEE_NON_VERIFIEE).toBe("Conservée, non vérifiée");
    expect(MENTION_CONSERVEE_NON_VERIFIEE).toMatch(/^Ton fichier est bien arrivé/u);
    expect(MENTION_CONSERVEE_NON_VERIFIEE).toContain("recharger des analyses");
    // Jamais une promesse, jamais un pronostic.
    expect(MENTION_CONSERVEE_NON_VERIFIEE).not.toMatch(/garanti|chances|score/iu);
  });

  /** L'action reste « Remplacer » : le fichier est là, il peut être changé. */
  it("propose de remplacer, pas d'ajouter", () => {
    expect(libelleAction(piece({ etat: "ATTENDUE", remede: "REMPLACER" }))).toBe(
      "Remplacer",
    );
  });

  it("les deux checklists portent le libellé", () => {
    for (const ecran of [
      "src/app/(app)/(dossier)/dossiers/[id]/Checklist.tsx",
      "src/app/(app)/(dossier)/dossiers/[id]/completude/Completude.tsx",
    ]) {
      const code = sansCommentaires(readFileSync(ecran, "utf8"));
      expect(code, ecran).toContain("estDeposeeNonVerifiee(piece)");
      expect(code, ecran).toContain("LIBELLE_CONSERVEE_NON_VERIFIEE");
    }
  });
});

/**
 * Et la chaîne serveur, qui avait déjà raison. Les trois propriétés se
 * lisent dans le source parce qu'elles portent sur l'ordre des appels — et
 * c'est cet ordre qui fait que RG-06.5 est tenu.
 */
describe("la chaîne serveur tenait déjà RG-06.5", () => {
  const depot = sansCommentaires(
    readFileSync("src/app/api/dossiers/[id]/pieces/[pieceId]/depot/route.ts", "utf8"),
  );
  const balayage = sansCommentaires(readFileSync("src/server/jobs/balayage.ts", "utf8"));

  it("le dépôt ne refuse rien sur le quota, et dit si l'analyse suivra", () => {
    expect(depot).toContain("analyseraLaPiece");
    // Aucun refus lié au quota : RG-06.5 ferme l'analyse, pas le dépôt.
    expect(depot).not.toContain('echec("quota_epuise")');
  });

  /**
   * Le solde se relit au balayage et non au dépôt : entre les deux, une
   * autre pièce a pu consommer la dernière analyse.
   */
  it("le balayage relit le solde avant de mettre l'analyse en file", () => {
    expect(balayage).toContain("await solde(");
    expect(balayage.indexOf("await solde(")).toBeLessThan(
      balayage.indexOf('return "ANALYSE"'),
    );
  });

  /** Sans analyse, la pièce revient en attente : elle n'est pas conforme. */
  it("remet la pièce en attente quand l'analyse ne suit pas", () => {
    const apres = balayage.slice(balayage.indexOf('return "ANALYSE"'));
    expect(apres).toContain('status: "ATTENDUE"');
    expect(apres).toContain("recalculerCompletude(");
  });
});
