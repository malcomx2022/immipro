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
  const EN_ATTENTE_DE_BRANCHEMENT: Record<string, string> = {
    // `PUT /api/admin/utilisateurs` existe. Les actions par ligne ne
    // l'appellent pas.
    "src/app/(admin)/utilisateurs/Utilisateurs.tsx": "PUT utilisateurs écrite, écran muet",
    // Aucune route : la collecte automatique des sources n'existe pas, et
    // l'écran le dit déjà en toutes lettres.
    "src/app/(admin)/veille/FileDeVeille.tsx": "aucune route de collecte",
    // Aucune route : les plafonds sont calculés, jamais modifiables.
    "src/app/(admin)/couts-ia/CoutsIa.tsx": "aucune route de plafond",
    // Les quatre boutons d'export du back-office. Aucun code d'export
    // n'existe dans le dépôt.
    "src/app/(admin)/journal/Journal.tsx": "aucun export",
    "src/app/(admin)/paiements/Paiements.tsx": "aucun export, aucun rapprochement manuel",
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
      trouvees.push(code.slice(fin, fin + 60).replace(/\s+/gu, " ").trim());
    }
    return trouvees;
  };

  it("les écrans muets sont exactement ceux du registre", () => {
    const muets = fichiers("src/app/(admin)")
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
      // L'ouverture du dossier d'un candidat depuis le back-office. B-03
      // et B-04 affichent des dossiers ; aucun des deux ne consigne
      // l'accès. `piece.consultation` avait le même défaut, corrigé ici.
      "dossier.consultation": "B-03 et B-04 ouvrent un dossier sans le consigner",
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
