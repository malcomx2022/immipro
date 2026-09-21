import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACTEUR_NON_RESOLU,
  COMPTE_SUPPRIME,
  acteurLisible,
  compteDeLActeur,
  nomAffichable,
  origineDe,
  type IdentiteDUnCompte,
} from "@/domain/backoffice/acteur";
import { sansCommentaires } from "@/domain/copy/source";

const lire = (f: string) => readFileSync(f, "utf8");

/**
 * L'identité de l'acteur au journal d'audit — arbitrage du 21/09/2026,
 * constat 4.
 *
 * B-06 affichait `7f3c1a02-…` dans une colonne intitulée « Acteur ». Un
 * identifiant n'est pas un nom, et une colonne qui promet une personne
 * doit en nommer une. La décision porte sur la présentation : la donnée
 * garde l'identifiant durable, qui est le seul moyen de ne pas confondre
 * deux opérateurs portant le même nom.
 */

const UUID = "7f3c1a02-9b4d-4e18-8c57-1d0a6f2e3b44";

const compte = (p: Partial<IdentiteDUnCompte> = {}): IdentiteDUnCompte => ({
  prenom: "Awa",
  nom: "Diallo",
  email: "awa.diallo@immipro.test",
  supprime: false,
  ...p,
});

describe("l'acteur se nomme, et l'identifiant reste", () => {
  it("un compte résolu se lit par son nom", () => {
    const a = acteurLisible(UUID, compte());
    expect(a.genre).toBe("PERSONNE");
    expect(a.libelle).toBe("Awa Diallo");
    expect(a.identifiant).toBe(UUID);
  });

  /** L'inscription n'exige ni prénom ni nom : l'adresse identifie aussi. */
  it("sans nom, l'adresse professionnelle prend le relais", () => {
    expect(nomAffichable(compte({ prenom: null, nom: null }))).toBe("awa.diallo@immipro.test");
    // Un prénom seul suffit, et ne traîne pas l'espace du nom absent.
    expect(nomAffichable(compte({ nom: null }))).toBe("Awa");
    expect(nomAffichable(compte({ prenom: "  ", nom: "  " }))).toBe("awa.diallo@immipro.test");
  });

  /**
   * Deux échecs, deux phrases. Les confondre dirait qu'on a perdu une
   * trace là où le compte a simplement été effacé à la demande — et
   * l'inverse, qu'un compte existe encore là où il est parti.
   */
  it("un compte supprimé et une résolution manquée ne disent pas la même chose", () => {
    const parti = acteurLisible(UUID, compte({ supprime: true }));
    expect(parti.genre).toBe("COMPTE_SUPPRIME");
    expect(parti.libelle).toBe(COMPTE_SUPPRIME);

    const introuvable = acteurLisible(UUID, null);
    expect(introuvable.genre).toBe("NON_RESOLU");
    expect(introuvable.libelle).toBe(ACTEUR_NON_RESOLU);

    expect(parti.libelle).not.toBe(introuvable.libelle);
  });

  /**
   * Le point de la décision : l'identifiant durable reste, quel que soit
   * le repli. C'est lui qui rattache la trace à quelqu'un quand le nom a
   * disparu — sans lui, « Compte supprimé » sur six lignes ne dirait pas
   * s'il s'agit du même compte.
   */
  it("l'identifiant durable survit à tous les replis", () => {
    for (const identite of [compte(), compte({ supprime: true }), null]) {
      expect(acteurLisible(UUID, identite).identifiant).toBe(UUID);
    }
  });

  /**
   * Un compte supprimé porte encore une adresse — anonymisée (RG-10.4),
   * mais présente. Le repli ne doit pas l'afficher : `supprime-x7k2@…`
   * nomme moins que « Compte supprimé », et ressemble à une vraie
   * adresse.
   */
  it("l'adresse anonymisée d'un compte parti ne s'affiche jamais", () => {
    const a = acteurLisible(UUID, compte({ email: "supprime-x7k2@comptes.immipro" }));
    expect(a.libelle).toBe("Awa Diallo");
    const parti = acteurLisible(
      UUID,
      compte({ prenom: null, nom: null, email: "supprime-x7k2@comptes.immipro", supprime: true }),
    );
    expect(parti.libelle).toBe(COMPTE_SUPPRIME);
    expect(parti.libelle).not.toContain("supprime-");
  });
});

