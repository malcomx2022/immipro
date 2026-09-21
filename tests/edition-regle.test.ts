import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  avecLesTextesCandidat,
  textesCandidat,
  visaRulesSchema,
  type VisaRulesPayload,
} from "@/domain/rules/schema";
import { sansCommentaires } from "@/domain/copy/source";
import { COMMANDES_ATTENDUES } from "@/domain/backoffice/couts";
import { COMMANDES_ATTENDUES_B04 } from "@/domain/backoffice/reconciliation";

const lire = (f: string) => readFileSync(f, "utf8");

/**
 * B-02 — l'édition d'une règle écrit vraiment.
 *
 * Les deux commandes de l'en-tête n'étaient reliées à rien. « Enregistrer
 * le brouillon » ne faisait rien ; « Publier » posait un drapeau local et
 * l'écran répondait « Publication demandée. La version N devient la
 * référence des nouveaux dossiers », en région vivante, sans qu'aucune
 * requête soit partie. Un veilleur repartait en croyant la règle publiée,
 * et la version en vigueur restait celle d'avant.
 *
 * C'est la faute que le produit refuse ailleurs — aucun service absent
 * n'est simulé (I.C) — sur l'acte que protège INV-3. Les deux routes
 * existaient et journalisaient depuis le début : seule la moitié cliente
 * manquait.
 */

const PAYLOAD: VisaRulesPayload = visaRulesSchema.parse({
  libelle: "Permis d'études — Canada",
  langues_acceptees: ["fr", "en"],
  niveau_langue_min: "B2",
  frais_scolarite: null,
  frais_dossier: null,
  preuve_fonds: { valeur: 20635, devise: "CAD", periodicite: "annuel" },
  delai_traitement_jours: { min: 30, max: 90 },
  travail_autorise: {
    autorise: true,
    limite_hebdomadaire_heures: 24,
    plein_temps_vacances: true,
    delai_carence_mois: null,
    permis_employeur_requis: false,
  },
  apres_etudes: null,
  conditions: [],
  pieces_requises: [],
  reserves: ["La première réserve", "La deuxième", "La troisième"],
});

describe("les textes de B-02 se recollent sur le payload en base", () => {
  it("remplace le libellé et la première réserve, et rien d'autre", () => {
    const apres = avecLesTextesCandidat(PAYLOAD, {
      libelleCandidat: "Permis d'études — Canada (2027)",
      reserveCandidat: "Une réserve reformulée",
    });
    expect(apres.libelle).toBe("Permis d'études — Canada (2027)");
    expect(apres.reserves).toEqual([
      "Une réserve reformulée",
      "La deuxième",
      "La troisième",
    ]);
    // Tout le reste traverse à l'identique : c'est la raison d'être de
    // cette fonction, contre un formulaire qui renverrait le payload
    // entier et écraserait ce qu'il n'affiche pas.
    expect({ ...apres, libelle: "", reserves: [] }).toEqual({
      ...PAYLOAD,
      libelle: "",
      reserves: [],
    });
  });

  /**
   * La lecture rend `reserves[0] ?? ""`. Un champ vide ne peut donc
   * signifier qu'une chose, et faire survivre une réserve que
   * l'opérateur vient d'effacer serait le contraire de ce qu'il a
   * demandé.
   */
  it("vider la réserve la retire, sans toucher aux suivantes", () => {
    const apres = avecLesTextesCandidat(PAYLOAD, {
      libelleCandidat: "Permis d'études — Canada",
      reserveCandidat: "   ",
    });
    expect(apres.reserves).toEqual(["La deuxième", "La troisième"]);
  });

  it("une première réserve apparaît là où il n'y en avait aucune", () => {
    const sansReserve = { ...PAYLOAD, reserves: [] };
    const apres = avecLesTextesCandidat(sansReserve, {
      libelleCandidat: "Permis d'études — Canada",
      reserveCandidat: "La seule réserve",
    });
    expect(apres.reserves).toEqual(["La seule réserve"]);
  });

  /** Elle est l'inverse exact de la projection que la lecture applique. */
  it("elle est l'inverse de la lecture", () => {
    const textes = {
      libelleCandidat: "Un libellé",
      reserveCandidat: "Une réserve",
    };
    const apres = avecLesTextesCandidat(PAYLOAD, textes);
    expect(apres.libelle).toBe(textes.libelleCandidat);
    expect(apres.reserves[0] ?? "").toBe(textes.reserveCandidat);
  });

  /**
   * Et le résultat repasse par la liste de vocabulaire, comme tout texte
   * candidat : recoller un texte ne le dispense pas du contrôle.
   */
  it("le texte recollé reste soumis au vocabulaire interdit", () => {
    const apres = avecLesTextesCandidat(PAYLOAD, {
      libelleCandidat: "Visa garanti",
      reserveCandidat: "",
    });
    expect(textesCandidat(apres).some((t) => t.texte === "Visa garanti")).toBe(true);
  });
});

