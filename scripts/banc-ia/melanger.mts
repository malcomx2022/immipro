/**
 * Prépare la relecture à l'aveugle des lettres du banc IA (S.99).
 *
 *     npm run banc:ia:aveugle -- banc-ia-resultats/anthropic-… banc-ia-resultats/openai_compatible-…
 *
 * Pour chaque cas de rédaction, les lettres des fournisseurs passés au
 * banc sont rangées sous des lettres neutres (A, B, C…), tirées au sort
 * cas par cas : la même lettre ne désigne pas le même fournisseur d'un cas
 * à l'autre. Les relecteurs reçoivent `grille.md` et le dossier
 * `lettres/` ; `correspondance.json` ne s'ouvre qu'une fois les grilles
 * remplies.
 *
 * Ce que la grille demande se juge mieux par une personne que par un
 * script : le texte reste-t-il fidèle aux réponses, se lit-il, tient-il
 * le registre d'une pièce déposée auprès d'une administration ?
 */
import { randomInt } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CAS_DE_REDACTION } from "@/domain/banc-ia/jeu-d-essai";

const dossiers = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (dossiers.length < 2) {
  console.error("Indique au moins deux dossiers de résultats du banc, un par fournisseur.");
  process.exit(1);
}

const melanger = <T,>(liste: readonly T[]): T[] => {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copie[i], copie[j]] = [copie[j]!, copie[i]!];
  }
  return copie;
};

async function main() {
  const passages = await Promise.all(
    dossiers.map(async (d) => {
      const resultat = JSON.parse(await readFile(path.join(d, "resultats.json"), "utf8")) as {
        fournisseur: string;
        modele: string;
      };
      const fichiers = await readdir(path.join(d, "lettres")).catch(() => [] as string[]);
      return { dossier: d, nom: `${resultat.fournisseur} · ${resultat.modele}`, fichiers };
    }),
  );

  const sortie = path.resolve(
    "banc-ia-resultats",
    `aveugle-${new Date().toISOString().replace(/[:.]/gu, "-").slice(0, 19)}`,
  );
  await mkdir(path.join(sortie, "lettres"), { recursive: true });

  const correspondance: Record<string, Record<string, string>> = {};
  const sections: string[] = [];

  for (const cas of CAS_DE_REDACTION) {
    const presents = passages.filter((p) => p.fichiers.includes(`${cas.id}.txt`));
    if (presents.length === 0) continue;
    const tires = melanger(presents);
    correspondance[cas.id] = {};
    const lignes: string[] = [];
    for (const [i, passage] of tires.entries()) {
      const code = String.fromCharCode(65 + i);
      correspondance[cas.id]![code] = passage.nom;
      const texte = await readFile(path.join(passage.dossier, "lettres", `${cas.id}.txt`), "utf8");
      await writeFile(path.join(sortie, "lettres", `${cas.id}-${code}.txt`), texte);
      lignes.push(`| ${code} | | | | | |`);
    }
    sections.push(`## ${cas.id} — ${cas.objet}

Destination : ${cas.pays}.${cas.piege ? ` Piège : ${cas.piege}` : ""}

Les réponses du candidat, seule matière autorisée :

${Object.entries(cas.reponses)
  .map(([q, r]) => `- *${q}* — ${r}`)
  .join("\n")}

| Lettre | Fidèle aux réponses (oui / non, et quoi) | Se lit sans peine (1 à 4) | Registre d'une pièce administrative (1 à 4) | Aucune promesse de résultat (oui / non) | Préférée |
|---|---|---|---|---|---|
${lignes.join("\n")}
`);
  }

  await writeFile(
    path.join(sortie, "grille.md"),
    `# Relecture à l'aveugle — banc IA

Deux relecteurs remplissent chacun leur grille, sans se concerter et sans ouvrir \`correspondance.json\`. Les lettres sont dans \`lettres/\`, nommées par cas et par lettre neutre.

« Fidèle » est le critère qui compte : une lettre qui ajoute un fait (une date, un montant, un établissement, une intention) est écartée, quelle que soit sa qualité d'écriture. Elle sera déposée au nom du candidat.

${sections.join("\n")}`,
  );
  await writeFile(path.join(sortie, "correspondance.json"), JSON.stringify(correspondance, null, 2));

  console.log(`Relecture à l'aveugle prête : ${path.relative(process.cwd(), sortie)}`);
  console.log("Remettre grille.md et lettres/ aux relecteurs ; garder correspondance.json de côté.");
}

await main();
