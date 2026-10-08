import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sansCommentaires } from "@/domain/copy/source";
import {
  ESSAIS_AVANT_BLOCAGE,
  aBloquer,
  finDuBlocage,
  libelleEchec,
  verdictDeConnexion,
} from "@/domain/comptes/connexion";
import {
  OUBLI_HEURES,
  lireEchecsSansCompte,
  noterEchecSansCompte,
  reinitialiserEchecsSansCompte,
} from "@/server/acces/echecs-sans-compte";
import {
  concordent,
  forceMotDePasse,
  libelleConcordance,
  libelleForce,
  LONGUEUR_MINIMALE,
  motDePasseRecevable,
} from "@/domain/comptes/mot-de-passe";
import {
  codeComplet,
  libelleAvancementCode,
  LONGUEUR_CODE,
  normaliserCode,
} from "@/domain/comptes/code-verification";
import {
  APPLIQUE_PAR,
  CODES_CONSENTEMENT,
  CONSENTEMENTS,
  CONSENTEMENT_SENSIBLE,
  consentementsActifs,
  ETAT_INITIAL,
  libelleActifs,
} from "@/domain/comptes/consentements";

describe("mot de passe — WF-02", () => {
  it("gradue la force sur la longueur, sans juger le contenu", () => {
    expect(forceMotDePasse("")).toBe(0);
    expect(forceMotDePasse("court")).toBe(1);
    expect(forceMotDePasse("dix-carac")).toBe(2);
    expect(forceMotDePasse("douze-caracteres")).toBe(3);
  });

  it("dit quoi faire, jamais « mot de passe faible » seul", () => {
    expect(libelleForce("")).toContain("Au moins dix caractères");
    expect(libelleForce("abc")).toContain("il manque des caractères");
    expect(libelleForce("douze-caracteres")).toBe("Solide.");
  });

  it("n'accepte pas un mot de passe sous la longueur minimale", () => {
    expect(motDePasseRecevable("a".repeat(LONGUEUR_MINIMALE - 1))).toBe(false);
    expect(motDePasseRecevable("a".repeat(LONGUEUR_MINIMALE))).toBe(true);
  });

  it("constate la concordance des deux saisies", () => {
    expect(libelleConcordance("secret1234", "")).toContain("Répète exactement");
    expect(libelleConcordance("secret1234", "secret1234")).toContain("correspondent");
    expect(libelleConcordance("secret1234", "secret12")).toContain("diffèrent");
    expect(concordent("secret1234", "secret1234")).toBe(true);
    expect(concordent("secret1234", "")).toBe(false);
  });
});

describe("code de vérification — A-03", () => {
  it("ne garde que les chiffres, et jamais plus que six", () => {
    expect(normaliserCode("12 34-56")).toBe("123456");
    expect(normaliserCode("1234567890")).toBe("123456");
    expect(normaliserCode("abc")).toBe("");
  });

  it("ne se déclare complet qu'à six chiffres", () => {
    expect(codeComplet("12345")).toBe(false);
    expect(codeComplet("12 34 56")).toBe(true);
  });

  it("accorde l'avancement et rappelle l'échéance jusqu'au bout", () => {
    expect(libelleAvancementCode("1")).toBe(
      `1 chiffre sur ${LONGUEUR_CODE} · le code expire dans 10 minutes`,
    );
    expect(libelleAvancementCode("123")).toContain("3 chiffres sur 6");
    expect(libelleAvancementCode("123456")).toBe("Code complet.");
  });
});

