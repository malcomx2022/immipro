import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  libelleAvancementEntretien,
  reponseAConserver,
} from "@/domain/redaction/entretien";
import { sansCommentaires } from "@/domain/copy/source";

const lire = (f: string) => readFileSync(f, "utf8");

/**
 * R-02 — les réponses de l'entretien sont conservées, comme promis.
 *
 * L'écran le disait depuis le début, sous le champ de saisie : « Tes
 * réponses sont conservées à mesure : tu peux interrompre l'entretien et
 * le reprendre. » Elles ne l'étaient pas. L'état partait de `{}` à chaque
 * chargement, rien ne quittait le navigateur, et `InterviewAnswer`
 * n'était écrite nulle part — seule la purge la connaissait, pour
 * l'effacer.
 *
 * Un candidat qui répondait à huit questions puis fermait l'onglet
 * perdait tout, après avoir lu qu'il pouvait s'interrompre. C'est la même
 * faute qu'en B-02 et B-05, mais dite au candidat et payée par lui.
 */

const ROUTE = "src/app/api/dossiers/[id]/redaction/[type]/route.ts";
const ECRAN = "src/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/Redaction.tsx";
const PAGE = "src/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/page.tsx";

describe("une réponse vide n'est pas une réponse", () => {
  it("le texte utile est conservé, tel quel", () => {
    expect(reponseAConserver("  J'ai choisi ce programme  ")).toBe("J'ai choisi ce programme");
  });

  /**
   * La symétrie de la lecture, comme pour la réserve d'une règle en B-02 :
   * ce que la lecture rend, l'écriture le reprend. Faire survivre une
   * réponse que le candidat vient d'effacer serait le contraire de ce
   * qu'il a demandé.
   */
  it("un champ vidé ne conserve rien", () => {
    for (const vide of ["", "   ", "\n\t "]) {
      expect(reponseAConserver(vide), JSON.stringify(vide)).toBeNull();
    }
  });
});