describe("la route n'accepte que ce que l'écran édite", () => {
  const route = lire("src/app/api/admin/regles/[id]/route.ts");

  /**
   * Faire porter le payload entier au formulaire aurait été le plus
   * court, et le plus faux : la copie chargée à l'ouverture de la page
   * écraserait à l'enregistrement tout ce qu'un autre veilleur aurait
   * changé entre-temps dans les champs que l'écran ne montre pas.
   */
  it("la branche des textes relit la base plutôt que de croire le client", () => {
    expect(route).toContain('champ: z.literal("textes")');
    expect(route).toMatch(/visaRulesSchema\.safeParse\(regle\.rules\)/u);
    expect(route).toContain("avecLesTextesCandidat(enBase.data, corps)");
  });

  /** Les deux branches convergent sur une seule écriture et un seul contrôle. */
  it("les deux branches passent par le même contrôle de vocabulaire", () => {
    const put = route.slice(route.indexOf("export const PUT"), route.indexOf("export const POST"));
    expect([...put.matchAll(/verifierPayloadCandidat\(/gu)]).toHaveLength(1);
    expect([...put.matchAll(/db\.visaRule\.update\(/gu)]).toHaveLength(1);
  });

  /**
   * RG-14.2 : qui rédige n'est pas qui publie. L'enregistrement est
   * ouvert au veilleur, la publication non — et les deux accès ne
   * doivent pas glisser l'un vers l'autre.
   */
  it("enregistrer est veilleur, publier est administrateur", () => {
    const put = route.slice(route.indexOf("export const PUT"), route.indexOf("export const POST"));
    const post = route.slice(route.indexOf("export const POST"));
    expect(put).toMatch(/acces: "veilleur"/u);
    expect(post).toMatch(/acces: "admin"/u);
  });
});

describe("l'écran ne dit plus rien que le serveur n'ait répondu", () => {
  const ecran = lire("src/app/(admin)/regles/[id]/EditionRegle.tsx");

  it("les deux commandes partent vers leur route", () => {
    expect(ecran).toMatch(/methode: "PUT"[\s\S]{0,80}corps: corpsDesTextes/u);
    expect(ecran).toMatch(/appeler<\{ publiee: string \}>\(`\/api\/admin\/regles\/\$\{id\}`/u);
  });

  /**
   * Publier enregistre d'abord. La publication relit le payload en base
   * pour le valider : publier sans enregistrer aurait mis en vigueur le
   * texte d'avant pendant que l'écran montrait celui d'après.
   */
  it("publier enregistre d'abord, et s'arrête si l'enregistrement est refusé", () => {
    const fonction = /async function publier\(\)[\s\S]*?\n {2}\}/u.exec(ecran)![0];
    expect(fonction).toMatch(/if \(!\(await enregistrer\(\)\)\) \{[\s\S]*?return;/u);
    expect(fonction.indexOf("enregistrer()")).toBeLessThan(fonction.indexOf("appeler<"));
  });

  /**
   * Le cœur de la correction. Le message n'est plus accroché à un clic
   * mais à un état que seule une réponse réussie pose.
   */
  it("aucune annonce n'est accrochée à un clic", () => {
    expect(ecran).not.toContain("tentative");
    expect(ecran).toContain('fait === "publie"');
    const pose = [...ecran.matchAll(/setFait\("(\w+)"\)/gu)].map((m) => m[1]);
    expect(new Set(pose)).toEqual(new Set(["enregistre", "publie"]));
    // « publié » ne se pose qu'après la réponse de la publication.
    const publier = /async function publier\(\)[\s\S]*?\n {2}\}/u.exec(ecran)![0];
    expect(publier.indexOf('setFait("publie")')).toBeGreaterThan(publier.indexOf("appeler<"));
  });

  /**
   * Et un enregistrement réussi suivi d'une publication refusée dit les
   * deux : annoncer l'un sans l'autre reproduirait le défaut à l'envers.
   */
  it("un enregistrement passé et une publication refusée se disent tous les deux", () => {
    const publier = /async function publier\(\)[\s\S]*?\n {2}\}/u.exec(ecran)![0];
    const refus = publier.slice(publier.indexOf("if (!resultat.ok)"));
    expect(refus).toContain('setFait("enregistre")');
    expect(refus).toContain("setEchec(resultat.echec)");
  });

  it("le refus du serveur s'affiche, il ne se perd pas", () => {
    expect(ecran).toContain("<BlocEchec echec={echec} annonce />");
  });

  /** RG-14.2, dit avant le clic plutôt que par un refus d'accès. */
  it("un veilleur voit pourquoi il ne peut pas publier", () => {
    expect(ecran).toMatch(/!habiliteAPublier[\s\S]{0,140}RG-14\.2/u);
    expect(lire("src/app/(admin)/regles/[id]/page.tsx")).toContain(
      'peutPublier={acteur.role === "ADMIN"}',
    );
  });
});

/**
 * Le registre des commandes qui n'écrivent encore rien.
 *
 * B-02 n'était pas un cas isolé : cinq des sept surfaces du back-office
 * portent des boutons reliés à rien, et pour trois d'entre elles la route
 * existe déjà. Corriger B-02 sans nommer les autres laisserait la même
 * découverte à refaire — et rien n'empêcherait d'en ajouter une de plus.
 *
 * La liste est donc explicite, comme `copy-exceptions.json` et comme
 * `PREALABLES` : une commande inerte hors de cette liste fait échouer le
 * test, et la liste ne peut que rétrécir.
 */
function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.tsx?$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

describe("aucune commande inerte n'apparaît sans être nommée", () => {
  /**
   * Chaque écran encore muet, avec ce qui lui manque. Une entrée disparaît
   * le jour où l'écran écrit ; aucune ne s'ajoute sans être discutée.
   */
  /**
   * Le registre est vide, et c'est la fin de la revue.
   *
   * Les sept écrans du back-office portaient onze commandes inertes. Six
   * lots les ont branchées ou retirées ; S.7 a pris les deux dernières —
   * les exports de B-06 et B-04 —, écrit l'écrivain de CSV qui manquait au
   * dépôt, et retiré le rapprochement manuel, qui n'a personne à
   * interroger.
   *
   * Le registre reste, vide. Le supprimer retirerait le garde-fou avec la
   * liste : c'est lui qui refuse le prochain bouton qui ne part nulle part,
   * et il n'a plus rien à tolérer.
   */
  const EN_ATTENTE_DE_BRANCHEMENT: Record<string, string> = {
    /**
     * Les deux commandes que l'élargissement du balayage a trouvées, dans
     * la partie du produit que ce garde-fou n'avait jamais regardée.
     *
     * Elles ne sont pas du ressort de WF-08 et ne sont pas traitées ici :
     * les nommer est ce qui les empêche de disparaître avec le vert du
     * test. Chacune dit ce qui lui manque, comme les registres de B-03,
     * B-04 et B-07.
     */
    "src/app/(app)/(dossier)/consultants/Annuaire.tsx":
      "« Me prévenir dès qu'il y en a un » — aucune route, et la messagerie n'est pas branchée (bloquante avant ouverture)",
    "src/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier.tsx":
      "« Téléverser sans analyse » — aucune route : déposer une pièce sans la faire lire demande de décider ce que devient sa complétude",
  };

  /**
   * Les attributs d'une balise, accolades équilibrées.
   *
   * La première version lisait `<Button\b[^>]*?>`, et s'arrêtait au
   * premier `>` : `disabled={fautes.length > 0}` en contient un, si bien
   * que le `onClick` placé après passait inaperçu et que B-02, qui venait
   * d'être branché, ressortait muet. Encore un garde-fou qui ne
   * connaissait que la forme pour laquelle il avait été écrit — la même
   * leçon qu'en R.3, sur une autre syntaxe.
   */
  const attributs = (code: string, depuis: number): { attrs: string; fin: number } => {
    let i = depuis;
    let accolades = 0;
    let guillemet = "";
    while (i < code.length) {
      const c = code[i]!;
      if (guillemet) {
        if (c === guillemet) guillemet = "";
      } else if (c === '"' || c === "'" || c === "`") {
        guillemet = c;
      } else if (c === "{") accolades += 1;
      else if (c === "}") accolades -= 1;
      else if (c === ">" && accolades === 0) break;
      i += 1;
    }
    return { attrs: code.slice(depuis, i), fin: i + 1 };
  };

  const inertes = (source: string): string[] => {
    const code = sansCommentaires(source);
    const trouvees: string[] = [];
    for (const m of code.matchAll(/<Button\b/gu)) {
      const { attrs, fin } = attributs(code, m.index + m[0].length);
      if (/onClick|type="submit"|onSubmit/u.test(attrs)) continue;
      /**
       * Un `disabled` **inconditionnel** avec sa raison n'est pas une
       * commande morte : c'est l'état d'attente d'un écran, et l'autre
       * branche du ternaire porte l'action. Le premier balayage de
       * `src/app` accusait ainsi le « Continuer » grisé du choix de pack,
       * dont la branche active est un lien.
       *
       * `disabled={expr}` ne bénéficie pas de l'exemption : un bouton qui
       * peut redevenir cliquable doit avoir quelque chose à faire quand il
       * le redevient.
       */
      if (/\bdisabled(?!=)/u.test(attrs) && /raisonDesactivation/u.test(attrs)) continue;
      trouvees.push(code.slice(fin, fin + 60).replace(/\s+/gu, " ").trim());
    }
    return trouvees;
  };

  /**
   * Le garde-fou ne balayait que le back-office — et l'angle mort a duré
   * six lots.
   *
   * `fichiers("src/app/(admin)")` : sept écrans surveillés, et pas une
   * seule des surfaces que les candidats touchent. R-03 y portait un
   * « Restaurer » inerte et R-04 un « Corriger le passage » qui ne
   * corrigeait rien, sans que rien ne s'en aperçoive. Le registre passait
   * au vert en balayant précisément la partie de l'application qu'on
   * venait de nettoyer.
   *
   * Il balaie maintenant tout `src/app`. C'est la quatrième fois de cette
   * revue qu'un garde-fou ne connaît que ce pour quoi il a été écrit, et
   * la première fois que ce qu'il ignorait, c'était la moitié du produit.
   */
  it("les écrans muets sont exactement ceux du registre", () => {
    const muets = fichiers("src/app")
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => inertes(lire(f)).length > 0);
    expect(muets.sort()).toEqual(Object.keys(EN_ATTENTE_DE_BRANCHEMENT).sort());
  });

  /** B-02 en est sorti, et c'est tout l'objet de ce lot. */
  it("B-02 n'y est plus", () => {
    const b02 = "src/app/(admin)/regles/[id]/EditionRegle.tsx";
    expect(Object.keys(EN_ATTENTE_DE_BRANCHEMENT)).not.toContain(b02);
    expect(inertes(lire(b02))).toEqual([]);
  });

  /**
   * Les deux derniers, et ils sortent par les deux chemins : B-06 et
   * l'export de B-04 sont branchés, le rapprochement manuel est retiré.
   */
  it("B-06 et B-04 n'y sont plus", () => {
    for (const ecran of [
      "src/app/(admin)/journal/Journal.tsx",
      "src/app/(admin)/paiements/Paiements.tsx",
    ]) {
      expect(inertes(lire(ecran)), ecran).toEqual([]);
    }
    expect(COMMANDES_ATTENDUES_B04.map((c) => c.libelle)).toEqual([
      "Lancer le rapprochement",
    ]);
  });

  /**
   * B-07 en est sorti par retrait, pas par branchement — et les deux
   * comptent. Un bouton qui ne part nulle part vaut moins qu'une absence :
   * ce qui lui manque est nommé dans `COMMANDES_ATTENDUES`, où il se relit.
   */
  it("B-07 n'y est plus, et ce qui lui manque est nommé", () => {
    const b07 = "src/app/(admin)/couts-ia/CoutsIa.tsx";
    expect(Object.keys(EN_ATTENTE_DE_BRANCHEMENT)).not.toContain(b07);
    expect(inertes(lire(b07))).toEqual([]);
    expect(COMMANDES_ATTENDUES.map((c) => c.libelle)).toEqual([
      "Modifier les plafonds",
      "Exporter le détail des appels",
    ]);
  });

  /** Chaque entrée dit ce qui lui manque, pas seulement qu'elle manque. */
  it("chaque entrée nomme ce qui lui manque", () => {
    for (const [ecran, motif] of Object.entries(EN_ATTENTE_DE_BRANCHEMENT)) {
      expect(motif.length, ecran).toBeGreaterThan(10);
    }
  });
});

