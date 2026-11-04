/**
 * Réinitialiser la double authentification d'un compte depuis la console du
 * serveur — S.215.
 *
 * La double authentification est obligatoire pour les comptes internes.
 * Un super-administrateur qui perd téléphone et codes de secours est
 * réinitialisé par un autre, depuis B-03. S'il n'en reste aucun qui puisse
 * ouvrir le back-office, c'est ici — comme le premier super-administrateur
 * se nomme par `changer-role` (S.115). Même transaction, même journal :
 * second facteur, codes et sessions partent, la ligne
 * `compte.second_facteur.reinitialisation` porte « console:<nom> » et le motif.
 *
 * En production, depuis l'image :
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/reinitialiser-second-facteur.mjs \
 *       --email awa@exemple.com --par "Awa Koffi" \
 *       --motif "Téléphone perdu, identité vérifiée en personne le 05/11"
 *
 * En local : `npm run compte:second-facteur -- --email … --par … --motif …`.
 */
import { MOTIF_MAX, MOTIF_MIN, auteurConsole } from "../src/domain/comptes/role";

const USAGE =
  'Usage : node dist/reinitialiser-second-facteur.mjs --email <adresse> --par "<nom de l\'opérateur>" --motif "<pourquoi>"';

const argv = process.argv.slice(2);
const valeur = (nom: string): string => {
  const i = argv.indexOf(`--${nom}`);
  return i >= 0 && i + 1 < argv.length ? (argv[i + 1] ?? "").trim() : "";
};
const email = valeur("email").toLowerCase();
const par = valeur("par");
const motif = valeur("motif");
const erreurs: string[] = [];
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) erreurs.push("--email : une adresse électronique valide est attendue.");
if (par.length < 2) erreurs.push("--par : le nom de l'opérateur ; il figure au journal comme auteur.");
if (motif.length < MOTIF_MIN || motif.length > MOTIF_MAX) {
  erreurs.push(`--motif : entre ${MOTIF_MIN} et ${MOTIF_MAX} caractères, qui disent comment l'identité a été vérifiée.`);
}
if (erreurs.length > 0) {
  console.error(erreurs.map((e) => `✗ ${e}`).join("\n"));
  console.error(`\n${USAGE}`);
  process.exit(2);
}

const { db } = await import("../src/lib/db");
const { reinitialiserLeSecondFacteur } = await import("../src/server/comptes/second-facteur");
const { EchecHttp } = await import("../src/server/http/echecs");

let code = 0;
try {
  const cible = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!cible) {
    console.error(`✗ Aucun compte pour ${email}.`);
    code = 1;
  } else {
    const issue = await reinitialiserLeSecondFacteur({ id: auteurConsole(par) }, cible.id, motif);
    console.log(
      `✓ ${email} : double authentification retirée, ${issue.sessionsFermees} session(s) fermée(s). La personne se connecte avec son mot de passe et la réactive depuis « Sécurité du compte ». Inscrit au journal d'audit (compte.second_facteur.reinitialisation, par « ${par} »).`,
    );
  }
} catch (erreur) {
  if (erreur instanceof EchecHttp) {
    console.error(`✗ ${erreur.echec.corps}`);
    code = 1;
  } else {
    throw erreur;
  }
} finally {
  await db.$disconnect();
}
process.exit(code);