describe("la route n'écrit que la réponse, et résout le reste", () => {
  const route = lire(ROUTE);

  /**
   * L'intitulé et la section décrivent la question posée, pas la réponse
   * donnée. Les laisser voyager permettrait d'enregistrer une réponse
   * sous une question qui n'a jamais été posée — c'est la règle de B-02,
   * appliquée à un formulaire candidat.
   */
  it("le client n'envoie que le rang et le texte", () => {
    const schema = route.slice(route.indexOf("corps: z.object"), route.indexOf("async traiter"));
    expect(schema).toContain("rang:");
    expect(schema).toContain("reponse:");
    expect(schema).not.toMatch(/section|question:|documentId/u);
    // Et la route va chercher la question dans le référentiel.
    expect(route).toContain("piece.questions[corps.rang]");
    expect(route).toMatch(/section: question\.section/u);
    expect(route).toMatch(/question: question\.intitule/u);
  });

  /**
   * La garde d'accès vit dans `pieceARediger`, qui filtre déjà sur
   * `application.userId` et sur le remède « rédiger ». L'écrire une
   * seconde fois ici en ferait deux copies, et deux copies d'une règle
   * d'accès finissent par diverger.
   */
  it("l'accès passe par la lecture, qui le porte déjà", () => {
    expect(route).toContain("pieceARediger(params.id!, params.type!, acteur!.id)");
    expect(sansCommentaires(route)).not.toMatch(/userId|application: \{/u);
  });

  /** Un rang hors de l'entretien ne crée pas de ligne orpheline. */
  it("une question qui n'existe pas est refusée", () => {
    expect(route).toMatch(/if \(!question\) \{[\s\S]{0,200}echec\("introuvable"/u);
  });

  /**
   * `deleteMany` et non `delete` : effacer un champ jamais rempli est un
   * geste ordinaire, pas une erreur, et n'a rien à faire échouer.
   */
  it("vider une réponse la retire, sans échouer si elle n'existait pas", () => {
    expect(route).toContain("db.interviewAnswer.deleteMany");
    expect(route).not.toContain("db.interviewAnswer.delete(");
  });

  /**
   * `lecture`, et non `sensible`. Le régime `sensible` couvre « ce qui
   * coûte de l'argent ou du quota, et ce qui devine un secret » : une
   * réponse d'entretien ne fait ni l'un ni l'autre. Et dix appels par
   * minute couperaient un entretien de huit questions en plein milieu.
   */
  it("le régime de limite laisse l'entretien se dérouler", () => {
    expect(route).toMatch(/limite: "lecture"/u);
  });
});

describe("l'écran enregistre à mesure, et reprend où il s'est arrêté", () => {
  const ecran = lire(ECRAN);

  it("l'entretien part des réponses déjà en base", () => {
    expect(lire(PAGE)).toContain("reponsesEnregistrees={await reponsesDeLEntretien(");
    expect(ecran).toContain("useState<Reponses>(reponsesEnregistrees)");
    // L'ancien état partait de `{}` : c'est exactement ce qui perdait tout.
    expect(ecran).not.toContain("useState<Reponses>({})");
  });

  /**
   * « À mesure » veut dire à chaque question quittée, pas à chaque
   * frappe : une écriture par caractère saturerait le réseau d'un
   * téléphone lent, qui est le cas ordinaire de ce produit.
   */
  it("les quatre sorties de question enregistrent avant de bouger", () => {
    const entretien = ecran.slice(
      ecran.indexOf('if (vue === "ENTRETIEN")'),
      ecran.indexOf('if (vue === "ENTRETIEN")') + 6000,
    );
    expect([...entretien.matchAll(/conserverPuis\(/gu)].length).toBeGreaterThanOrEqual(3);
    // Et la saisie elle-même n'écrit pas : elle ne fait que l'état.
    expect(ecran).toMatch(/onChange=\{\(e\) =>\s*setReponses/u);
    const onChange = ecran.slice(ecran.indexOf("onChange={(e) =>"), ecran.indexOf("onChange={(e) =>") + 160);
    expect(onChange).not.toContain("appeler(");
  });

  /**
   * Revenir sur une question pour la relire, sans y toucher, n'écrit
   * rien : c'est ce qui distingue une navigation d'une modification. Et
   * huit allers-retours dans l'entretien ne doivent pas produire huit
   * écritures identiques.
   */
  it("une réponse inchangée ne se réenregistre pas", () => {
    const fonction = /function conserverPuis[\s\S]*?\n {2}\}/u.exec(ecran)![0];
    expect(fonction).toMatch(/reponseAConserver\(texte\) ===\s*reponseAConserver\(/u);
    expect(fonction).toMatch(/return;/u);
  });

  /**
   * La navigation n'attend pas le réseau : sur un téléphone lent,
   * bloquer « Question suivante » le temps d'un aller-retour ferait
   * cliquer deux fois. L'écran avance, l'écriture suit.
   */
  it("la navigation n'attend pas la réponse du serveur", () => {
    const fonction = /function conserverPuis[\s\S]*?\n {2}\}/u.exec(ecran)![0];
    expect(fonction.indexOf("suite()")).toBeLessThan(fonction.indexOf("appeler("));
    expect(fonction).not.toMatch(/await appeler/u);
  });

  /**
   * Et un refus ne se perd pas. Ce que le serveur n'a pas gardé, la
   * référence l'oublie aussi, pour que la prochaine sortie de question
   * réessaie — sinon l'écran croirait avoir enregistré ce qui a échoué.
   */
  it("un refus s'affiche et laisse la réponse à réenregistrer", () => {
    const fonction = /function conserverPuis[\s\S]*?\n {2}\}/u.exec(ecran)![0];
    expect(fonction).toContain("setEchec(resultat.echec)");
    expect(fonction).toMatch(/conservees\.current = reste/u);
    expect(ecran).toContain("<BlocEchec echec={echec} annonce />");
  });

  /**
   * Le compteur s'accorde. « 1 réponses sur 8 » se voyait rarement tant
   * qu'il partait de zéro à chaque chargement — il fallait répondre à
   * exactement une question pour le lire. Depuis que l'entretien
   * reprend, il s'affiche dès l'ouverture.
   */
  it("le compteur d'avancement s'accorde", () => {
    expect(libelleAvancementEntretien({}, 8)).toBe("0 réponse sur 8");
    expect(libelleAvancementEntretien({ 0: "une" }, 8)).toBe("1 réponse sur 8");
    expect(libelleAvancementEntretien({ 0: "une", 1: "deux" }, 8)).toBe("2 réponses sur 8");
  });

  /** La phrase qui promet la conservation est toujours là, et vraie. */
  it("la promesse faite au candidat est tenue", () => {
    expect(ecran).toContain("Tes réponses sont conservées à mesure");
    expect(ecran).toContain("appeler(");
  });
});