/**
 * B-05 — l'accès à une pièce est tracé, ou il n'a pas lieu.
 *
 * RG-15.1 : « Tout accès administrateur à une pièce d'identité est
 * journalisé avec motif obligatoire. » L'écran l'annonçait depuis le
 * début — « l'ouverture d'une pièce est un acte tracé, avec son motif » —
 * et ne le faisait pas : le bouton posait un drapeau local, affichait un
 * aperçu inventé, et n'écrivait aucune ligne. L'action
 * `piece.consultation` figurait dans la table des actions auditées sans
 * qu'aucun code ne l'emploie jamais.
 */
describe("aucune action auditée n'est déclarée sans être écrite", () => {
  /**
   * Le garde-fou général, et la raison pour laquelle le défaut a tenu si
   * longtemps : rien ne reliait la liste des actions à leurs appelants.
   * Une action qu'on déclare et qu'on n'écrit jamais est une promesse de
   * traçabilité que personne ne tient.
   */
  it("chaque action de la table a au moins un appelant", () => {
    const declarees = [
      ...lire("src/server/acces/journal.ts").matchAll(/\| "([a-z]+\.[a-z]+)"/gu),
    ].map((m) => m[1]!);
    expect(declarees.length).toBeGreaterThan(8);

    /**
     * Le littéral, dans un fichier qui journalise — et nulle part ailleurs.
     *
     * Deux versions de ce garde-fou se sont trompées avant celle-ci.
     * La première cherchait `action: "<nom>"` : elle a accusé
     * `compte.suspension` et `compte.retablissement`, que la route des
     * utilisateurs écrit pourtant toutes les deux, par un ternaire
     * `action: corps.suspendre ? … : …` que le motif ne voyait pas. La
     * seconde cherchait le littéral n'importe où : elle a laissé passer
     * `dossier.consultation`, qui n'apparaît que dans la table des
     * catégories de B-06 — un lecteur, pas un écrivain.
     *
     * Le critère juste est celui-ci : une action est écrite là où
     * `journaliser` est appelé. Quatrième fois de la série qu'un
     * garde-fou ne connaît que la forme pour laquelle il a été écrit,
     * après R.3, R.5 et S.1 — et la première où il a fallu deux essais.
     */
    const corpus = fichiers("src")
      .filter((f) => !f.endsWith("acces/journal.ts"))
      .map((f) => sansCommentaires(lire(f)))
      .filter((code) => code.includes("journaliser("))
      .join("\n");

    /**
     * Les actions déclarées que rien n'écrit encore, nommées une par une.
     * Comme le registre des commandes inertes : la liste ne peut que
     * rétrécir, et une orpheline de plus fait échouer le test.
     */
    const SANS_ECRIVAIN: Record<string, string> = {
      /**
       * Déclarée avant la capacité qu'elle audite.
       *
       * La première version de cette note disait que B-03 et B-04
       * ouvraient un dossier sans le consigner. C'est faux, vérifié
       * depuis : **aucun écran du back-office n'ouvre le dossier d'un
       * candidat.** B-03 en affiche le nombre et dit en toutes lettres
       * que les pièces ne sont accessibles que depuis la file de revue ;
       * B-04 ne les mentionne pas. Le défaut n'est donc pas un accès non
       * tracé — c'est une action auditée écrite d'avance, pour un écran
       * que le produit n'a pas.
       *
       * Elle reste déclarée parce que le jour où cet écran existera, la
       * ligne d'audit devra partir avec lui, et non six mois plus tard.
       */
      "dossier.consultation": "aucun écran n'ouvre encore le dossier d'un candidat",
    };

    const orphelines = declarees.filter((a) => !corpus.includes(`"${a}"`));
    expect(orphelines.sort()).toEqual(Object.keys(SANS_ECRIVAIN).sort());
    expect(orphelines).not.toContain("piece.consultation");
  });

  it("la route de consultation journalise avant de signer l'URL", () => {
    const route = lire("src/app/api/admin/revue/[id]/consultation/route.ts");
    expect(route).toMatch(/action: "piece\.consultation"/u);
    // L'ordre est la propriété : signer d'abord laisserait, si
    // l'écriture échoue, un accès réel sans trace.
    expect(route.indexOf("journaliser(")).toBeLessThan(route.indexOf("urlDeLecture("));
    expect(route).toMatch(/motif: z\.string\(\)\.trim\(\)\.min\(MOTIF_MINIMUM\)/u);
  });

  /**
   * La signature de l'URL reste dans `urlDeLecture`, qui porte ses refus
   * — pièce purgée, pièce non balayée (I.D). Les refaire dans la route
   * les dédoublerait, et deux copies d'une décision de sécurité finissent
   * par diverger.
   */
  it("la route ne re-décide pas ce que la signature décide déjà", () => {
    const route = sansCommentaires(lire("src/app/api/admin/revue/[id]/consultation/route.ts"));
    expect(route).not.toMatch(/purgedAt|scanState|presignedGet/u);
    expect(route).toContain("urlDeLecture(version)");
  });

  /** Et aucun aperçu ne s'invente à l'écran. */
  it("l'écran n'invente aucun aperçu", () => {
    const ecran = sansCommentaires(lire("src/app/(admin)/revue/RevueDesPieces.tsx"));
    expect(ecran).not.toMatch(/page 1 sur|aperçu de la pièce/iu);
    expect(ecran).toContain("apercu.url");
  });
});

