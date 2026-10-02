import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * Le tutoiement, voix générale des contenus candidat — arbitrage du
 * 21/09/2026, constat 5.
 *
 * DOC-12 §16 règle 5 le demandait déjà, et le produit l'appliquait par
 * endroits. Le garde-fou, lui, ne lisait qu'une forme : la raison d'un
 * bouton désactivé. Il a été élargi trois fois pendant N.C — littéral,
 * puis expression JSX, puis constante déclarée dans le même fichier — et
 * chaque élargissement a sorti un vouvoiement de plus. La quatrième fois
 * est celle-ci, et elle change de méthode : plutôt que de suivre une
 * forme syntaxique, le garde lit tout le source de chaque surface
 * candidat, commentaires retirés. Un texte JSX et un littéral y sont
 * traités pareil, parce que le lecteur ne fait pas la différence.
 *
 * **Où le tutoiement s'applique** : l'espace candidat, le tunnel de
 * paiement, les erreurs et confirmations, les courriels transactionnels,
 * les guides et articles destinés au candidat, les pages publiques de
 * présentation, et les textes de pied de page adressés au lecteur.
 *
 * **Où il ne s'applique pas** : le back-office, qui garde une rédaction
 * professionnelle neutre, de préférence sans interpellation personnelle.
 */

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.tsx?$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

/** Les surfaces qui s'adressent au candidat ou au visiteur. */
const SURFACES = [
  "src/app/(app)",
  "src/app/(auth)",
  "src/app/(public)",
  "src/components",
  "src/domain",
  "src/lib/contenu",
  "src/server/courrier.ts",
];

/**
 * Les exceptions, nommées une par une — comme `copy-exceptions.json`, et
 * pour la même raison : une exception qui ne se voit pas dans la diff
 * n'en est plus une.
 */
const HORS_PORTEE = [
  // Le back-office. La décision lui laisse une rédaction professionnelle
  // neutre : son lecteur est un opérateur au travail, pas un candidat.
  "src/domain/backoffice/",
  // Le garde-fou de vocabulaire lui-même. Ses expressions régulières
  // doivent continuer de reconnaître « votre » et « vos » dans un texte
  // qu'on refuse — l'interdire ici désarmerait l'interdit.
  "src/domain/copy/vocabulaire-interdit.ts",
  /**
   * Les corps juridiques de Q.A, quand ils arriveront.
   *
   * Le conseil juridique choisit son registre, et ce choix ne se discute
   * pas ici. L'exception s'arrête au corps du document : les intitulés de
   * navigation et les explications de l'interface autour de lui restent au
   * tutoiement, même si le texte validé emploie « vous ». Les six pages
   * n'existent pas encore (Q.A les tient bloquantes avant l'ouverture
   * publique) : la ligne est écrite pour que celui qui les rédigera trouve
   * l'exception déjà accordée, plutôt qu'un garde-fou à contourner.
   */
  "src/app/(public)/mentions-legales/",
  "src/app/(public)/donnees-personnelles/",
  "src/app/(public)/conditions/",
  /*
    Ils sont arrivés le 02/10/2026 (S.101), et leur corps vit dans un
    modèle du domaine plutôt que dans la page : la page ne fait que servir
    la version validée. L'exception suit le corps, et lui seul — les
    variables, l'écran du back-office et les liens restent dans la
    portée. Le contact en fait partie : il partage ses variables avec les
    conditions (remboursement, contact), et un même passage ne peut pas
    changer de registre d'une page à l'autre. Le registre lui-même reste
    une décision de la direction, consignée dans `docs/juridique/README.md`.
  */
  "src/domain/juridique/modeles.ts",
];

const dansLaPortee = (f: string) => !HORS_PORTEE.some((h) => f.startsWith(h));

const sources = SURFACES.flatMap((s) =>
  statSync(s).isDirectory() ? fichiers(s) : [s],
).filter(dansLaPortee);

/**
 * « rendez-vous » est un nom commun, pas une interpellation. C'est le seul
 * mot du produit qui contient le pronom sans s'adresser à personne, et il
 * apparaît partout dans le module des consultants.
 */
const sansRendezVous = (code: string) => code.replace(/[Rr]endez-vous/gu, "réunion");

