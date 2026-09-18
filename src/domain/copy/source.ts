/**
 * Extraction des chaînes affichables d'un fichier source.
 *
 * Le garde-fou de vocabulaire lit du code. Une expression régulière sur les
 * guillemets confond une apostrophe de commentaire avec un début de chaîne :
 * « le bouton de téléchargement vient avant celui de clôture » devenait un
 * littéral, et le commentaire qui *explique* l'interdit se faisait refuser
 * par l'interdit. Un garde-fou qui punit sa propre justification finit
 * contourné.
 *
 * L'extraction est donc un vrai balayage : commentaires et littéraux
 * d'expression régulière sont écartés, seules les chaînes restent. Une seule
 * extraction pour le script `check:copy` et pour le test, comme il n'y a
 * qu'une liste de mots.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Caractères après lesquels un `/` ouvre une expression régulière, pas une division. */
const AVANT_REGEX = new Set("(,=:[!&|?{};+-*%~^<>".split(""));

export function extraireChaines(source: string): string[] {
  const chaines: string[] = [];
  let i = 0;
  let precedent = "";

  const significatif = (c: string) => !/\s/.test(c);

  while (i < source.length) {
    const c = source[i]!;
    const suivant = source[i + 1];

    if (c === "/" && suivant === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && suivant === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === "/" && (precedent === "" || AVANT_REGEX.has(precedent))) {
      i += 1;
      let classe = false;
      while (i < source.length) {
        const r = source[i]!;
        if (r === "\\") i += 1;
        else if (r === "[") classe = true;
        else if (r === "]") classe = false;
        else if (r === "/" && !classe) break;
        else if (r === "\n") break;
        i += 1;
      }
      i += 1;
      precedent = "/";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const ouvrant = c;
      let valeur = "";
      i += 1;
      while (i < source.length) {
        const r = source[i]!;
        if (r === "\\") {
          valeur += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (r === ouvrant) break;
        valeur += r;
        i += 1;
      }
      i += 1;
      chaines.push(valeur);
      precedent = ouvrant;
      continue;
    }

    if (significatif(c)) precedent = c;
    i += 1;
  }

  return chaines;
}
