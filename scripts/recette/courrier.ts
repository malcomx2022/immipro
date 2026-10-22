/**
 * Le code à six chiffres d'un courrier capturé par le banc — revue S.183.
 *
 * Seul le corps est lu. Retirer les coupures quoted-printable (`=\r\n`)
 * dans tout le message recollait aussi les en-têtes : l'objet encodé se
 * termine par `?=`, et « code » s'y retrouvait à quelques caractères du
 * `Message-ID`. Quand son UUID aléatoire commençait par six chiffres, le
 * banc journalisait un faux code ; la vérification de la recette échouait
 * quatre fois de suite, chaque renvoi tirant un nouvel UUID (porte de la
 * PR #301, Firefox 1 440 px).
 */
export function codeDuCourrier(brut: string): string | undefined {
  const separation = /\r?\n\r?\n/u.exec(brut);
  if (!separation) return undefined;
  const corps = brut.slice(separation.index + separation[0].length).replace(/=\r?\n/gu, "");
  return /code[^\n]{0,60}?(\d{6})/iu.exec(corps)?.[1];
}
