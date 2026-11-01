/**
 * Changer le rôle d'un compte, avec un motif et une trace au journal —
 * S.115.
 *
 * En production, depuis l'image (ni `tsx` ni les sources n'y sont) :
 *
 *     docker compose -f docker-compose.prod.yml run --rm app node dist/changer-role.mjs \
 *       --email awa@exemple.com --role ADMIN --par "Awa Koffi" \
 *       --motif "Responsable de la revue manuelle désigné par la direction le 03/10"
 *
 * En local : `npm run compte:role -- --email … --role … --par … --motif …`.
 *
 * Le premier super-administrateur (S.210) se nomme ici, et seulement ici :
 * aucun écran ne donne ce rôle tant qu'aucun super-administrateur n'existe.
 * La personne doit s'être inscrite et avoir vérifié son adresse :
 *
 *     npm run compte:role -- --email awa@exemple.com --role SUPER_ADMIN \
 *       --par "Awa Koffi" --motif "Premier super-administrateur désigné par la direction"
 *
 * Ses sessions ouvertes sont fermées : elle se reconnecte avec son rôle.
 */
import { lireLaDemande, USAGE } from "../src/domain/comptes/role";

const lue = lireLaDemande(process.argv.slice(2));
if (!lue.ok) {
  console.error(lue.erreurs.map((e) => `✗ ${e}`).join("\n"));
  console.error(`\n${USAGE}`);
  process.exit(2);
}

const { db } = await import("../src/lib/db");
const { changerLeRole } = await import("../src/server/comptes/role");

let code = 0;
try {
  const issue = await changerLeRole(lue.demande);
  if (issue.issue === "change") {
    console.log(
      `✓ ${lue.demande.email} : ${issue.de} → ${issue.vers}. ${issue.sessionsFermees} session(s) fermée(s) : la personne se reconnecte. Inscrit au journal d'audit (compte.role, par « ${lue.demande.par} »).`,
    );
  } else if (issue.issue === "inchange") {
    console.log(`= ${issue.raison}`);
  } else if (issue.issue === "introuvable") {
    console.error(`✗ Aucun compte pour ${lue.demande.email} : la personne doit d'abord s'inscrire sur /inscription.`);
    code = 1;
  } else {
    console.error(`✗ ${issue.raison}`);
    code = 1;
  }
} finally {
  await db.$disconnect();
}
process.exit(code);
