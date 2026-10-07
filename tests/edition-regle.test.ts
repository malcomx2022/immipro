import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  avecLesTextesCandidat,
  textesCandidat,
  visaRulesSchema,
  type VisaRulesPayload,
} from "@/domain/rules/schema";
import {
  exigerUnEnregistrementAffichable,
  exigerUneVersionJamaisPubliee,
} from "@/server/regles/edition";
import {
  SUITE_DU_REFUS_EN_VIGUEUR,
  destinationDeLEnregistrement,
  estEnVigueur,
  estUnBrouillon,
  refusDuReferentiel,
} from "@/domain/backoffice/regle";
import { EchecHttp } from "@/server/http/echecs";
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
  const edition = lire("src/server/regles/edition.ts");

  /**
   * Faire porter le payload entier au formulaire aurait été le plus
   * court, et le plus faux : la copie chargée à l'ouverture de la page
   * écraserait à l'enregistrement tout ce qu'un autre veilleur aurait
   * changé entre-temps dans les champs que l'écran ne montre pas.
   */
  it("la branche des textes relit la base plutôt que de croire le client", () => {
    expect(route).toContain('champ: z.literal("textes")');
    expect(edition).toMatch(/visaRulesSchema\.safeParse\(source\.rules\)/u);
    expect(edition).toContain("avecLesTextesCandidat(enBase.data, ecrit)");
  });

  /**
   * La route ne décide plus rien : ni où écrire, ni quoi refuser. Les deux
   * sont dans `server/regles/edition.ts`, hors de `next/headers`, où des
   * essais peuvent les exécuter au lieu de compter des appels.
   */
  it("la route ne touche plus la base, et ne rejuge rien", () => {
    expect(route).toContain("enregistrerLesTextes(");
    expect(route).not.toMatch(/db\.visaRule\./u);
    expect(route).not.toMatch(/verifierPayloadCandidat|verifierTextesCandidat/u);
    expect(route).not.toMatch(/exigerUnEnregistrementAffichable/u);
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
    /*
      La publication vise la ligne **écrite**, et non celle de l'adresse :
      l'enregistrement peut venir d'ouvrir la version suivante, et publier
      `id` mettrait alors en vigueur celle qu'on quitte.
    */
    expect(ecran).toMatch(
      /appeler<\{ publiee: string \}>\(\s*`\/api\/admin\/regles\/\$\{ecrite\}`/u,
    );
  });

  /**
   * Publier enregistre d'abord. La publication relit le payload en base
   * pour le valider : publier sans enregistrer aurait mis en vigueur le
   * texte d'avant pendant que l'écran montrait celui d'après.
   */
  it("publier enregistre d'abord, et s'arrête si l'enregistrement est refusé", () => {
    const fonction = /async function publier\(\)[\s\S]*?\n {2}\}/u.exec(ecran)![0];
    expect(fonction).toMatch(/const ecrite = await enregistrer\(\);[\s\S]*?if \(!ecrite\) \{[\s\S]*?return;/u);
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
  /**
   * Le registre est vide, et cette fois sans réserve.
   *
   * Les sept écrans du back-office en portaient onze ; l'élargissement du
   * balayage à `src/app` en a trouvé deux de plus dans l'espace candidat.
   * La dernière — « Me prévenir dès qu'il y en a un » — est partie en S.10
   * pour une raison qui n'était pas celle que j'avais notée : rien dans le
   * produit ne peut rendre un consultant habilité, donc l'avis n'avait pas
   * d'événement à attendre. Le registre des habilitations le porte
   * désormais, avec son propre garde-fou.
   *
   * Le registre reste, vide. Le supprimer retirerait le garde-fou avec la
   * liste : c'est lui qui refusera le prochain bouton qui ne mène à rien.
   */
  const EN_ATTENTE_DE_BRANCHEMENT: Record<string, string> = {};

  /**
   * Deux de mes notes à ce registre étaient fausses, et il faut le dire.
   *
   * La seconde portait sur l'annuaire des consultants : j'avais écrit que
   * « Me prévenir dès qu'il y en a un » attendait la messagerie. C'était
   * vrai et hors sujet — `Accreditation` n'a aucun écrivain, et l'annuaire
   * filtre sur elle : même messagerie branchée, l'avis n'aurait jamais eu
   * d'occasion de partir. Deux fois sur deux, j'ai noté un manque en
   * lisant l'absence d'un `onClick`, sans suivre la chaîne jusqu'au bout.
   *
   * La première portait sur B-06.
   *
   * J'avais écrit que « Téléverser sans analyse » manquait d'une route et
   * « d'une décision sur ce que devient la complétude ». Les deux étaient
   * inexacts : RG-06.5 a tranché depuis le début — le quota n'interdit pas
   * le dépôt, il n'interdit que l'analyse —, et toute la chaîne
   * l'appliquait déjà. Le dépôt relit le solde, le balayage promeut le
   * fichier et remet la pièce en attente sans mettre l'analyse en file.
   *
   * Je l'avais notée en lisant l'absence de `onClick`, sans ouvrir la
   * route. C'est la même erreur qu'en S.2, où j'avais écrit que B-03 et
   * B-04 ouvraient un dossier sans le consigner alors qu'aucun écran
   * n'ouvrait de dossier du tout.
   */

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
    /**
     * `<Button` **et** `<button` : le composant et la balise nue.
     *
     * Le balayage ne connaissait que le composant. Or un `<button>` sans
     * `onClick` est tout aussi mort, et les écrans en emploient — les
     * pastilles de filtre, les onglets. Celles-là en ont un ; une qui n'en
     * aurait pas passait sous le radar. Septième fois de cette revue qu'un
     * critère ne connaît qu'une des formes qu'il devrait couvrir.
     */
    for (const m of code.matchAll(/<[Bb]utton\b/gu)) {
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
    // S.122 : le rapprochement manuel est rétabli, le registre est vide.
    expect(COMMANDES_ATTENDUES_B04.map((c) => c.libelle)).toEqual([]);
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
    // S.122 : l'export est rétabli ; « Modifier les plafonds » attend un arbitrage.
    expect(COMMANDES_ATTENDUES.map((c) => c.libelle)).toEqual(["Modifier les plafonds"]);
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

  /*
    L'écrivain n'est plus nommé par son chemin : il l'était, et le lot qui
    a réuni les deux copies de `noterLesJetons` a fait tomber ce test sans
    qu'aucun comportement change — troisième fois que ce bloc se fait
    prendre par sa propre forme, après les deux critères syntaxiques que
    son commentaire raconte.

    Il est cherché, et le test tient au passage quelque chose de plus fort
    que ce qu'il tenait : qu'il n'y en ait **qu'un**. Deux écrivains de
    `AiUsage` sont ce qui avait produit la divergence d'origine — une
    route qui posait `costMicros: 0` en dur pendant que l'autre tarifait.
  */
  const ECRIVAINS = fichiers("src/server").filter((f) =>
    sansCommentaires(lire(f)).includes("aiUsage.create"),
  );

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

  it("n'a qu'un seul écrivain, et il tarife ses jetons", () => {
    expect(ECRIVAINS).toHaveLength(1);

    const code = sansCommentaires(lire(ECRIVAINS[0]!));
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

/* ------------------------------------------------------------------ *
 * Le refus du vocabulaire porte sur ce que le candidat verra
 * ------------------------------------------------------------------ */

/**
 * Le garde-fou était au mauvais moment — S.90.
 *
 * `CLAUDE.md` : « L'enregistrement d'un brouillon n'est pas bloqué, la
 * publication l'est. Un texte en cours d'écriture doit pouvoir être sauvé ;
 * le refuser pousserait à rédiger ailleurs et à coller à la fin, c'est-à-dire
 * à écrire hors du garde-fou. »
 *
 * La route de B-02 faisait l'inverse : elle levait sur
 * `verifierPayloadCandidat` avant toute écriture, et l'écran désactivait
 * « Enregistrer le brouillon » avec « corrige-le avant d'enregistrer ».
 * C'est la contradiction que J.C avait levée pour B-08 et qui restait
 * entière ici — le commentaire de la route annonçait déjà « la publication
 * est bloquée » à côté d'un code qui bloquait la sauvegarde.
 *
 * Et le refus portait sur tout `textesCandidat(payload)`, alors que la
 * branche `textes` n'écrit que deux champs : une formulation refusée dans un
 * `message_echec` rendait inenregistrables les deux champs du formulaire,
 * avec un message demandant de reformuler un champ que B-02 n'affiche pas.
 */
describe("le vocabulaire n'est refusé que là où le candidat lira", () => {
  const EN_VIGUEUR = { status: "PUBLISHED" };
  const BROUILLON = { status: "DRAFT" };

  const enregistrer = (regle: { status: string }, libelleCandidat: string) =>
    exigerUnEnregistrementAffichable(regle, {
      champ: "textes",
      libelleCandidat,
      reserveCandidat: "",
    });

  const refusDe = (appel: () => void): EchecHttp => {
    try {
      appel();
    } catch (erreur) {
      if (erreur instanceof EchecHttp) return erreur;
      throw erreur;
    }
    throw new Error("aucun refus n'a été opposé");
  };

  it("un brouillon s'enregistre, même avec une formulation refusée", () => {
    expect(() => enregistrer(BROUILLON, "Visa garanti")).not.toThrow();
  });

  /**
   * Une version archivée non plus : la route la refuse en amont, et pour une
   * autre raison — « une version archivée ne se modifie plus ».
   */
  it("une version archivée ne déclenche pas ce refus-là", () => {
    expect(() => enregistrer({ status: "ARCHIVED" }, "Visa garanti")).not.toThrow();
  });

  it("la même formulation, en vigueur, est refusée avant l'écriture", () => {
    const refus = refusDe(() => enregistrer(EN_VIGUEUR, "Visa garanti"));
    expect(refus.echec.code).toBe("publication_refusee");
    expect(refus.echec.statut).toBe(409);
    expect(refus.champs).toHaveProperty("libelleCandidat");
  });

  /**
   * Et le message dit la suite : l'enregistrement d'une version en vigueur
   * est une publication. Sans cette phrase, le veilleur lit un refus sur
   * un bouton intitulé « Enregistrer le brouillon » et ne comprend pas
   * pourquoi.
   */
  it("le refus dit pourquoi cet enregistrement-là publie", () => {
    const refus = refusDe(() => enregistrer(EN_VIGUEUR, "Visa garanti"));
    expect(refus.echec.corps).toContain(SUITE_DU_REFUS_EN_VIGUEUR);
    expect(SUITE_DU_REFUS_EN_VIGUEUR).toMatch(/en vigueur/u);
    expect(SUITE_DU_REFUS_EN_VIGUEUR).toMatch(/Reformule/u);
  });

  /**
   * Le message nomme l'intitulé du formulaire, pas un chemin de payload :
   * « Reformule ce passage de "Libellé affiché au candidat" » se corrige,
   * « reformule le champ "conditions.3.message_echec" » ne se corrige pas
   * depuis B-02.
   */
  it("il pointe le champ tel que l'écran le nomme", () => {
    const refus = refusDe(() => enregistrer(EN_VIGUEUR, "Visa garanti"));
    expect(refus.echec.corps).toContain("Libellé affiché au candidat");
    expect(refus.echec.corps).not.toMatch(/conditions\.\d|pieces_requises\./u);
  });

  /**
   * Le cœur de la seconde moitié du défaut : la branche `textes` ne
   * réécrit pas les `message_echec`, qui traversent depuis la base. Les
   * refuser interdisait la correction des deux champs corrigeables, sans
   * rien ôter de l'écran du candidat — la phrase y était déjà.
   */
  it("une faute que l'écran ne peut pas atteindre ne bloque pas ses deux champs", () => {
    const fautif = visaRulesSchema.parse({
      ...PAYLOAD,
      conditions: [
        {
          code: "preuve_fonds",
          operateur: "gte",
          valeur: 20635,
          unite: "CAD",
          bloquant: false,
          message_echec: "Tes chances d'obtention baissent sous ce montant.",
        },
      ],
    });
    // La phrase est bien refusée par la lecture complète du référentiel…
    expect(refusDuReferentiel(fautif)).not.toBeNull();
    // … et la publication s'en charge. L'enregistrement des deux textes,
    // lui, n'a pas à en répondre : il ne les écrit pas.
    expect(() =>
      exigerUnEnregistrementAffichable(EN_VIGUEUR, {
        champ: "textes",
        libelleCandidat: "Permis d'études — Canada",
        reserveCandidat: "Une réserve sobre",
      }),
    ).not.toThrow();
  });

  /**
   * La branche `payload`, elle, soumet tout : rien n'y traverse depuis la
   * base, et tout y est donc examiné.
   */
  it("la branche payload répond de tout ce qu'elle soumet", () => {
    const fautif = visaRulesSchema.parse({
      ...PAYLOAD,
      reserves: ["Le taux d'acceptation de cette procédure est élevé."],
    });
    const refus = refusDe(() =>
      exigerUnEnregistrementAffichable(EN_VIGUEUR, { champ: "payload", payload: fautif }),
    );
    expect(refus.echec.code).toBe("publication_refusee");
    expect(Object.keys(refus.champs ?? {})).toContain("reserves.0");
    // Et sur un brouillon, elle passe comme l'autre.
    expect(() =>
      exigerUnEnregistrementAffichable(BROUILLON, { champ: "payload", payload: fautif }),
    ).not.toThrow();
  });

  /**
   * L'écran lit le même fait que la route, sur la même ligne.
   *
   * `editionDeLaRegle` rend deux versions, et l'écran s'adresse à `id` :
   * c'est `cible` — la ligne que l'adresse désigne et que le `PUT` relira —
   * qui décide, jamais `brouillon`, qui retombe sur `cible` faute de
   * brouillon et n'est donc pas une réponse à la question posée.
   */
  it("l'écran sait si un brouillon existe, et lequel numéro il écrira", () => {
    const lecture = lire("src/server/lecture/backoffice.ts");
    expect(lecture).toContain("brouillonExistant: existant !== undefined");
    // La ligne en vigueur n'est plus rendue sous le nom de brouillon sans
    // que l'écran sache que c'en est une.
    expect(lecture).not.toMatch(/const brouillon = versions\.find\(\(v\) => v\.status === "DRAFT"\) \?\? cible/u);
    expect(lecture).toContain("versionAEcrire: existant");
    expect(lire("src/app/(admin)/regles/[id]/page.tsx")).toContain(
      "brouillonExistant={vue.brouillonExistant}",
    );
  });

  /** La publication garde sa lecture complète : rien ne s'y relâche. */
  it("la publication continue de relire tout le référentiel", () => {
    const publication = lire("src/server/regles/publication.ts");
    expect(publication).toContain("refusDuReferentiel(lu.data)");
    expect(lire("prisma/seed/visa-rules.ts")).toContain("refusDuReferentiel");
  });
});

/* ------------------------------------------------------------------ *
 * Où va l'enregistrement — INV-3
 * ------------------------------------------------------------------ */

/**
 * L'écran appelait « brouillon » la version que les dossiers ont figée.
 *
 * `editionDeLaRegle` rendait `versions.find(DRAFT) ?? cible`, et **rien
 * dans `src/` ne créait de version**. Les trois procédures publiées du
 * référentiel livré n'ont pas de brouillon : l'écran ouvrait la ligne en
 * vigueur, l'intitulait « Brouillon version 1 · version 1 en vigueur », et
 * « Enregistrer le brouillon » la réécrivait — sans nouvelle version, sans
 * publication, sans ligne au journal.
 *
 * `Application.visaRuleId` fige cette ligne. INV-3 : « Un dossier fige la
 * version de règle utilisée. Une évolution réglementaire ne casse jamais
 * une checklist en cours. »
 *
 * L'arbitrage que ce lot tranche : **le veilleur ouvre la version suivante
 * en enregistrant.** RG-14.2 sépare qui rédige de qui publie, et le `PUT`
 * est ouvert au veilleur quand le `POST` est réservé à l'administrateur ;
 * `publierLaRegle` archive le prédécesseur ; l'écran dit déjà « Publier la
 * version N ». Il ne manquait que la création.
 *
 * `smoke:publication` exécute la chaîne entière contre PostgreSQL : la
 * version figée ne bouge pas, le dossier garde la sienne, et la
 * publication archive l'ancienne.
 */
describe("l'enregistrement de B-02 ne touche jamais la version en vigueur", () => {
  const MISE_EN_VIGUEUR = new Date("2026-06-01T00:00:00Z");
  /**
   * Par défaut, une version publiée ou archivée a été mise en vigueur et un
   * brouillon jamais. Le quatrième argument décrit l'autre cas : une
   * version que l'échéance de relecture a repassée en `DRAFT`.
   */
  const v = (
    id: string,
    version: number,
    statut: "DRAFT" | "PUBLISHED" | "ARCHIVED",
    publieeLe: Date | null = statut === "DRAFT" ? null : MISE_EN_VIGUEUR,
  ) => ({ id, version, statut, publieeLe });

  it("écrit le brouillon quand il en existe un", () => {
    expect(destinationDeLEnregistrement([v("b", 2, "DRAFT"), v("p", 1, "PUBLISHED")])).toEqual({
      quoi: "brouillon",
      id: "b",
      version: 2,
    });
  });

  it("ouvre la suivante quand il n'y en a pas", () => {
    expect(destinationDeLEnregistrement([v("p", 1, "PUBLISHED")])).toEqual({
      quoi: "a_ouvrir",
      depuis: "p",
      version: 2,
    });
  });

  /**
   * Le texte de départ vient de la version **en vigueur**, jamais de la
   * plus haute : une archivée peut porter un numéro supérieur — elle a été
   * mise en vigueur puis remplacée —, et repartir d'elle ressusciterait un
   * texte que la publication a retiré. Le rang, lui, suit le plus haut :
   * deux versions ne peuvent pas porter le même.
   */
  it("part de la version en vigueur, et numérote après la plus haute", () => {
    const destination = destinationDeLEnregistrement([
      v("archivee", 3, "ARCHIVED"),
      v("vigueur", 2, "PUBLISHED"),
      v("ancienne", 1, "ARCHIVED"),
    ]);
    expect(destination).toEqual({ quoi: "a_ouvrir", depuis: "vigueur", version: 4 });
  });

  it("ne décide rien sans version", () => {
    expect(destinationDeLEnregistrement([])).toBeNull();
  });

  /**
   * Revue du 07/10/2026, C1 — le défaut reproduit.
   *
   * Le job de veille (RG-14.1) repasse en `DRAFT` une version en vigueur
   * dont la relecture est dépassée. Elle reste celle des dossiers qui
   * l'ont figée. Choisie comme brouillon par son seul statut, elle était
   * réécrite en place : leur checklist changeait d'un coup.
   */
  it("une version dépubliée par l'échéance n'est pas un brouillon : la suivante s'ouvre", () => {
    expect(destinationDeLEnregistrement([v("v1", 1, "DRAFT", MISE_EN_VIGUEUR)])).toEqual({
      quoi: "a_ouvrir",
      depuis: "v1",
      version: 2,
    });
  });

  it("le vrai brouillon est écrit, quel que soit l'ordre des lignes", () => {
    const vigueur = v("v1", 1, "DRAFT", MISE_EN_VIGUEUR);
    const brouillon = v("v2", 2, "DRAFT");
    for (const versions of [
      [vigueur, brouillon],
      [brouillon, vigueur],
    ]) {
      expect(destinationDeLEnregistrement(versions)).toEqual({
        quoi: "brouillon",
        id: "v2",
        version: 2,
      });
    }
  });

  it("la suivante part de la version dépubliée, pas d'une archivée plus haute", () => {
    expect(
      destinationDeLEnregistrement([
        v("archivee", 3, "ARCHIVED"),
        v("depubliee", 2, "DRAFT", MISE_EN_VIGUEUR),
      ]),
    ).toEqual({ quoi: "a_ouvrir", depuis: "depubliee", version: 4 });
  });

  it("en vigueur et brouillon se lisent par la mise en vigueur, pas par le statut", () => {
    expect(estUnBrouillon(v("b", 2, "DRAFT"))).toBe(true);
    expect(estUnBrouillon(v("d", 1, "DRAFT", MISE_EN_VIGUEUR))).toBe(false);
    expect(estUnBrouillon(v("p", 1, "PUBLISHED"))).toBe(false);
    expect(estEnVigueur(v("d", 1, "DRAFT", MISE_EN_VIGUEUR))).toBe(true);
    expect(estEnVigueur(v("p", 1, "PUBLISHED"))).toBe(true);
    expect(estEnVigueur(v("a", 1, "ARCHIVED"))).toBe(false);
    expect(estEnVigueur(v("b", 2, "DRAFT"))).toBe(false);
  });

  /** La dernière ligne d'INV-3, opposée à la ligne qu'on va écrire. */
  it("le serveur refuse d'écrire dans une version qui a été mise en vigueur", () => {
    expect(() => exigerUneVersionJamaisPubliee(v("b", 2, "DRAFT"))).not.toThrow();
    for (const figee of [
      v("d", 1, "DRAFT", MISE_EN_VIGUEUR),
      v("p", 1, "PUBLISHED"),
      v("a", 1, "ARCHIVED"),
    ]) {
      let refus: unknown;
      try {
        exigerUneVersionJamaisPubliee(figee);
      } catch (erreur) {
        refus = erreur;
      }
      expect(refus).toBeInstanceOf(EchecHttp);
      expect((refus as EchecHttp).echec.code).toBe("etat_incompatible");
      expect((refus as EchecHttp).echec.corps).toContain("la version suivante s'ouvrira");
    }
  });

  it("le serveur et l'écran lisent la même chose", () => {
    const edition = sansCommentaires(lire("src/server/regles/edition.ts"));
    expect(edition).toContain("destinationDeLEnregistrement(versions.map(versionDe))");
    expect(edition).toContain("exigerUneVersionJamaisPubliee(versionDe(source))");
    const lecture = sansCommentaires(lire("src/server/lecture/backoffice.ts"));
    expect(lecture).toContain("lues.find(estEnVigueur)");
    expect(lecture).toContain("lues.find(estUnBrouillon)");
    expect(lecture).not.toMatch(/versions\.find\(\(v\) => v\.status === "DRAFT"\)/u);
  });

  /** Et le serveur écrit ce qu'elle dit, jamais la ligne de l'adresse. */
  it("le serveur suit la destination, et refuse d'écrire en ligne", () => {
    const edition = lire("src/server/regles/edition.ts");
    expect(edition).toContain("destinationDeLEnregistrement(");
    expect(edition).toMatch(/destination\.quoi === "brouillon"/u);
    expect(edition).toMatch(/status: "DRAFT"/u);
    // La dernière ligne d'INV-3 : on n'écrit jamais dans ce que le
    // candidat lit, et le garde-fou l'affirme sur la ligne visée.
    expect(edition).toContain("exigerUnEnregistrementAffichable(source, ecrit)");
    // Une version qui naît n'est en vigueur nulle part.
    expect(edition).not.toMatch(/publishedAt:/u);
  });

  /** La fumée exécute ce que ces lignes ne font que lire. */
  it("la fumée tient INV-3 sur une base réelle", () => {
    const fumee = lire("scripts/fumee-publication.mts");
    expect(fumee).toContain("la version que le dossier a figée n'a pas bougé — INV-3");
    expect(fumee).toContain("publier ne migre personne (INV-3)");
  });
});

/* ------------------------------------------------------------------ *
 * Le sens inverse : aucun acte du back-office sans sa trace — S.96
 * ------------------------------------------------------------------ */

/**
 * Le garde-fou précédent tient un sens : une action déclarée a un
 * écrivain. Il ne tenait pas l'autre, et c'est par là que deux actes sont
 * passés.
 *
 * `MENTION_AUDIT` — « Chaque action est horodatée au journal d'audit avec
 * ton identifiant » — est affichée sur six écrans du back-office. Sa
 * raison d'être est dans son commentaire : « l'opérateur doit savoir
 * qu'il est tracé **avant** d'agir, pas après : c'est ce qui rend le
 * journal dissuasif plutôt que punitif. » Une dissuasion fausse sur un
 * point est une dissuasion qui se découvre.
 *
 * Deux routes écrivaient sans laisser de ligne :
 *
 * - `admin/contenus` (POST) créait un guide ou un article — la seule
 *   action de l'écran qui porte la mention. Créer un consultant se
 *   journalise depuis B-09 ; créer la page qu'un public lira, non.
 * - `admin/veille` (PUT) remettait en ligne une fiche que l'échéance
 *   avait dépubliée. Son commentaire écartait la ligne d'audit au nom de
 *   RG-14.4 — ce qui vaut pour la relecture et non pour la remise en
 *   ligne : `verifiedAt` et `verifiedBy` disent qui a relu, pas qu'une
 *   règle est redevenue visible.
 */
describe("aucune route du back-office n'écrit sans laisser de trace", () => {
  const ROUTES_ADMIN = fichiers("src/app/api/admin").filter((f) => f.endsWith("/route.ts"));

  const ECRITURE =
    /db\.[a-zA-Z]+\.(?:update|updateMany|create|createMany|delete|deleteMany|upsert)\(/u;

  it("il y a des routes à vérifier", () => {
    expect(ROUTES_ADMIN.length).toBeGreaterThan(10);
  });

  /**
   * Une route qui écrit journalise, ou délègue à un module qui le fait.
   * Le critère porte sur la route **et** ce qu'elle appelle : B-02 et B-05
   * ont sorti leur décision de `next/headers`, et la ligne est partie
   * avec elle.
   */
  it("toute route qui écrit porte sa ligne, ici ou dans ce qu'elle appelle", () => {
    const muettes = ROUTES_ADMIN.filter((f) => {
      const route = sansCommentaires(lire(f));
      if (route.includes("journaliser(")) return false;

      /*
        Qui écrit journalise. La première version de ce garde-fou
        absolvait une route dès qu'un module appelé quelque part dans ses
        imports journalisait — et `admin/contenus` importe la lecture
        éditoriale, qui en contient une. La mutation qui retirait sa
        ligne passait donc au vert ici : c'est l'ancien garde-fou, celui
        des actions sans écrivain, qui l'a rattrapée. Cinquième fois de
        la série qu'un garde-fou ne connaît que la forme pour laquelle il
        a été écrit.

        Le critère juste sépare les deux cas : une route qui écrit
        elle-même porte sa ligne ; une route qui délègue l'écriture est
        couverte par le module auquel elle la confie.
      */
      if (ECRITURE.test(route)) return true;

      const delegue = [...route.matchAll(/from "(@\/server\/[a-z/-]+)"/gu)].map(
        (m) => `src/${m[1]!.slice(2)}.ts`,
      );
      const ecrivains = delegue.filter(
        (m) => existsSync(m) && ECRITURE.test(sansCommentaires(lire(m))),
      );
      if (ecrivains.length === 0) return false;
      return !ecrivains.some((m) => sansCommentaires(lire(m)).includes("journaliser("));
    });
    expect(muettes).toEqual([]);
  });

  /** Et les deux actes qui manquaient portent chacun son nom. */
  it("la création d'un contenu et la remise en ligne d'une fiche sont nommées", () => {
    const journal = lire("src/server/acces/journal.ts");
    expect(journal).toContain('| "contenu.creation"');
    expect(journal).toContain('| "regle.republication"');
    // Nommées ne suffit pas : le garde-fou d'en face exige un écrivain,
    // et la table des catégories de B-06 exige un classement.
    const categories = lire("src/server/lecture/backoffice.ts");
    expect(categories).toContain('"contenu.creation": "REGLE"');
    expect(categories).toContain('"regle.republication": "REGLE"');
  });
});
