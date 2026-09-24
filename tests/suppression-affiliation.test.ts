import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AVERTISSEMENT_IRREVERSIBLE,
  CE_QUI_PART,
  CE_QUI_RESTE,
  DOMAINE_COMPTE_SUPPRIME,
  adresseAnonymisee,
  estAnonymisee,
} from "@/domain/comptes/suppression";
import {
  COMMISSION_BPS_ANNONCEE,
  ETAT_APRES,
  commissionDue,
  SILENCE,
  estProposable,
  tauxConformeALAnnonce,
  type Recevabilite,
} from "@/domain/partenaires/affiliation";
import { ETAT_INITIAL } from "@/domain/comptes/consentements";
import { COMMISSION_PARTENAIRE, tauxCommissionFormate } from "@/domain/payments/pricing";
import { GENRE_DE_LETAPE } from "@/server/lecture/partenaires";
import { EFFETS_CLOTURE } from "@/domain/dossiers/cloture";

const lire = (f: string) => readFileSync(f, "utf8");

function fichiersDe(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiersDe(p, acc);
    else if (/\.tsx?$/u.test(nom)) acc.push(p);
  }
  return acc;
}

/**
 * Suppression de compte — RG-10.4.
 *
 * Ce qui se vérifie ici, c'est la frontière : ce qui décrit une personne
 * s'en va, ce qui décrit une transaction reste. Une anonymisation qui garde
 * un identifiant réversible n'anonymise rien, et c'est l'erreur la plus
 * facile à commettre parce qu'elle est confortable.
 */
