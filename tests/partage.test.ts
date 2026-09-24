import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { sansCommentaires } from "@/domain/copy/source";
import { join } from "node:path";
import {
  ACCORD_DUREE_JOURS,
  MENTION_DE_LAUTORISATION,
  etatDuPartage,
  libelleDeLAutorisation,
  libelleEcheance,
  LIBELLE_ETAT_PARTAGE,
  MENTION_RETRAIT,
  MENTION_REVOCATION,
  PARTAGES_VIDES,
  peutLire,
} from "@/domain/consultants/access";

/**
 * Le retrait d'un accord de partage — RG-12.2.
 *
 * « Révocable à tout moment » était écrit trois fois — la mention de T-04,
 * la case de T-05, et depuis le lot I.E le courrier de confirmation — et
 * rien ne permettait de retirer quoi que ce soit.
 */

const ACCORD = {
  dossierId: "nl-4471",
  consultantId: "vermeulen",
  donneLe: new Date("2026-09-17T10:00:00Z"),
};
const ECHEANCE = new Date("2026-10-01T10:00:00Z");
const PENDANT = new Date("2026-09-20T10:00:00Z");
const APRES = new Date("2026-10-02T10:00:00Z");

describe("un accord a trois états, et ils ne se valent pas", () => {
  it("ouvert tant que l'échéance n'est pas passée", () => {
    expect(etatDuPartage(ACCORD, ECHEANCE, PENDANT)).toBe("actif");
  });

  /**
   * Un accès échu s'est fermé tout seul à la date convenue ; un accès
   * retiré l'a été par quelqu'un. Les confondre ferait croire à un geste
   * qu'on n'a pas fait.
   */
  it("échu se distingue de retiré", () => {
    expect(etatDuPartage(ACCORD, ECHEANCE, APRES)).toBe("echu");
    expect(
      etatDuPartage({ ...ACCORD, revoqueLe: new Date("2026-09-18T10:00:00Z") }, ECHEANCE, PENDANT),
    ).toBe("retire");
  });

  it("un retrait prime sur l'échéance, même après elle", () => {
    // Retirer un accès déjà échu reste un geste : l'écran ne doit pas le
    // réécrire en « échu » et faire croire que le candidat n'a rien fait.
    expect(
      etatDuPartage({ ...ACCORD, revoqueLe: new Date("2026-09-18T10:00:00Z") }, ECHEANCE, APRES),
    ).toBe("retire");
  });

  it("chaque état a son libellé et son échéance lisible", () => {
    expect(LIBELLE_ETAT_PARTAGE.actif).toBe("Accès ouvert");
    expect(libelleEcheance("actif", "1er octobre 2026")).toBe("Jusqu'au 1er octobre 2026");
    expect(libelleEcheance("echu", "1er octobre 2026")).toBe("Échu le 1er octobre 2026");
    // Un accord retiré ne porte pas la date à laquelle il aurait expiré :
    // elle n'a plus eu lieu d'être.
    expect(libelleEcheance("retire", "1er octobre 2026")).toBe("Retiré");
  });
});