describe("ce qui n'est pas une personne ne se présente pas comme telle", () => {
  /**
   * Une tâche planifiée et une notification de fournisseur ne sont
   * personne. Leur identifiant **est** leur nom — il décrit le traitement
   * qui s'est exécuté — et le rendre autrement inventerait un
   * vocabulaire que rien n'a fixé.
   */
  it("un processus garde son nom, et n'est pas déclaré non résolu", () => {
    for (const id of ["systeme:purge", "systeme:suppression", "webhook:MOBILE_MONEY"]) {
      const a = acteurLisible(id, null);
      expect(a.genre, id).toBe("PROCESSUS");
      expect(a.libelle, id).toBe(id);
      expect(a.libelle, id).not.toBe(ACTEUR_NON_RESOLU);
    }
  });

  it("aucun compte n'est cherché pour un processus", () => {
    expect(compteDeLActeur("systeme:purge")).toBeNull();
    expect(compteDeLActeur("webhook:CARTE")).toBeNull();
  });

  /**
   * `candidat:<id>` désigne un compte, et c'est la forme qui s'oublie :
   * le journal affichait `candidat:7f3c1a02-…`, un préfixe collé à une
   * clé primaire en guise de nom.
   */
  it("un candidat agissant chez lui est un compte comme un autre", () => {
    expect(compteDeLActeur(`candidat:${UUID}`)).toBe(UUID);
    expect(acteurLisible(`candidat:${UUID}`, compte()).libelle).toBe("Awa Diallo");
    // Et l'identifiant conservé reste celui de la table, préfixe compris.
    expect(acteurLisible(`candidat:${UUID}`, compte()).identifiant).toBe(`candidat:${UUID}`);
  });

  /**
   * L'origine se déduit du même préfixe. `candidat:` retombait sur le cas
   * par défaut : une suppression demandée par un candidat depuis son
   * espace s'affichait comme une action d'administrateur, ce qu'un
   * contrôle lirait de travers.
   */
  it("l'origine dit d'où l'action vient, candidat compris", () => {
    expect(origineDe("systeme:purge")).toBe("tâche planifiée");
    expect(origineDe("webhook:CARTE")).toBe("webhook");
    expect(origineDe(`candidat:${UUID}`)).toBe("espace candidat");
    expect(origineDe(UUID)).toBe("back-office");
    expect(origineDe(`candidat:${UUID}`)).not.toBe("back-office");
  });
});

/**
 * Et la donnée ne change pas.
 *
 * « Il ne faut pas remplacer l'identifiant durable dans la table
 * d'audit » : c'est lui qui garantit que deux acteurs portant le même nom
 * ne seront pas confondus. La décision porte uniquement sur sa
 * présentation, et ce garde-fou empêche qu'elle glisse jusqu'à l'écriture.
 */
describe("la table d'audit garde l'identifiant, pas le libellé", () => {
  it("rien n'écrit un nom ni une adresse dans actorId", () => {
    const journal = lire("src/server/acces/journal.ts");
    expect(journal).toMatch(/actorId: ecriture\.acteurId/u);
    expect(sansCommentaires(journal)).not.toMatch(/acteurLisible|nomAffichable|libelle/u);
  });

  /**
   * La résolution vit dans la lecture, et nulle part ailleurs. Une
   * identité résolue au moment de l'écriture serait figée : l'adresse
   * d'il y a six mois, le nom d'avant un mariage, et rien pour savoir
   * que c'est la même personne.
   */
  it("l'identité se résout à la lecture, jamais à l'écriture", () => {
    const lecture = lire("src/server/lecture/backoffice.ts");
    expect(lecture).toMatch(/acteur: acteurLisible\(l\.actorId/u);
    expect(lecture).toMatch(/deletedAt: true/u);
    /**
     * Une seule requête d'identités, quel que soit le nombre de lignes :
     * le même opérateur signe la plupart des écritures d'une journée, et
     * résoudre ligne par ligne ferait deux cents lectures pour trois
     * personnes.
     *
     * Le critère portait sur le corps de `journal()`. S.7 a déplacé ce
     * corps dans `lireLeJournal`, partagé avec l'export de période — et
     * le garde-fou est passé au vert en trouvant une fonction devenue
     * vide. Il porte maintenant sur la lecture entière : c'est la
     * propriété qui compte, et elle ne dépend pas de la fonction qui
     * l'héberge. La même leçon que sur les boutons muets, sur une autre
     * forme.
     */
    const lecteur = /async function lireLeJournal[\s\S]*?\n\}/mu.exec(lecture)![0];
    expect([...lecteur.matchAll(/db\.user\.findMany/gu)]).toHaveLength(1);

    /**
     * Et les deux entrées passent par ce lecteur, sans requête à elles :
     * un second chemin de lecture serait le premier endroit où résoudre
     * une identité ligne par ligne reviendrait sans se voir.
     */
    const declaration = (nom: string): string => {
      // Du nom jusqu'à la déclaration suivante : un `}` en colonne zéro ne
      // marque pas la fin d'une fonction dont la signature s'étale sur
      // plusieurs lignes — `}): Promise<…> {` en porte un.
      const debut = lecture.indexOf(`function ${nom}(`);
      const suite = lecture.indexOf("\nexport ", debut);
      const fin = lecture.indexOf("\nasync function", debut);
      const bornes = [suite, fin].filter((i) => i > debut);
      return lecture.slice(debut, Math.min(...bornes, lecture.length));
    };

    for (const entree of ["journalDeLaPeriode", "journal"]) {
      const corps = declaration(entree);
      expect(corps, entree).toContain("lireLeJournal(");
      expect(corps, entree).not.toContain("db.user.findMany");
    }
  });

  /**
   * L'écran ne reconstruit pas non plus une identité de son côté : il
   * affiche ce que la lecture a résolu. La leçon de N.C — une règle sans
   * domicile finit recopiée, et les copies divergent.
   */
  it("l'écran affiche les deux, et n'en fabrique aucun", () => {
    const ecran = sansCommentaires(lire("src/app/(admin)/journal/Journal.tsx"));
    expect(ecran).toContain("e.acteur.libelle");
    expect(ecran).toContain("e.acteur.identifiant");
    expect(ecran).not.toMatch(/Compte supprimé|Acteur non résolu/u);
    // Et il ne répète pas l'identifiant quand il est déjà le libellé :
    // une tâche planifiée s'affichait « systeme:purge » deux fois, l'une
    // sous l'autre. Vu à l'écran, et invisible en test.
    expect(ecran).toMatch(/e\.acteur\.identifiant === e\.acteur\.libelle \? null :/u);
  });
});