const PRONOMS = /\b(vous|votre|vos|vôtre)\b/giu;

/**
 * L'impératif en `-ez` en tête de phrase : « Saisissez le code »,
 * « Choisissez un pack ». Il vouvoie sans employer le pronom, et c'est la
 * forme que la liste de pronoms laisse passer — quatre des six
 * occurrences trouvées dans le tunnel d'authentification étaient de
 * celles-là.
 */
const IMPERATIF = /(?<![\w-])[A-ZÉÈÀÇ][a-zéèêëàâçîïôûù]{2,}ez\b/gu;

const extrait = (code: string, i: number) =>
  code.slice(Math.max(0, i - 60), i + 60).replace(/\s+/gu, " ");

describe("les surfaces candidat tutoient, toutes", () => {
  it("aucune n'emploie « vous », « votre » ni « vos »", () => {
    const fautives: string[] = [];
    for (const f of sources) {
      const code = sansRendezVous(sansCommentaires(readFileSync(f, "utf8")));
      for (const m of code.matchAll(PRONOMS)) {
        fautives.push(`${f} — …${extrait(code, m.index)}…`);
      }
    }
    expect(fautives).toEqual([]);
  });

  it("aucune n'emploie l'impératif de politesse", () => {
    const fautives: string[] = [];
    for (const f of sources) {
      const code = sansRendezVous(sansCommentaires(readFileSync(f, "utf8")));
      for (const m of code.matchAll(IMPERATIF)) {
        fautives.push(`${f} — …${extrait(code, m.index)}…`);
      }
    }
    expect(fautives).toEqual([]);
  });

  /**
   * Le garde lit bien quelque chose. Un chemin mal écrit, un dossier
   * renommé, et la liste des sources devient vide : les deux tests
   * au-dessus passeraient alors sans rien avoir regardé.
   */
  it("le garde-fou lit bien les surfaces qu'il annonce", () => {
    expect(sources.length).toBeGreaterThan(80);
    for (const surface of SURFACES) {
      expect(sources.some((f) => f.startsWith(surface.replace(/\.tsx?$/u, ""))), surface).toBe(
        true,
      );
    }
  });

  /**
   * Et il voit un texte JSX, pas seulement un littéral. C'est la leçon de
   * R.3 : le garde-fou du rail lisait les chaînes entre guillemets, et
   * une phrase écrite en clair dans un composant passait devant lui.
   */
  it("il voit une phrase écrite en clair dans un composant", () => {
    const jsx = '<p className="x">\n  Vérifiez votre dossier.\n</p>';
    expect([...sansRendezVous(sansCommentaires(jsx)).matchAll(PRONOMS)]).toHaveLength(1);
    expect([...sansRendezVous(sansCommentaires(jsx)).matchAll(IMPERATIF)]).toHaveLength(1);
  });

  /** Et il ne se déclenche pas sur un rendez-vous, qui n'interpelle personne. */
  it("« rendez-vous » n'est pas une interpellation", () => {
    const texte = "Ton rendez-vous est confirmé. Les rendez-vous se reportent.";
    expect([...sansRendezVous(texte).matchAll(PRONOMS)]).toHaveLength(0);
  });
});

/**
 * Le back-office garde sa voix, et c'est une décision — pas un oubli.
 *
 * « De préférence sans interpellation personnelle » : le tutoiement n'y
 * est pas interdit, le vouvoiement non plus. Ce qui compte est que
 * l'exception soit délibérée et lisible, et non qu'un dossier ait échappé
 * au balayage.
 */
describe("le back-office est hors de portée, exprès", () => {
  it("aucune surface du back-office n'est dans la liste", () => {
    expect(sources.filter((f) => f.startsWith("src/app/(admin)"))).toEqual([]);
    expect(sources.filter((f) => f.startsWith("src/domain/backoffice/"))).toEqual([]);
  });

  /**
   * Les exceptions restent peu nombreuses et nommées. Au-delà, ce n'est
   * plus une frontière éditoriale, c'est une liste de dérogations — la
   * règle des cinq entrées de `copy-exceptions.json`, appliquée ici.
   */
  it("les exceptions se comptent et se justifient", () => {
    expect(HORS_PORTEE.length).toBeLessThanOrEqual(6);
  });
});