/**
 * S.6 — le zéro qui se faisait passer pour une mesure.
 *
 * Le seul écrivain de `AiUsage` enregistrait `costMicros: 0`, faute de
 * tarif de jeton. B-07 sommait cette colonne : le premier dossier analysé
 * faisait quitter l'état vide et affichait « 0,00 F par dossier » sous un
 * plafond de 15 %. Un tiret ne dit rien ; un zéro affirme.
 *
 * Deux propriétés tiennent la correction, et elles se lisent dans le code
 * plutôt que dans un rendu :
 *
 *  1. la lecture ne somme plus `costMicros` — elle recalcule depuis les
 *     jetons conservés, pour qu'une ligne écrite avant le tarif ne compte
 *     pas comme gratuite ;
 *  2. l'écriture passe par le tarif au lieu de poser un littéral.
 *
 * Le critère porte sur la fonction appelée, pas sur une forme d'écriture —
 * c'est ce qui avait fini par marcher pour les actions auditées en S.2,
 * après deux critères syntaxiques qui accusaient du code correct.
 */
describe("B-07 — un coût manquant ne vaut jamais zéro", () => {
  const LECTURE = "src/server/lecture/backoffice.ts";
  const ECRITURE = "src/server/jobs/analyse.ts";

  it("la lecture ne somme plus la colonne de coût", () => {
    const code = sansCommentaires(lire(LECTURE));
    const bloc = code.slice(
      code.indexOf("export async function coutsParDossier"),
      code.indexOf("export async function consommationParJour"),
    );
    expect(bloc.length).toBeGreaterThan(200);
    expect(bloc).not.toContain("costMicros");
    expect(bloc).toContain("coutMicrosDesJetons");
  });

  it("l'écriture tarife ses jetons au lieu de poser un littéral", () => {
    const code = sansCommentaires(lire(ECRITURE));
    expect(code).toContain("aiUsage.create");
    expect(code).toContain("coutMicrosDesJetons");
    expect(code).not.toMatch(/costMicros:\s*\d/u);
  });

  /**
   * Le jeu de démonstration écrivait 18 400 micro-unités pour 4 510 jetons.
   * Un montant inventé y fait croire que B-07 sait tarifer alors qu'il
   * attend ses trois variables, et c'est précisément sur la démonstration
   * qu'une capacité absente se prend pour acquise.
   */
  it("la démonstration n'invente aucun montant", () => {
    const code = sansCommentaires(lire("prisma/seed/demonstration.ts"));
    expect(code).toContain("coutMicrosDesJetons");
    expect(code).not.toMatch(/costMicros:\s*\d+_/u);
  });
});
