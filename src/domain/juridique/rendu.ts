import type { Bloc } from "@/domain/editorial/document";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte, type Faute } from "@/domain/copy/vocabulaire-interdit";
import { CLES_DU_PRODUIT, variablesDuProduit, type ModeleJuridique } from "@/domain/juridique/modeles";
import { variable, type Valeurs } from "@/domain/juridique/variables";

/**
 * Le rendu d'un texte juridique : modèle et variables — S.101.
 *
 * ── Trois règles ────────────────────────────────────────────────────
 *
 * 1. **Une variable obligatoire vide est un manque, jamais un blanc.**
 *    Le rendu la nomme dans `manquantes`, et la publication refuse tant
 *    que la liste n'est pas vide. Rien n'est remplacé par « à compléter »
 *    dans une page publique.
 * 2. **Une variable facultative vide efface son passage.** « Téléphone : »
 *    suivi de rien n'est pas une information, c'est un trou.
 * 3. **Le produit fournit ce qu'il sait.** La grille des prix vient de
 *    `pricing.ts`, pas d'un champ qu'on oublierait de mettre à jour.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

const MOTIF = /\{\{([a-z_]+)\}\}/gu;
const SEUL = /^\{\{([a-z_]+)\}\}$/u;

const clesDe = (texte: string): string[] => [...texte.matchAll(MOTIF)].map((m) => m[1]!);

const textesDuBloc = (bloc: Bloc): string[] => {
  switch (bloc.type) {
    case "paragraphe":
    case "intertitre":
    case "citation":
      return [bloc.texte];
    case "encadre":
      return [bloc.titre, bloc.texte];
    case "liste":
      return [...bloc.items];
  }
};

/** Les variables qu'un modèle emploie, hors celles que le produit fournit. */
export function variablesDuModele(modele: ModeleJuridique): readonly string[] {
  const cles = new Set<string>();
  for (const bloc of modele.blocs) for (const t of textesDuBloc(bloc)) for (const c of clesDe(t)) cles.add(c);
  return [...cles].filter((c) => !(CLES_DU_PRODUIT as readonly string[]).includes(c));
}

/**
 * L'empreinte d'un modèle : FNV-1a sur sa forme sérialisée.
 *
 * Enregistrée à chaque validation, elle dit si le texte validé est encore
 * celui du dépôt. Un mot changé ici change l'empreinte, et la version
 * publiée passe « à revalider » — sans numéro de version à tenir à la
 * main, que personne ne penserait à incrémenter.
 */
export function empreinte(modele: ModeleJuridique): string {
  const texte = JSON.stringify({ titre: modele.titre, chapeau: modele.chapeau, blocs: modele.blocs });
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface Rendu {
  titre: string;
  chapeau: string;
  blocs: Bloc[];
  /** Les variables obligatoires vides : la publication les attend. */
  manquantes: readonly string[];
  /** Les valeurs réellement employées, pour la version publiée. */
  employees: Readonly<Record<string, string>>;
}

/** Les paragraphes d'une valeur de plusieurs lignes : séparés par une ligne vide. */
const paragraphesDe = (valeur: string): string[] =>
  valeur
    .split(/\n\s*\n/u)
    .map((s) => s.replace(/\s*\n\s*/gu, " ").trim())
    .filter(Boolean);

/** Les éléments d'une valeur de liste : un par ligne, puces de saisie retirées. */
const elementsDe = (valeur: string): string[] =>
  valeur
    .split("\n")
    .map((s) => s.replace(/^\s*[-•*]\s*/u, "").trim())
    .filter(Boolean);

export function rendre(modele: ModeleJuridique, valeursSaisies: Valeurs): Rendu {
  const valeurs: Record<string, string> = { ...valeursSaisies, ...variablesDuProduit() };
  const manquantes = new Set<string>();
  const employees: Record<string, string> = {};

  const valeurDe = (cle: string): string | null => {
    const v = (valeurs[cle] ?? "").trim();
    if (v !== "") {
      if (!(CLES_DU_PRODUIT as readonly string[]).includes(cle)) employees[cle] = v;
      return v;
    }
    // Une clé que le registre ignore est un défaut du modèle : elle se
    // lit comme une variable obligatoire manquante, et un test l'interdit.
    if (!variable(cle)?.facultative) manquantes.add(cle);
    return null;
  };

  /** Le texte, variables substituées ; `null` si un passage facultatif s'efface. */
  const substituer = (texte: string): string | null => {
    let efface = false;
    const rendu = texte.replace(MOTIF, (_m, cle: string) => {
      const v = valeurDe(cle);
      if (v === null) {
        efface = true;
        return "";
      }
      return v.replace(/\s*\n\s*/gu, " ");
    });
    return efface ? null : rendu;
  };

  const blocs: Bloc[] = [];
  for (const bloc of modele.blocs) {
    switch (bloc.type) {
      case "paragraphe": {
        const seul = SEUL.exec(bloc.texte);
        if (seul) {
          const v = valeurDe(seul[1]!);
          if (v !== null) for (const texte of paragraphesDe(v)) blocs.push({ type: "paragraphe", texte });
          break;
        }
        const texte = substituer(bloc.texte);
        if (texte !== null) blocs.push({ type: "paragraphe", texte });
        break;
      }
      case "liste": {
        const items: string[] = [];
        for (const item of bloc.items) {
          const seul = SEUL.exec(item);
          if (seul) {
            const v = valeurDe(seul[1]!);
            if (v !== null) items.push(...elementsDe(v));
            continue;
          }
          const texte = substituer(item);
          if (texte !== null) items.push(texte);
        }
        if (items.length > 0) blocs.push({ type: "liste", items });
        break;
      }
      case "encadre": {
        const titre = substituer(bloc.titre);
        const texte = substituer(bloc.texte);
        if (titre !== null && texte !== null) blocs.push({ type: "encadre", titre, texte });
        break;
      }
      case "intertitre":
      case "citation": {
        const texte = substituer(bloc.texte);
        if (texte !== null) blocs.push({ ...bloc, texte });
        break;
      }
    }
  }

  return {
    titre: modele.titre,
    chapeau: modele.chapeau,
    blocs,
    manquantes: [...manquantes],
    employees,
  };
}

/**
 * Le vocabulaire interdit, sur le texte rendu : variables comprises.
 *
 * Les pages juridiques sont publiques : c'est la portée de l'interface
 * candidat qui s'applique. La négation reste reconnue — « ImmiPro ne
 * garantit ni l'obtention d'un visa » est la phrase qui protège.
 */
export function fautesDuRendu(rendu: Pick<Rendu, "titre" | "chapeau" | "blocs">): Faute[] {
  const textes = [rendu.titre, rendu.chapeau, ...rendu.blocs.flatMap(textesDuBloc)];
  return textes.flatMap((t) => verifierTexte(t, INTERDITS_ECRAN_CANDIDAT));
}