describe("consentements — RG-02.1", () => {
  it("n'active aucune autorisation au premier passage", () => {
    expect(Object.values(ETAT_INITIAL).every((v) => v === false)).toBe(true);
    expect(consentementsActifs(ETAT_INITIAL)).toBe(0);
  });

  it("isole le consentement aux pièces d'identité des autres", () => {
    const sensibles = CONSENTEMENTS.filter((c) => c.sensible);
    expect(sensibles).toHaveLength(1);
    expect(CONSENTEMENT_SENSIBLE?.code).toBe("pieces_identite");
  });

  it("dit la conséquence du refus là où elle existe, sans la présenter en sanction", () => {
    /*
      La phrase promettait « tu téléverses tes pièces sans analyse
      automatique », c'est-à-dire un parcours qui n'existe pas : RG-02.2
      refuse le dépôt lui-même tant que l'autorisation manque. Le candidat
      lisait l'inverse de ce qui allait se passer, au moment précis où il
      décidait.

      Ce que la phrase doit dire désormais : ce que le refus empêche, et ce
      que le retrait arrête — puisqu'il arrête quelque chose.
    */
    expect(CONSENTEMENT_SENSIBLE?.siRefuse).not.toContain("sans analyse automatique");
    expect(CONSENTEMENT_SENSIBLE?.siRefuse).toMatch(/aucune pièce ne peut être déposée/u);
    expect(CONSENTEMENT_SENSIBLE?.siRefuse).toMatch(/retirer à tout moment/u);
    expect(CONSENTEMENT_SENSIBLE?.siRefuse).toMatch(/déjà déposées/u);

    // Le refus reste une décision, pas une faute.
    for (const c of CONSENTEMENTS) {
      expect(c.siRefuse ?? "").not.toMatch(/oblig|bloqu|interdit/i);
    }
  });

  /**
   * ── La garde qui manquait ─────────────────────────────────────────
   *
   * Les essais ci-dessus lisent les textes, l'état initial et le décompte.
   * Aucun ne demandait si un interrupteur **commande** quelque chose, et
   * trois sur cinq ne commandaient rien : « Alertes de changement de
   * règles » du nombre, dont l'email partait pour qui l'avait refusé.
   *
   * La garde porte sur la forme : chaque autorisation déclare ce qui
   * l'applique, et chaque fichier cité lit bien le registre. Un `null` est
   * une décision écrite, visible dans la diff ; un nom inventé ne passe
   * pas.
   */
  it("chaque autorisation déclare ce qui l'applique, et le fichier cité la lit", () => {
    expect(Object.keys(APPLIQUE_PAR).sort()).toEqual([...CODES_CONSENTEMENT].sort());

    for (const [code, fichiers] of Object.entries(APPLIQUE_PAR)) {
      if (fichiers === null) continue;
      expect(fichiers.length, `« ${code} » déclare une liste vide`).toBeGreaterThan(0);
      for (const chemin of fichiers) {
        const source = sansCommentaires(readFileSync(chemin, "utf8"));
        expect(source, `${chemin} ne lit pas le registre des autorisations`).toMatch(
          /autorisationAccordee|etatDeLAutorisation/u,
        );
        expect(source, `${chemin} ne cite pas « ${code} »`).toContain(`"${code}"`);
      }
    }
  });

  /**
   * Et la liste affichée est celle que la route accepte : elle était
   * recopiée à la main dans un `z.enum`, si bien qu'une sixième
   * autorisation aurait été rendue à l'écran et refusée à
   * l'enregistrement.
   */
  it("la route accepte exactement les codes affichés", () => {
    const contrat = readFileSync("src/app/api/comptes/consentements/route.ts", "utf8");
    expect(sansCommentaires(contrat)).toContain("z.enum(CODES_CONSENTEMENT)");
    expect(CODES_CONSENTEMENT).toEqual(CONSENTEMENTS.map((c) => c.code));
  });

  it("accorde le décompte des autorisations actives", () => {
    expect(libelleActifs(ETAT_INITIAL)).toBe("0 autorisation sur 5 active");
    expect(libelleActifs({ ...ETAT_INITIAL, alertes_regles: true })).toBe(
      "1 autorisation sur 5 active",
    );
    expect(
      libelleActifs({ ...ETAT_INITIAL, alertes_regles: true, mesure_audience: true }),
    ).toBe("2 autorisations sur 5 actives");
  });

  it("garde l'état initial hors d'atteinte des écrans", () => {
    const copie = { ...ETAT_INITIAL };
    copie.alertes_regles = true;
    expect(ETAT_INITIAL.alertes_regles).toBe(false);
  });
});

/**
 * Le temps de réponse disait ce que le message tait — A-02, WF-02.
 *
 * `domain/comptes/connexion` pose la règle : « le serveur doit rendre le
 * même message dans les deux cas, **et mettre le même temps à le
 * rendre** ». `connecter` la tient pour l'adresse inconnue — elle compare
 * le mot de passe à un leurre —, et **le compte bloqué sortait avant
 * l'empreinte**. Mesuré, médiane de cinq appels avec un mauvais mot de
 * passe :
 *
 *     adresse inconnue        196 ms
 *     adresse connue          241 ms
 *     adresse connue, bloquée   1 ms
 *
 * Deux cents fois plus vite, et c'est un oracle que l'attaquant déclenche
 * lui-même : cinq essais faux sur n'importe quelle adresse, puis un
 * sixième. S'il revient en une milliseconde, l'adresse existe — une
 * adresse sans compte ne se bloque jamais. La liste de clients que le
 * message refuse de dire, le chronomètre la dictait.
 *
 * Après correction : 200 / 200 / 212 ms.
 *
 * Le garde-fou est **structurel** et non chronométré : une assertion sur
 * des millisecondes serait fragile sous charge, et ce qui compte est la
 * position de l'appel — avant toute branche qui rend.
 */
