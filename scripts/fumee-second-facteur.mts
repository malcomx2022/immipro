/**
 * Double authentification, sessions et seuils du sommet, sur une base
 * réelle — S.214.
 *
 * Ce que les tests unitaires ne peuvent pas prouver : les écritures
 * conditionnelles tiennent contre des appels **simultanés**, la
 * transaction sérialisable refuse deux retraits du sommet en même temps,
 * le chiffrement survit à l'aller-retour en base, la contrainte refuse un
 * secret en clair.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:second-facteur
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_second_facteur_${process.pid}`;
const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${nomBase}`;
cible.searchParams.set("schema", "public");

const echecs: string[] = [];
const verifier = (condition: boolean, message: string): void => {
  console.log(condition ? `  ✓ ${message}` : `  ✗ ${message}`);
  if (!condition) echecs.push(message);
};

async function surLAdministration(texte: string): Promise<void> {
  const client = new Client({ connectionString: administration.toString() });
  await client.connect();
  try {
    await client.query(texte);
  } finally {
    await client.end();
  }
}

console.log(`Double authentification et sessions sur une base jetable (${nomBase})`);
await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await surLAdministration(`CREATE DATABASE ${nomBase}`);
const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  encoding: "utf8",
  env: { ...process.env, DATABASE_URL: cible.toString() },
});
if (migration.status !== 0) {
  console.error(`${migration.stdout ?? ""}${migration.stderr ?? ""}`);
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  process.exit(1);
}

process.env.DATABASE_URL = cible.toString();
process.env.DEUX_FACTEURS_CLE = randomBytes(32).toString("base64");

const { db } = await import("../src/lib/db");
const { empreinte, empreinteRapide } = await import("../src/server/securite/secret");
const { hmacSha1 } = await import("../src/server/securite/totp");
const { codeAuPas, depuisBase32, pasDeTemps, ECHECS_AVANT_BLOCAGE_2FA, ESSAIS_PAR_DEFI } = await import(
  "../src/domain/comptes/deux-facteurs"
);
const sf = await import("../src/server/comptes/second-facteur");
const { suspendreOuRetablir } = await import("../src/server/comptes/gestion");
const { appliquerLeChangementDeRole } = await import("../src/server/comptes/role");
const { EchecHttp } = await import("../src/server/http/echecs");

const MOT_DE_PASSE = "mot-de-passe-de-fumee";
const jour = () => new Date(Date.now() + 86_400_000);
const codeAt = (secret: string, decalage = 0, t = Date.now()) =>
  codeAuPas(depuisBase32(secret)!, pasDeTemps(t) + decalage, hmacSha1);
/** Le pas de trente secondes ne doit pas basculer au milieu d'une vérification. */
const attendreDebutDePas = async () => {
  const dans = (Date.now() / 1000) % 30;
  if (dans > 20) await new Promise((ok) => setTimeout(ok, (30 - dans + 0.5) * 1000));
};
/** `ouvrirUnDefi` remplace le précédent : les défis en plus sont insérés à la main. */
const defisEnPlus = async (userId: string, n: number): Promise<string[]> => {
  const valeurs: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const valeur = randomBytes(16).toString("base64url");
    await db.defiDeConnexion.create({
      data: { jetonHash: empreinteRapide(valeur), userId, expireLe: new Date(Date.now() + 300_000) },
    });
    valeurs.push(valeur);
  }
  return valeurs;
};
const ouvrirSessions = async (userId: string, n: number) => {
  for (let i = 0; i < n; i += 1) {
    await db.session.create({
      data: { tokenHash: `fumee-${userId}-${i}-${randomBytes(4).toString("hex")}`, userId, expiresAt: jour() },
    });
  }
};