describe("RG-10.4 — anonymisation à la suppression de compte", () => {
  it("l'adresse de remplacement ne peut recevoir aucun courrier", () => {
    // `.invalid` est réservé par la RFC 2606 : le domaine ne peut être
    // délégué à personne, y compris le jour d'un envoi de masse fautif.
    expect(DOMAINE_COMPTE_SUPPRIME).toBe("comptes.invalid");
    expect(adresseAnonymisee("abc")).toBe("supprime-abc@comptes.invalid");
    expect(estAnonymisee(adresseAnonymisee("abc"))).toBe(true);
    expect(estAnonymisee("aline.dossou@email.com")).toBe(false);
  });

  it("l'adresse de remplacement ne dérive pas de l'ancienne", () => {
    // Un condensat d'email se retrouve par dictionnaire — l'espace des
    // adresses est énumérable — et ce serait une pseudonymisation déguisée
    // en anonymisation. Le module ne peut donc pas calculer d'empreinte :
    // il n'en importe aucune, et son unique entrée est un jeton fourni.
    const source = lire("src/domain/comptes/suppression.ts");
    expect(source).not.toMatch(/^import/mu);
    expect(adresseAnonymisee("un")).not.toBe(adresseAnonymisee("deux"));

    // Et le jeton vient du générateur aléatoire, pas du compte.
    const acces = lire("src/server/acces/suppression.ts");
    expect(acces).toMatch(/adresseAnonymisee\(jeton\(\d+\)\)/u);
  });

  it("l'écran dit ce qui reste avant de faire confirmer", () => {
    const composant = lire(
      "src/app/(auth)/compte/suppression/SuppressionDuCompte.tsx",
    );
    const resteAvantBouton =
      composant.indexOf("CE_QUI_RESTE") < composant.indexOf("Supprimer définitivement");
    expect(resteAvantBouton).toBe(true);
    expect(CE_QUI_RESTE.join(" ")).toMatch(/reçus de paiement/u);
  });

  it("ce qui reste à la suppression est ce que C-11 annonçait déjà", () => {
    // Découvrir à la suppression une trace dont la clôture ne parlait pas
    // serait une surprise, même légitime. Les deux écrans disent la même
    // chose sur les reçus.
    expect(EFFETS_CLOTURE.join(" ")).toMatch(/reçus de paiement/u);
    expect(AVERTISSEMENT_IRREVERSIBLE).toMatch(/définitive/u);
    expect(CE_QUI_PART.join(" ")).toMatch(/pièces/u);
  });

  it("la route de suppression redemande le mot de passe", () => {
    const route = lire("src/app/api/comptes/suppression/route.ts");
    expect(route).toMatch(/motDePasse/u);
    expect(route).toMatch(/correspond\(/u);
    // Un appareil laissé ouvert ne doit pas suffire : l'échec est un champ
    // invalide, pas un droit insuffisant, parce que le geste est légitime.
    expect(route).toMatch(/champs_invalides/u);
  });

  it("la purge emporte les copies du contenu, pas seulement le fichier", () => {
    const purge = lire("src/server/jobs/purge.ts");
    // Les champs lus dans la pièce, la trace du moteur, les valeurs qui
    // divergeaient et les réponses d'entretien sont des données
    // personnelles au même titre que le fichier (INV-5).
    expect(purge).toMatch(/documentAnalysis\.updateMany/u);
    expect(purge).toMatch(/fields: Prisma\.DbNull/u);
    expect(purge).toMatch(/engineLog: null/u);
    expect(purge).toMatch(/critiqueFinding\.updateMany/u);
    expect(purge).toMatch(/interviewAnswer\.deleteMany/u);
  });

  it("la purge d'un brouillon ne bute pas sur INV-3", () => {
    /*
      La suppression de compte purge aussi les brouillons, ce que la
      clôture ne faisait jamais. Un brouillon sans version de règle figée
      ne peut pas passer en ARCHIVE — la base le refuse, et elle a raison.
      Trouvé en purgeant un vrai compte, pas en relisant le code.

      L'assertion visait le texte exact de l'expression, et elle est
      devenue fausse le jour où l'état est passé par `miseEnEtat` — sans
      que la garantie, elle, change. Elle ne retient donc plus que les
      deux choses qui la portent : la condition sur la version figée, et
      le fait que l'état ne s'écrive pas sans sa date. Le comportement,
      lui, s'éprouve sur une vraie base dans `fumee-transitions`.
    */
    const purge = lire("src/server/jobs/purge.ts");
    expect(purge).toMatch(/dossier\.visaRuleId/u);
    // L'état d'arrivée passe par `etatApresPurge` depuis l'arbitrage S.78 :
    // la suppression de compte archive, un dossier soumis garde son état.
    expect(purge).toMatch(/miseEnEtat\(\s*etatApresPurge\(dossier\.status, userId !== undefined\)/u);
    expect(purge).not.toMatch(/status: "ARCHIVE"/u);
  });

  it("l'anonymisation ne supprime ni les reçus ni le grand livre", () => {
    const acces = lire("src/server/acces/suppression.ts");
    expect(acces).not.toMatch(/transaction\.delete/u);
    expect(acces).not.toMatch(/aiUsage\.delete/u);
    expect(acces).not.toMatch(/analysisCredit\.delete/u);
    // Et elle ne supprime pas la ligne elle-même : un reçu pointe dessus.
    expect(acces).not.toMatch(/db\.user\.delete/u);
  });

  it("l'anonymisation n'a lieu qu'une fois les pièces vraiment parties", () => {
    const acces = lire("src/server/acces/suppression.ts");
    const avantPurge = acces.indexOf("purgerSurDemande");
    const avantAnonymisation = acces.indexOf("adresseAnonymisee(jeton");
    expect(avantPurge).toBeGreaterThan(0);
    expect(avantPurge).toBeLessThan(avantAnonymisation);
    // Un reste non purgé laisse le compte en « suppression demandée ».
    expect(acces).toMatch(/anonymise: false/u);
  });
});

/**
 * Affiliation — WF-13.
 *
 * Les trois façons dont une affiliation dérape : hors contexte, non
 * déclarée, activée partout. Chacune a son test.
 */
describe("WF-13 — proposition de partenaire", () => {
  const tout: Recevabilite = {
    activeSurLaDestination: true,
    autorise: true,
    sansRefusDefinitif: true,
    tauxConforme: true,
  };

  it("rien n'est proposable par défaut (RG-13.4)", () => {
    for (const cle of Object.keys(tout) as (keyof Recevabilite)[]) {
      expect(estProposable({ ...tout, [cle]: false }), cle).toBe(false);
    }
    expect(estProposable(tout)).toBe(true);
  });

  it("le taux annoncé à l'écran est le taux du partenaire (RG-13.3)", () => {
    expect(COMMISSION_BPS_ANNONCEE).toBe(Math.round(COMMISSION_PARTENAIRE * 10_000));
    expect(tauxConformeALAnnonce(COMMISSION_BPS_ANNONCEE)).toBe(true);
    expect(tauxConformeALAnnonce(COMMISSION_BPS_ANNONCEE + 1)).toBe(false);

    // Et la phrase de l'écran porte bien ce nombre : c'est une phrase
    // littérale, déclarée en dérogation du garde-fou du vocabulaire, donc
    // rien d'autre qu'un test ne la rattache à la grille.
    const composant = lire("src/app/(app)/(dossier)/services/Services.tsx");
    const sansEspaceInsecable = (t: string) => t.replace(/ | /gu, " ");
    expect(sansEspaceInsecable(composant)).toContain(
      `commission de ${sansEspaceInsecable(tauxCommissionFormate())} sur cette prestation`,
    );
  });

  it("un partenaire hors du taux annoncé n'est pas proposé", () => {
    const lecture = lire("src/server/lecture/partenaires.ts");
    expect(lecture).toMatch(/tauxConformeALAnnonce\(partenaire\.commissionBps\)/u);
  });

  it("la proposition se rattache à une étape du référentiel (RG-13.1)", () => {
    // Les quatre genres de WF-13 se retrouvent un à un dans les codes de
    // checklist. Une destination qui n'exige pas d'assurance n'a pas
    // l'étape, et la question ne se pose jamais.
    expect(GENRE_DE_LETAPE).toMatchObject({
      assurance_maladie: "ASSURANCE_SANTE",
      logement: "LOGEMENT",
      diplome: "EQUIVALENCE_DIPLOME",
      preuve_fonds: "TRANSFERT_FONDS",
    });
  });

  it("les trois issues de T-03 ne se confondent pas", () => {
    expect(ETAT_APRES.CRENEAUX).toBe("REDIRIGEE");
    expect(ETAT_APRES.CONTINUER_SEUL).toBe("SANS_SUITE");
    expect(ETAT_APRES.NE_PLUS_PROPOSER).toBe("DECLINEE");
  });

  /**
   * L'écran disait un geste, et il le disait à ceux qui ne l'avaient pas
   * fait.
   *
   * « Tu as coupé les offres de partenaire » est vrai d'un candidat qui a
   * coupé. Il est faux de tous les autres — c'est-à-dire, au premier
   * passage, de tout le monde : `ETAT_INITIAL` met chaque autorisation à
   * faux (RG-02.1), et rien n'accorde celle-ci à l'inscription. La phrase
   * s'adressait donc d'abord à ceux qu'elle décrivait le moins bien, et les
   * renvoyait « rétablir » un accord qui n'avait jamais existé.
   */
  it("aucune autorisation n'est active au premier passage", () => {
    expect(ETAT_INITIAL.partenaires).toBe(false);
  });

  it("l'écran n'impute un geste qu'à qui l'a fait", () => {
    expect(SILENCE.retiree.titre).toContain("coupé");
    // Le texte du compte neuf ne peut ni reprocher un geste, ni supposer un
    // accord passé : « rétablir » présuppose exactement ce qui manque.
    expect(SILENCE.jamais_donnee.titre).not.toMatch(/coupé|retiré/u);
    expect(SILENCE.jamais_donnee.explication).not.toMatch(/rétabli|de nouveau|à nouveau/u);
    expect(SILENCE.jamais_donnee.titre).toContain("pas encore autorisé");
  });

  it("les deux situations ne se lisent pas de la même façon", () => {
    const champs = ["titre", "explication", "lien"] as const;
    for (const champ of champs) {
      expect(SILENCE.jamais_donnee[champ], champ).not.toBe(SILENCE.retiree[champ]);
      // Ni l'un ni l'autre ne laisse la personne sans suite à donner.
      expect(SILENCE.jamais_donnee[champ].length).toBeGreaterThan(10);
      expect(SILENCE.retiree[champ].length).toBeGreaterThan(10);
    }
  });

  /**
   * Une implémentation, pas deux. L'écran choisit la carte, il n'en écrit
   * pas le texte — sans quoi la distinction se referait à la main au
   * prochain écran qui lit la même autorisation.
   */
  it("l'écran prend ses phrases dans le domaine", () => {
    const composant = lire("src/app/(app)/(dossier)/services/Services.tsx");
    expect(composant).toContain("SILENCE[autorisation]");
    expect(composant).not.toContain("Tu as coupé");
    const lecture = lire("src/server/lecture/partenaires.ts");
    expect(lecture).toMatch(/etatDeLAutorisation\(userId, "partenaires"\)/u);
    // Et la lecture du registre reste unique : la version booléenne s'en
    // déduit, elle ne réinterroge pas la table pour son compte.
    const acces = lire("src/server/acces/consentements.ts");
    expect(acces).toMatch(/autorisationAccordee[\s\S]{0,220}etatDeLAutorisation\(/u);
    expect(acces.match(/db\.consent\.findFirst/gu)).toHaveLength(1);
  });

  it("« ne plus me proposer » survit au rechargement", () => {
    // La promesse « tu peux revenir sur ce choix depuis ton profil » ne
    // vaut que si le refus est écrit là où le profil le lit : dans
    // l'autorisation, pas dans l'état d'un composant.
    const acces = lire("src/server/acces/partenaires.ts");
    expect(acces).toMatch(/NE_PLUS_PROPOSER[\s\S]{0,200}partenaires/u);
    // La lecture interroge le registre par le même code. Elle en lit
    // désormais l'état plutôt que le seul verdict, ce qui ne change rien à
    // ce que ce test garde : le refus vaut parce qu'il est écrit là.
    const lecture = lire("src/server/lecture/partenaires.ts");
    expect(lecture).toMatch(/etatDeLAutorisation\(userId, "partenaires"\)/u);
  });

  it("la commission se calcule au résultat, arrondie en faveur du partenaire", () => {
    expect(commissionDue(20_000, 1500)).toBe(3000);
    // 1 999 × 15 % = 299,85 : l'arrondi inférieur fait perdre le franc à la
    // plateforme, jamais au partenaire.
    expect(commissionDue(1999, 1500)).toBe(299);
    expect(commissionDue(0, 1500)).toBe(0);
  });

  it("aucune offre commerciale dans l'espace dossier (RG-13.2, K.A)", () => {
    // « Aucune proposition commerciale dans l'espace dossier lui-même ni
    // pendant un parcours de paiement. » Plutôt que d'énumérer les écrans
    // à protéger — la liste vieillirait — on énumère les monteurs de
    // l'offre : il n'y en a qu'un, et il est sur la surface dédiée.
    const monteurs = fichiersDe("src/app").filter(
      (f) => !f.endsWith("services/Services.tsx") && lire(f).includes("<OffrePartenaire"),
    );
    expect(monteurs.map((f) => f.replace(/\\/gu, "/"))).toEqual([]);

    // Et la checklist, nommément : c'est d'elle que la décision les retire.
    const checklist = lire("src/app/(app)/(dossier)/dossiers/[id]/Checklist.tsx");
    expect(checklist).not.toMatch(/commission|tarif|partenaire\b/iu);
  });
});