describe("la connexion met le même temps à refuser, quoi qu'il refuse", () => {
  const source = sansCommentaires(readFileSync("src/server/acces/comptes.ts", "utf8"));
  const connecter = source.slice(source.indexOf("export async function connecter"));

  it("l'empreinte est calculée avant toute branche qui rend", () => {
    const empreinte = connecter.indexOf("await correspond(");
    const premierRetour = connecter.indexOf("return {");
    expect(empreinte).toBeGreaterThan(0);
    expect(premierRetour).toBeGreaterThan(empreinte);
  });

  it("et le blocage n'y échappe pas", () => {
    // C'était le défaut : `if (verdictAvant.bloque) return …` passait avant.
    const empreinte = connecter.indexOf("await correspond(");
    const blocage = connecter.indexOf("verdictAvant.bloque");
    expect(blocage).toBeGreaterThan(empreinte);
  });

  it("une adresse inconnue paie le leurre, comme les autres", () => {
    // Sans lui, l'absence de compte se lirait au chronomètre sans même
    // avoir à provoquer un blocage.
    expect(connecter).toMatch(/correspond\(motDePasse, LEURRE\)/u);
  });

  it("et le refus ne nomme jamais l'adresse ni son absence", () => {
    /*
      L'autre moitié de la règle : le texte. « Adresse inconnue »
      confirmerait qu'une adresse a un compte ici, ce qui suffit à dresser
      une liste de clients à partir d'un carnet d'adresses.
    */
    for (const echecs of [0, 1, 4]) {
      const dit = libelleEchec(verdictDeConnexion(echecs, null, new Date()));
      expect(dit, `${echecs}`).not.toMatch(/adresse|inconnu|inexistant|mot de passe/iu);
    }
  });

  it("le décompte annoncé ne sépare plus les deux (D-3, option B)", () => {
    /*
      Mesuré avant correction, au **premier** essai : une adresse inconnue
      rendait « il te reste 5 essais », une adresse connue « il te reste 4 ».
      Le produit a gardé le décompte et choisi de compter les échecs des
      adresses sans compte : l'une et l'autre passent désormais par le même
      compteur, la même phrase et le même blocage (revue du 07/10/2026, M2).
    */
    reinitialiserEchecsSansCompte();
    const maintenant = new Date("2026-10-08T10:00:00Z");
    const adresse = "personne@exemple.test";
    expect(lireEchecsSansCompte(adresse, maintenant)).toEqual({ echecs: 0, bloqueJusqua: null });

    const libelles: string[] = [];
    for (let essai = 1; essai <= ESSAIS_AVANT_BLOCAGE; essai += 1) {
      const sansCompte = noterEchecSansCompte(adresse, maintenant);
      const connu = verdictDeConnexion(
        essai,
        aBloquer(essai) ? finDuBlocage(maintenant) : null,
        maintenant,
      );
      const inconnu = verdictDeConnexion(sansCompte.echecs, sansCompte.bloqueJusqua, maintenant);
      expect(inconnu, `essai ${essai}`).toEqual(connu);
      libelles.push(libelleEchec(inconnu));
    }
    expect(libelles[0]).toContain(`${ESSAIS_AVANT_BLOCAGE - 1} essais`);
    // Le cinquième échec bloque l'adresse sans compte, comme un compte réel.
    expect(libelles.at(-1)).toMatch(/Trop d'essais/u);
    const apres = lireEchecsSansCompte(adresse, maintenant);
    expect(verdictDeConnexion(apres.echecs, apres.bloqueJusqua, maintenant).bloque).toBe(true);
  });

  it("le compteur sans compte ne garde pas l'adresse, et l'oublie au bout de 24 heures", () => {
    reinitialiserEchecsSansCompte();
    const maintenant = new Date("2026-10-08T10:00:00Z");
    noterEchecSansCompte("oubli@exemple.test", maintenant);
    expect(lireEchecsSansCompte("oubli@exemple.test", maintenant).echecs).toBe(1);
    const lendemain = new Date(maintenant.getTime() + (OUBLI_HEURES * 60 + 1) * 60_000);
    expect(lireEchecsSansCompte("oubli@exemple.test", lendemain).echecs).toBe(0);
    expect(noterEchecSansCompte("oubli@exemple.test", lendemain).echecs).toBe(1);

    const module = sansCommentaires(
      readFileSync("src/server/acces/echecs-sans-compte.ts", "utf8"),
    );
    // La clé est une empreinte salée ; l'adresse n'est jamais une clé.
    expect(module).toMatch(/createHmac\("sha256", SEL\)/u);
    expect(module).not.toMatch(/registre\.set\(email/u);
  });

  it("connecter lit et note ce compteur pour une adresse sans compte", () => {
    expect(connecter).toMatch(/lireEchecsSansCompte\(email, maintenant\)/u);
    expect(connecter).toMatch(/noterEchecSansCompte\(email, maintenant\)/u);
    expect(connecter).not.toMatch(/verdictDeConnexion\(0, null, maintenant\)/u);
  });
});

/**
 * Les compteurs d'essais tiennent sous des appels simultanés — revue du
 * 07/10/2026, M3. `smoke:transitions` le vérifie en base, en parallèle ;
 * ces lignes tiennent la forme du code qui l'assure.
 */
describe("les compteurs d'essais se prennent en base, pas sur une valeur lue", () => {
  const source = sansCommentaires(readFileSync("src/server/acces/comptes.ts", "utf8"));
  const code = source.slice(
    source.indexOf("export async function consommerUnCode"),
    source.indexOf("export async function corrigerLAdresse"),
  );
  const connecter = source.slice(
    source.indexOf("export async function connecter"),
    source.indexOf("const LEURRE"),
  );

  it("un essai de code n'est compté que s'il en reste", () => {
    expect(code).toMatch(/attempts: \{ lt: ESSAIS_PAR_CODE \}/u);
    expect(code).toMatch(/if \(essai\.count === 0\) return false/u);
    expect(code).not.toMatch(/secret\.attempts >=/u);
  });

  it("un code ne se consomme qu'une fois", () => {
    expect(code).toMatch(/where: \{ id: secret\.id, consumedAt: null \}/u);
    expect(code).toMatch(/return consomme\.count === 1/u);
  });

  it("l'échec de connexion s'incrémente en base, et le blocage lit la valeur rendue", () => {
    expect(connecter).toMatch(/failedLogins: \{ increment: 1 \}/u);
    expect(connecter).not.toMatch(/failedLogins \+ 1/u);
  });

  it("un mot de passe juste ne lève pas un blocage posé pendant sa vérification", () => {
    expect(connecter).toMatch(/OR: \[\{ lockedUntil: null \}, \{ lockedUntil: \{ lte: maintenant \} \}\]/u);
  });
});

/**
 * « Rester connecté » — A-02, revue du 07/10/2026, N1 ; décision D-22.
 *
 * La case n'était jamais envoyée et la route n'avait pas de champ pour
 * elle : toute session durait trente jours, y compris sur le poste partagé
 * où l'écran disait de la laisser décochée. `smoke:transitions` vérifie les
 * durées en base ; ces lignes tiennent le chemin de la case jusqu'au cookie.
 */
describe("la case « Rester connecté » commande la durée de la session", () => {
  const route = sansCommentaires(readFileSync("src/app/api/comptes/session/route.ts", "utf8"));
  const session = sansCommentaires(readFileSync("src/server/securite/session.ts", "utf8"));

  it("la route lit la case, décochée par défaut, et la transmet", () => {
    expect(route).toMatch(/resterConnecte: z\.boolean\(\)\.default\(false\)/u);
    expect(route).toMatch(/corps\.resterConnecte,/u);
    expect(route).toMatch(/attributsCookie\(session\.cookieExpireLe\)/u);
  });

  it("une session non mémorisée a un cookie sans échéance et 24 heures en base", () => {
    expect(session).toMatch(/DUREE_NON_MEMORISEE_HEURES = 24/u);
    expect(session).toMatch(/cookieExpireLe: memoriser \? expireLe : null/u);
    // Sans `expires`, le navigateur oublie le cookie à sa fermeture.
    expect(session).toMatch(/\.\.\.\(expireLe \? \{ expires: expireLe \} : \{\}\)/u);
  });

  it("la route ne renvoie plus un décompte que l'écran ne lit pas", () => {
    expect(route).not.toMatch(/essaisRestants/u);
  });
});