try {
  const hash = await empreinte(MOT_DE_PASSE);
  const awa = await db.user.create({
    data: { email: `awa-${process.pid}@exemple.test`, passwordHash: hash, emailVerified: new Date() },
  });

  console.log("\nEnrôlement et activation");
  let refuse = false;
  try {
    await sf.preparerLEnrolement(awa, "faux-mot-de-passe");
  } catch (e) {
    refuse = e instanceof EchecHttp && e.echec.code === "champs_invalides";
  }
  verifier(refuse && (await db.secondFacteur.count()) === 0, "un mauvais mot de passe ne prépare rien");

  await attendreDebutDePas();
  const { secret, adresse } = await sf.preparerLEnrolement(awa, MOT_DE_PASSE);
  const ligne = await db.secondFacteur.findUniqueOrThrow({ where: { userId: awa.id } });
  verifier(adresse.startsWith("otpauth://totp/ImmiPro:") && adresse.includes(`secret=${secret}`), "l'adresse du code QR porte le secret");
  verifier(!ligne.secretChiffre.includes(secret) && ligne.secretChiffre.startsWith("v1."), "le secret est chiffré en base, jamais en clair");
  verifier(ligne.activeLe === null && !(await sf.secondFacteurExige(awa.id)), "préparé n'est pas actif : la connexion ne l'exige pas");

  let contrainte = false;
  try {
    await db.secondFacteur.update({ where: { id: ligne.id }, data: { secretChiffre: secret } });
  } catch {
    contrainte = true;
  }
  verifier(contrainte, "la base refuse un secret écrit en clair (second_facteur_secret_chiffre)");

  await ouvrirSessions(awa.id, 2);
  await db.session.create({ data: { tokenHash: empreinteRapide("jeton-courant"), userId: awa.id, expiresAt: jour() } });
  const activation = await sf.activerLeSecondFacteur(awa, codeAt(secret), "jeton-courant");
  verifier(activation.codesDeSecours.length === 10 && activation.codesDeSecours.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/u.test(c)), "dix codes de secours, rendus une fois");
  verifier(activation.sessionsFermees === 2, "les deux autres sessions sont fermées");
  verifier(
    (await db.session.count({ where: { userId: awa.id, tokenHash: empreinteRapide("jeton-courant") } })) === 1,
    "la session qui active reste ouverte",
  );
  const codes = await db.codeDeSecours.findMany({ where: { userId: awa.id } });
  verifier(
    codes.length === 10 && codes.every((c) => !activation.codesDeSecours.some((clair) => c.empreinte.includes(clair.replace("-", "")))),
    "les codes de secours ne sont gardés qu'en empreinte",
  );
  verifier((await db.auditLog.count({ where: { action: "compte.second_facteur.activation", target: `user:${awa.id}` } })) === 1, "l'activation est journalisée");

  console.log("\nConnexion : défi, anti-rejeu, usage unique");
  // Le code de l'activation a consommé le pas courant : un nouveau défi
  // avec ce même code est un rejeu.
  const d1 = await sf.ouvrirUnDefi(awa.id, true, "fumee");
  const rejeu = await sf.repondreAuDefi(d1.valeur, codeAt(secret));
  verifier(rejeu.issue === "refuse" && /déjà de servir/u.test(rejeu.issue === "refuse" ? rejeu.message : ""), "le code de l'activation, rejoué, est refusé");

  // Le pas suivant (décalage +1, dans la fenêtre) : deux défis, envoyés en même temps.
  await attendreDebutDePas();
  const suivant = codeAt(secret, 1);
  // Vingt défis ouverts pour le même compte, et le même code envoyé à
  // tous au même instant : sans l'écriture conditionnée au dernier pas,
  // plusieurs liraient l'ancien et ouvriraient chacun une connexion.
  const da = await sf.ouvrirUnDefi(awa.id, false, "a");
  const autres = await defisEnPlus(awa.id, 19);
  const simultanes = await Promise.all([da.valeur, ...autres].map((v) => sf.repondreAuDefi(v, suivant)));
  verifier(
    simultanes.filter((r) => r.issue === "ouverte").length === 1,
    `le même code envoyé vingt fois en même temps n'ouvre qu'une connexion (${simultanes.map((r) => r.issue).join(", ")})`,
  );
  const facteur = await db.secondFacteur.findUniqueOrThrow({ where: { userId: awa.id } });
  verifier(facteur.derive === 1, "le décalage d'horloge du téléphone est retenu (un pas)");
  verifier(facteur.echecs === 0, "les rejeux perdants ne comptent pas comme des codes faux");

  const gagnant = [da.valeur, ...autres][simultanes.findIndex((r) => r.issue === "ouverte")]!;
  const servi = await sf.repondreAuDefi(gagnant, suivant);
  verifier(servi.issue === "expire", "un défi servi ne s'achève pas deux fois");

  console.log("\nCodes de secours");
  const [premier] = activation.codesDeSecours as [string];
  const d2 = await sf.ouvrirUnDefi(awa.id, false, "x");
  const d3 = await defisEnPlus(awa.id, 19);
  const secours = await Promise.all(
    [d2.valeur, ...d3].map((v, i) => sf.repondreAuDefi(v, i % 2 ? premier : premier.toLowerCase())),
  );
  verifier(
    secours.filter((r) => r.issue === "ouverte").length === 1,
    `un code de secours ne sert qu'une fois, même en vingt appels simultanés (${secours.map((r) => r.issue).join(", ")})`,
  );
  verifier((await db.codeDeSecours.count({ where: { userId: awa.id, utiliseLe: null } })) === 9, "il en reste neuf");
  verifier(
    (await db.secondFacteur.findUniqueOrThrow({ where: { userId: awa.id } })).echecs === 0,
    "un code de secours déjà servi, rejoué, ne compte pas comme un code faux",
  );
  verifier((await db.auditLog.count({ where: { action: "compte.second_facteur.secours" } })) === 1, "la connexion par code de secours est journalisée");

  console.log("\nBlocage avec hystérésis");
  await db.secondFacteur.update({ where: { userId: awa.id }, data: { echecs: 0, bloqueJusqua: null } });
  const d4 = await sf.ouvrirUnDefi(awa.id, false, "x");
  let derniere: Awaited<ReturnType<typeof sf.repondreAuDefi>> = { issue: "expire" };
  for (let i = 0; i < ESSAIS_PAR_DEFI; i += 1) derniere = await sf.repondreAuDefi(d4.valeur, "000000");
  const bloque = await db.secondFacteur.findUniqueOrThrow({ where: { userId: awa.id } });
  verifier(
    bloque.echecs === ECHECS_AVANT_BLOCAGE_2FA && bloque.bloqueJusqua !== null && derniere.issue === "refuse" && derniere.bloque,
    "cinq codes faux bloquent le second facteur",
  );
  verifier((await sf.repondreAuDefi(d4.valeur, codeAt(secret, 1))).issue === "expire", "le défi épuisé ne répond plus, même à un code juste");
  const d5 = await sf.ouvrirUnDefi(awa.id, false, "x");
  const pendant = await sf.repondreAuDefi(d5.valeur, activation.codesDeSecours[2]!);
  verifier(pendant.issue === "refuse" && pendant.bloque, "pendant le blocage, même un code de secours est refusé");
  verifier((await db.codeDeSecours.count({ where: { userId: awa.id, utiliseLe: null } })) === 9, "et il n'est pas consommé");
  verifier((await db.auditLog.count({ where: { action: "compte.second_facteur.blocage" } })) === 1, "le blocage est journalisé une fois");

  // Levée : le compteur redescend à trois, pas à zéro.
  await db.secondFacteur.update({ where: { userId: awa.id }, data: { bloqueJusqua: new Date(Date.now() - 1000) } });
  const d6 = await sf.ouvrirUnDefi(awa.id, false, "x");
  await sf.repondreAuDefi(d6.valeur, "111111");
  const apresLevee = await db.secondFacteur.findUniqueOrThrow({ where: { userId: awa.id } });
  verifier(apresLevee.echecs === 4 && apresLevee.bloqueJusqua === null, `à la levée, un essai faux mène à 4 et non à 1 (hystérésis) — ${apresLevee.echecs}`);
  const rebloque = await sf.repondreAuDefi(d6.valeur, "222222");
  verifier(rebloque.issue === "refuse" && rebloque.bloque, "le deuxième essai faux après la levée rebloque");

  console.log("\nRéinitialisation par un super-administrateur");
  const sommet = await db.user.create({
    data: { email: `sommet-${process.pid}@exemple.test`, role: "SUPER_ADMIN", emailVerified: new Date() },
  });
  await ouvrirSessions(awa.id, 2);
  let courte = false;
  try {
    await sf.reinitialiserLeSecondFacteur(sommet, awa.id, "court");
  } catch (e) {
    courte = e instanceof EchecHttp;
  }
  verifier(courte && (await sf.secondFacteurExige(awa.id)), "sans motif suffisant, rien ne part");
  const reinit = await sf.reinitialiserLeSecondFacteur(sommet, awa.id, "Téléphone perdu, identité vérifiée par visioconférence");
  verifier(
    reinit.reinitialise &&
      !(await sf.secondFacteurExige(awa.id)) &&
      (await db.codeDeSecours.count({ where: { userId: awa.id } })) === 0 &&
      (await db.session.count({ where: { userId: awa.id } })) === 0,
    "second facteur, codes et sessions partent ensemble",
  );
  const trace = await db.auditLog.findFirst({ where: { action: "compte.second_facteur.reinitialisation" } });
  verifier(trace?.actorId === sommet.id && /visioconférence/u.test(trace.reason), "la trace porte l'auteur et le motif");

  console.log("\nSeuil du sommet, sous transactions simultanées");
  const s2 = await db.user.create({
    data: { email: `sommet2-${process.pid}@exemple.test`, role: "SUPER_ADMIN", emailVerified: new Date() },
  });
  const s3 = await db.user.create({
    data: { email: `sommet3-${process.pid}@exemple.test`, role: "SUPER_ADMIN", emailVerified: new Date() },
  });
  // Trois actifs, trois suspensions croisées au même instant. Joués à la
  // suite, le troisième geste serait refusé (il ne resterait qu'un actif) ;
  // joués ensemble sans transaction sérialisable, les trois liraient « 3 »
  // et la plateforme n'aurait plus de sommet. Un acteur suspendu entre-temps
  // ne suspend plus personne.
  const acteurDe = (u: { id: string; email: string; role: string }) => ({ id: u.id, email: u.email, role: u.role as "SUPER_ADMIN", emailVerifie: true });
  const issue = await Promise.allSettled([
    suspendreOuRetablir(acteurDe(sommet), { userId: s2.id, suspendre: true, motif: "Départ de l'équipe" }),
    suspendreOuRetablir(acteurDe(s2), { userId: s3.id, suspendre: true, motif: "Départ de l'équipe" }),
    suspendreOuRetablir(acteurDe(s3), { userId: sommet.id, suspendre: true, motif: "Départ de l'équipe" }),
  ]);
  const actifs = await db.user.count({ where: { role: "SUPER_ADMIN", suspendedAt: null, deletedAt: null } });
  verifier(actifs >= 1, `trois suspensions croisées simultanées laissent au moins un sommet actif (${actifs}, ${issue.map((r) => r.status).join("/")})`);
  const reussies = issue.filter((r) => r.status === "fulfilled").length;
  verifier(reussies <= 2, `au plus deux des trois aboutissent (${reussies})`);
  const refusesProprement = issue
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .every(
      (r) =>
        r.reason instanceof EchecHttp &&
        // Course perdue, ou auteur suspendu entre-temps : deux refus qui disent quoi faire.
        (r.reason.echec.code === "etat_incompatible" || r.reason.echec.code === "droits_insuffisants"),
    );
  verifier(
    refusesProprement,
    `chaque perdant reçoit un refus actionnable, jamais une erreur brute (${issue
      .map((r) => (r.status === "rejected" ? (r.reason instanceof EchecHttp ? r.reason.echec.code : String(r.reason)) : "ok"))
      .join(", ")})`,
  );
  const lignesSuspension = await db.auditLog.count({ where: { action: "compte.suspension" } });
  const suspendus = await db.user.count({ where: { role: "SUPER_ADMIN", suspendedAt: { not: null } } });
  verifier(lignesSuspension === suspendus, `une ligne de journal par suspension réelle, aucune pour un perdant (${lignesSuspension}/${suspendus})`);

  console.log("\nChangement de rôle et suspension d'un candidat");
  const candidat = await db.user.create({ data: { email: `cand-${process.pid}@exemple.test`, emailVerified: new Date() } });
  const admin = await db.user.create({ data: { email: `admin-${process.pid}@exemple.test`, role: "ADMIN", emailVerified: new Date() } });
  await ouvrirSessions(candidat.id, 3);
  const actifSommet = (await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", suspendedAt: null } }));
  const [promotion, suspension] = await Promise.allSettled([
    appliquerLeChangementDeRole({
      cible: { id: candidat.id },
      vers: "SUPER_ADMIN",
      motif: "Renfort de la super-administration",
      auteur: { genre: "compte", id: actifSommet.id, role: "SUPER_ADMIN" },
    }),
    suspendreOuRetablir(acteurDe({ ...admin, role: "ADMIN" }) as never, { userId: candidat.id, suspendre: true, motif: "Signalement de fraude" }),
  ]);
  const relu = await db.user.findUniqueOrThrow({ where: { id: candidat.id } });
  verifier(
    [promotion, suspension].every(
      (r) => r.status === "fulfilled" || (r.reason instanceof EchecHttp && r.reason.echec.code === "etat_incompatible"),
    ),
    `le perdant de la course reçoit un refus actionnable (${[promotion, suspension]
      .map((r) => (r.status === "rejected" ? (r.reason instanceof EchecHttp ? r.reason.echec.code : String(r.reason)) : "ok"))
      .join(", ")})`,
  );
  verifier(
    !(relu.role === "SUPER_ADMIN" && relu.suspendedAt !== null),
    `un administrateur ne suspend pas un compte promu au sommet au même instant (${promotion.status}/${suspension.status}, rôle ${relu.role}, suspendu ${relu.suspendedAt !== null})`,
  );
  verifier((await db.session.count({ where: { userId: candidat.id } })) === 0, "dans tous les cas, les sessions du compte sont fermées");

  const role = await db.auditLog.findFirst({ where: { action: "compte.role", target: `user:${candidat.id}` } });
  verifier(
    promotion.status !== "fulfilled" || (promotion.value.issue === "change" && role !== null),
    "un rôle changé porte sa ligne de journal",
  );
} finally {
  await db.$disconnect();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nToutes les vérifications passent.");