describe("le retrait ferme l'accès et le dit", () => {
  /**
   * Le modèle de droits donne déjà la réponse : un accord révoqué n'est
   * plus actif, et `peutLire` refuse pour « sans accord ». Le retrait n'a
   * donc rien à réécrire, il pose une date.
   */
  it("un accord révoqué ne laisse plus lire", () => {
    const habilitations = [
      { consultantId: "vermeulen", destination: "NL", habiliteLe: new Date("2024-03-01") },
    ];
    const dossier = { id: "nl-4471", destination: "NL" };

    expect(peutLire("vermeulen", dossier, habilitations, [ACCORD], PENDANT).autorise).toBe(true);

    const apresRetrait = peutLire(
      "vermeulen",
      dossier,
      habilitations,
      [{ ...ACCORD, revoqueLe: new Date("2026-09-18T10:00:00Z") }],
      PENDANT,
    );
    expect(apresRetrait.autorise).toBe(false);
    if (!apresRetrait.autorise) expect(apresRetrait.motifs).toEqual(["SANS_ACCORD"]);
  });

  /**
   * Quelqu'un qui croit effacer une consultation déjà eue se tromperait sur
   * ce qu'il obtient. La phrase le dit avant le geste.
   */
  it("il ne promet pas d'effacer ce qui a été vu", () => {
    expect(MENTION_RETRAIT).toContain("ferme l'accès immédiatement");
    // Ce qui a été vu l'a été : le retrait vaut pour l'avenir.
    expect(MENTION_RETRAIT).toMatch(/pour l'avenir/u);
    expect(MENTION_RETRAIT).toMatch(/déjà vu/u);
    expect(MENTION_RETRAIT).not.toMatch(/supprim|efface/iu);
    // Et il ne s'appuie plus sur un journal que personne n'écrit.
    expect(MENTION_RETRAIT).not.toMatch(/journal/iu);
  });

  it("l'absence de partage dit quand un accès s'ouvre", () => {
    expect(PARTAGES_VIDES).toContain("se referme seul");
  });
});

/**
 * La mention nomme un écran. Tant que cet écran ne portait pas les
 * accords, elle envoyait le candidat au mauvais endroit — et le test des
 * liens morts ne pouvait rien y voir : l'adresse était servie.
 */
describe("la mention nomme un écran qui tient sa promesse", () => {
  const A05 = readFileSync("src/app/(auth)/consentements/page.tsx", "utf8");
  const ECRAN = readFileSync("src/app/(auth)/consentements/Consentements.tsx", "utf8");

  it("« Mes consentements » est bien le titre de l'écran nommé", () => {
    expect(MENTION_REVOCATION).toContain("Mes consentements");
    expect(A05).toContain('title: "Mes consentements"');
  });

  it("et cet écran porte les accords de partage", () => {
    expect(ECRAN).toContain("Dossiers partagés");
    expect(ECRAN).toContain("/api/comptes/partages");
  });

  /**
   * Le lien de l'annuaire s'appelait « Gérer mes consentements de partage »
   * et menait au profil, qui n'en parle pas ; celui d'A-05 s'appelait
   * « Mon profil » et menait à l'écran de connexion. Servis tous les deux,
   * donc invisibles au test des liens morts.
   */
  it("les deux liens qui le nommaient y mènent", () => {
    const annuaire = readFileSync(
      "src/app/(app)/(dossier)/consultants/Annuaire.tsx",
      "utf8",
    );
    expect(annuaire).toMatch(/href="\/consentements"[\s\S]{0,200}Gérer mes consentements/u);
    expect(ECRAN).toMatch(/href="\/profil"[\s\S]{0,120}Mon profil/u);
  });
});

/* ------------------------------------------------------------------ *
 * Le consentement dit ce qui est vrai quand il est donné — S.94
 * ------------------------------------------------------------------ */

function fichiers(dir: string, filtre: RegExp, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

/**
 * Deux phrases de T-05 disaient autre chose que le code, sur l'écran où le
 * candidat autorise un tiers à ouvrir ses pièces et paie dans le même geste.
 *
 * **« Chaque consultation de ton dossier par le consultant est inscrite au
 * journal, que tu peux demander à tout moment. »** Rien n'écrit cette ligne :
 * `evenementLecture` n'a aucun appelant en production, `LECTURE_CONSULTANT`
 * n'existe nulle part ailleurs, et aucune surface candidat ne parle de
 * journal. La promesse portait sur un enregistrement qui n'a pas lieu **et**
 * sur un extrait que personne ne sert.
 *
 * **« jusqu'à ce que je retire cet accord »** — l'accord expire de lui-même.
 * RG-12.2 dit « révocable **et** expire automatiquement » ;
 * `confirmerLaConsultation` écrit `expiresAt` à quatorze jours du
 * rendez-vous, et « Mes consentements » affiche l'état échu. Le candidat
 * signait plus long que le vrai, et se croyait tenu de retirer pour que ça
 * cesse.
 */
describe("l'accord annonce sa durée, et ne promet pas de journal", () => {
  const ECRANS = [
    ...fichiers("src/app", /\.tsx$/u),
    ...fichiers("src/components", /\.tsx$/u),
  ];

  it("la case cite la durée que la base applique", () => {
    const libelle = libelleDeLAutorisation("Mme Vermeulen", "Pays-Bas");
    expect(libelle).toContain("Mme Vermeulen");
    expect(libelle).toContain("Pays-Bas");
    expect(libelle).toContain(`${ACCORD_DUREE_JOURS} jours`);
    // Les deux façons dont il s'arrête, et non une seule.
    expect(libelle).toMatch(/retire cet accord/u);
    expect(MENTION_DE_LAUTORISATION).toContain(`${ACCORD_DUREE_JOURS} jours`);
    expect(MENTION_DE_LAUTORISATION).toMatch(/de lui-même/u);
  });

  /**
   * Le nombre vient du domaine. Écrit à l'écran, il aurait divergé de celui
   * que `confirmerLaConsultation` applique — et c'est la durée d'un accès
   * aux pièces d'identité de quelqu'un.
   */
  it("aucun écran n'écrit la durée lui-même", () => {
    const ecran = readFileSync(
      "src/app/(app)/(dossier)/consultants/[id]/rendez-vous/PriseDeRendezVous.tsx",
      "utf8",
    );
    expect(ecran).toContain("libelleDeLAutorisation(");
    expect(ecran).toContain("MENTION_DE_LAUTORISATION");
    expect(ecran).not.toMatch(/jusqu'à ce que je retire/u);
    expect(ecran).not.toMatch(new RegExp(`${ACCORD_DUREE_JOURS} jours`, "u"));
  });

  /**
   * Le garde-fou à deux sens : tant que rien n'écrit la lecture d'un
   * consultant, aucune surface candidat ne promet de journal ; le jour où
   * quelque chose l'écrit, ce test tombe et oblige à ramener la phrase.
   */
  it("rien ne promet un journal des lectures tant que rien ne l'écrit", () => {
    const ecrivains = [
      ...fichiers("src/server", /\.ts$/u),
      ...fichiers("src/app", /\.tsx?$/u),
    ].filter((f) => /evenementLecture\s*\(|LECTURE_CONSULTANT/u.test(readFileSync(f, "utf8")));
    expect(ecrivains, "personne n'écrit encore la lecture d'un consultant").toEqual([]);

    /*
      Le balayage porte sur le **domaine** autant que sur les écrans, et
      commentaires ôtés. La première version ne lisait que `src/app` et
      `src/components` : la mutation qui remettait la phrase dans
      `domain/consultants/access.ts` passait au vert, l'écran ne portant
      que `{MENTION_JOURNAL}`. C'est la leçon de S.83 refaite ici — un
      garde-fou qui lit la surface ne voit pas la phrase qui vient d'en
      dessous.
    */
    const promesses = [
      ...ECRANS,
      ...fichiers("src/domain", /\.ts$/u),
    ].filter((f) =>
      /inscrite au journal|journal des lectures|consultation[^.]{0,60}inscrite/u.test(
        sansCommentaires(readFileSync(f, "utf8")),
      ),
    );
    expect(promesses, "et rien ne l'annonce, ni l'écran ni le texte qu'il rend").toEqual([]);
  });
});
