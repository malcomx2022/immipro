/**
 * Ouvre une vraie session dans le bac à sable des fournisseurs.
 *
 * C'est la seule vérification qui confronte les adaptateurs à un serveur
 * réel. Tout le reste — la forme des requêtes, les réponses inattendues,
 * l'enchaînement — s'éprouve sans réseau, et ne dit rien de l'exactitude
 * des champs qu'on envoie.
 *
 * **Sans clé, il s'abstient et le dit.** Il ne rend pas vert une
 * vérification qui n'a pas eu lieu : il annonce ce qu'il n'a pas pu
 * éprouver, et sort en succès parce qu'une absence de clé n'est pas une
 * régression.
 *
 * **Il refuse l'espace de production.** Une clé Stripe qui n'est pas une
 * clé de test, ou `FEDAPAY_ENVIRONMENT=live`, arrêtent le script : ouvrir
 * une session réelle depuis un poste de développement n'a rien à faire
 * ici, même si elle ne débite personne.
 *
 * Aucune valeur de clé n'est journalisée, ici comme ailleurs.
 *
 *     npm run sandbox:paiement
 */
import { cheminDeRetour, cleDOuverture } from "../src/domain/paiement/ouverture";
import { environnementNormalise, CLES } from "../src/server/paiement/secrets";
import { adaptateurFedaPay } from "../src/server/paiement/fedapay";
import { adaptateurStripe } from "../src/server/paiement/stripe";
import type { Ouvreur } from "../src/server/paiement/ouvreur";

const env = environnementNormalise();
const racine = (env.APP_URL ?? "").trim() || "https://exemple.test";
const retourAbsolu = (chemin: string): string => new URL(chemin, racine).toString();

const echecs: string[] = [];
const verifier = (condition: boolean, message: string): void => {
  console.log(condition ? `  ✓ ${message}` : `  ✗ ${message}`);
  if (!condition) echecs.push(message);
};

const renseignee = (v: string | undefined): string | null => {
  const propre = (v ?? "").trim();
  return propre === "" ? null : propre;
};

async function eprouver(nom: string, ouvreur: Ouvreur, montant: number, devise: "XOF" | "EUR") {
  // Une référence à nous, jamais celle d'un vrai paiement.
  const reference = `SANDBOX-${Date.now().toString(36).toUpperCase()}`;
  console.log(`\n${nom} — ouverture d'une session de bac à sable`);

  const vu = await ouvreur.creer({
    reference,
    montant,
    devise,
    cle: cleDOuverture(reference),
    retour: cheminDeRetour(reference),
    intitule: "ImmiPro — essai de bac à sable",
  });

  if (vu.issue !== "ouverte") {
    verifier(false, `${nom} : ouverture refusée (${vu.issue}${"detail" in vu ? ` — ${vu.detail}` : ""})`);
    return;
  }

  verifier(vu.session.url.startsWith("https://"), `${nom} : une page hébergée en https`);
  verifier(vu.session.montant === montant, `${nom} : le montant enregistré est ${montant}`);
  verifier(vu.session.devise === devise, `${nom} : la devise enregistrée est ${devise}`);
  verifier(
    vu.session.providerTxId.startsWith(`${nom.toLowerCase()}:`),
    `${nom} : l'identifiant est préfixé comme le webhook le préfixe`,
  );

  // La reprise, sur la session qui vient d'être créée : c'est ce chemin
  // qui protège d'un second débit après une réponse perdue.
  const repris = await ouvreur.retrouver(vu.session.providerTxId, reference);
  verifier(repris.issue === "ouverte", `${nom} : la session se retrouve par son identifiant`);

  // Le second appel de création, avec la même clé : le fournisseur doit
  // rendre la même session, et non en ouvrir une seconde.
  const rejeu = await ouvreur.creer({
    reference,
    montant,
    devise,
    cle: cleDOuverture(reference),
    retour: cheminDeRetour(reference),
    intitule: "ImmiPro — essai de bac à sable",
  });
  verifier(
    rejeu.issue === "ouverte" && rejeu.session.providerTxId === vu.session.providerTxId,
    `${nom} : la même clé d'idempotence rend la même session`,
  );
}

const cleStripe = renseignee(env[CLES.STRIPE.apiKey]);
const cleFedaPay = renseignee(env[CLES.FEDAPAY.apiKey]);
const espaceFedaPay = (env[CLES.FEDAPAY.environnement] ?? "sandbox").toLowerCase();

if (!cleStripe && !cleFedaPay) {
  console.log(
    "Aucune clé de fournisseur : le bac à sable n'a pas été éprouvé.\n" +
      "Ce n'est pas un succès déguisé — la forme exacte des requêtes reste non vérifiée.\n" +
      `Renseigner ${CLES.STRIPE.apiKey} ou ${CLES.FEDAPAY.apiKey} pour l'exécuter.`,
  );
  process.exit(0);
}

if (cleStripe && !cleStripe.startsWith("sk_test_")) {
  console.error(
    `${CLES.STRIPE.apiKey} n'est pas une clé de test : ce script n'ouvre rien hors du bac à sable.`,
  );
  process.exit(1);
}
if (cleFedaPay && espaceFedaPay === "live") {
  console.error(
    `${CLES.FEDAPAY.environnement} vaut « live » : ce script n'ouvre rien hors du bac à sable.`,
  );
  process.exit(1);
}

if (cleStripe) await eprouver("STRIPE", adaptateurStripe(cleStripe, retourAbsolu), 12, "EUR");
else console.log(`\nSTRIPE — ${CLES.STRIPE.apiKey} absente, non éprouvé.`);

if (cleFedaPay) {
  await eprouver("FEDAPAY", adaptateurFedaPay(cleFedaPay, espaceFedaPay, retourAbsolu), 5000, "XOF");
} else console.log(`\nFEDAPAY — ${CLES.FEDAPAY.apiKey} absente, non éprouvé.`);

console.log(
  echecs.length === 0
    ? "\nLes adaptateurs ouvrent réellement une session dans le bac à sable."
    : `\n${echecs.length} vérification(s) en échec.`,
);
process.exit(echecs.length === 0 ? 0 : 1);
