import { cookies, headers } from "next/headers";
import type { ZodType } from "zod";
// L'import installe la table de messages française (effet de bord assumé :
// aucune route ne peut répondre sans être passée par le composeur).
import "./messages-zod";
import type { Role } from "@prisma/client";
import { EchecHttp, echec } from "./echecs";
import { json, reponseEchec, type OptionsReponse, type Public } from "./reponse";
import { cleDAppel, consommer, type NomRegle } from "./limites";
import { COOKIE_SESSION, lireSession, type Acteur } from "@/server/securite/session";

/**
 * Composition d'une route d'API.
 *
 * Chaque route se réduit à sa décision métier. Tout ce qui l'entoure — qui
 * appelle, ce qui est reçu, ce qui est compté, ce qui est renvoyé en cas
 * d'échec — est décidé ici, une fois, pour que trente-cinq routes ne
 * décident pas trente-cinq fois.
 *
 * Trois invariants du projet deviennent structurels :
 *
 * - **DOC-12 §16 règle 3.** Le public de la réponse découle du niveau
 *   d'accès. Une route candidat ne peut pas renvoyer de code technique.
 * - **Règle d'architecture 5.** Une route n'est dispensée de limitation de
 *   débit qu'en se déclarant `webhook`, et ce nom impose de fournir une
 *   vérification de signature — le type l'exige, et un test relit les
 *   fichiers pour que la dispense ne se prenne pas autrement.
 * - **RG-15.3.** Le rôle exigé est déclaré, jamais vérifié dans le corps du
 *   traitement où on l'oublie.
 */

export type Acces = "public" | "candidat" | "candidat_verifie" | "veilleur" | "admin";

/** Rôles acceptés par niveau d'accès. Un administrateur passe partout. */
const ROLES_ADMIS: Record<Exclude<Acces, "public">, readonly Role[]> = {
  candidat: ["CANDIDAT", "VEILLEUR", "ADMIN"],
  candidat_verifie: ["CANDIDAT", "VEILLEUR", "ADMIN"],
  veilleur: ["VEILLEUR", "ADMIN"],
  admin: ["ADMIN"],
};

const PUBLIC_PAR_ACCES: Record<Acces, Public> = {
  public: "candidat",
  candidat: "candidat",
  candidat_verifie: "candidat",
  veilleur: "operateur",
  admin: "operateur",
};

export interface Contexte<C, Q> {
  /** Corps validé. `undefined` quand la route n'en attend pas. */
  corps: C;
  /** Paramètres de requête validés. */
  requete: Q;
  /** Segments dynamiques de l'URL. */
  params: Record<string, string>;
  /** Acteur authentifié. `null` sur une route publique. */
  acteur: Acteur | null;
  requeteBrute: Request;
}

export interface Definition<C, Q> {
  /** Nom stable, utilisé pour la clé de limitation et le journal. */
  nom: string;
  acces: Acces;
  /**
   * Régime de limitation, ou `webhook` pour en être dispensé. La dispense
   * n'est jamais gratuite : elle oblige à passer `signature`.
   */
  limite: NomRegle | "webhook";
  /**
   * Vérification d'origine d'un webhook. Obligatoire dès que `limite` vaut
   * `webhook`, interdite sinon — un appel authentifié par cookie n'a pas de
   * signature à vérifier, et en accepter une brouillerait la question de
   * savoir ce qui autorise quoi.
   */
  signature?: (requete: Request, corpsBrut: string) => Promise<boolean> | boolean;
  corps?: ZodType<C>;
  requete?: ZodType<Q>;
  /** Mise en cache publique. Réservée aux données non nominatives. */
  cachePublicSecondes?: number;
  traiter: (ctx: Contexte<C, Q>) => Promise<unknown>;
}

type DefinitionValide<C, Q> = Definition<C, Q> &
  ({ limite: "webhook"; signature: NonNullable<Definition<C, Q>["signature"]> } | { limite: NomRegle; signature?: never });

/**
 * Signature attendue par l'App Router. Le contexte est requis et ses
 * paramètres sont une promesse depuis Next 15 ; les routes sans segment
 * dynamique en reçoivent une qui se résout sur un objet vide.
 */
type Gestionnaire = (
  requete: Request,
  contexte: { params: Promise<Record<string, string>> },
) => Promise<Response>;

export function route<C = undefined, Q = undefined>(
  definition: DefinitionValide<C, Q>,
): Gestionnaire {
  const destinataire = PUBLIC_PAR_ACCES[definition.acces];

  return async function gestionnaire(requeteBrute, contexte) {
    /**
     * À qui parle la réponse d'échec.
     *
     * La route déclare son public, mais c'est l'appelant qui le reçoit — et
     * les deux ne coïncident pas toujours. Un candidat qui frappe une
     * adresse du back-office reçoit un refus de la part d'une route
     * « opérateur » : lui servir le code et le diagnostic parce que la
     * *route* est réservée aux opérateurs, alors que *lui* n'en est pas un,
     * retourne la règle 3 contre elle-même.
     *
     * Le public part donc au plus bas et ne monte qu'une fois l'appelant
     * reconnu : rôle suffisant pour une route back-office, signature
     * vérifiée pour un webhook. Tant que l'origine n'est pas prouvée,
     * l'appelant est quelconque et n'a droit à rien de plus qu'un écran
     * public — dire « signature_invalide » avec un service et un horodatage
     * à qui n'a pas le secret lui apprend la forme de ce qu'il faut deviner.
     */
    let destinataireEffectif: Public = "candidat";

    try {
      const params = (await contexte?.params) ?? {};

      // ── Origine ─────────────────────────────────────────────
      // Le corps brut est lu avant toute chose pour un webhook : la
      // signature porte sur les octets reçus, pas sur l'objet reparsé,
      // qui aurait perdu l'ordre des clés et les espaces.
      let corpsBrut: string | null = null;
      if (definition.limite === "webhook") {
        corpsBrut = await requeteBrute.text();
        const valide = await definition.signature(requeteBrute, corpsBrut);
        if (!valide) throw echec("signature_invalide");
        destinataireEffectif = "operateur";
      }

      // ── Acteur ──────────────────────────────────────────────
      let acteur: Acteur | null = null;
      if (definition.acces !== "public" && definition.limite !== "webhook") {
        const magasin = await cookies();
        acteur = await lireSession(magasin.get(COOKIE_SESSION)?.value);
        if (!acteur) throw echec("authentification_requise");
        if (!ROLES_ADMIS[definition.acces].includes(acteur.role)) {
          throw echec("droits_insuffisants");
        }
        destinataireEffectif = destinataire;
        if (definition.acces === "candidat_verifie" && !acteur.emailVerifie) {
          throw echec("etat_incompatible", {
            corps:
              "Ton adresse email n'est pas encore confirmée. Le code t'a été envoyé à l'inscription.",
          });
        }
      } else if (definition.acces === "public" && definition.limite !== "webhook") {
        // Une route publique lit tout de même la session quand elle existe :
        // la page d'accueil montre « mes dossiers » à qui est connecté.
        // Pas un webhook : le fournisseur n'a pas de session, et son
        // origine est déjà prouvée par la signature (S.109).
        const magasin = await cookies();
        acteur = await lireSession(magasin.get(COOKIE_SESSION)?.value);
      }

      // ── Débit ───────────────────────────────────────────────
      if (definition.limite !== "webhook") {
        const entetes = await headers();
        const adresse =
          entetes.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          entetes.get("x-real-ip") ??
          "inconnue";
        const verdict = consommer(
          cleDAppel(definition.nom, acteur?.id ?? null, adresse),
          definition.limite,
        );
        if (!verdict.autorise) {
          return reponseEchec(echec("trop_de_requetes"), destinataireEffectif);
        }
      }

      // ── Entrée ──────────────────────────────────────────────
      const requete = lireRequete(definition, requeteBrute);
      const corps = await lireCorps(definition, requeteBrute, corpsBrut);

      // ── Traitement ──────────────────────────────────────────
      const resultat = await definition.traiter({
        corps,
        requete,
        params,
        acteur,
        requeteBrute,
      });

      if (resultat instanceof Response) return resultat;
      const options: OptionsReponse = definition.cachePublicSecondes
        ? { cachePublicSecondes: definition.cachePublicSecondes }
        : {};
      return json(resultat, options);
    } catch (erreur) {
      return versReponse(erreur, destinataireEffectif, definition.nom);
    }
  };
}

function lireRequete<C, Q>(definition: Definition<C, Q>, requete: Request): Q {
  if (!definition.requete) return undefined as Q;
  const brut = Object.fromEntries(new URL(requete.url).searchParams);
  const lu = definition.requete.safeParse(brut);
  if (!lu.success) throw echec("champs_invalides", { champs: parChamp(lu.error) });
  return lu.data;
}

async function lireCorps<C, Q>(
  definition: Definition<C, Q>,
  requete: Request,
  dejaLu: string | null,
): Promise<C> {
  if (!definition.corps) return undefined as C;
  let brut: unknown;
  try {
    const texte = dejaLu ?? (await requete.text());
    brut = texte.length === 0 ? undefined : JSON.parse(texte);
  } catch {
    throw echec("corps_illisible");
  }
  const lu = definition.corps.safeParse(brut);
  if (!lu.success) throw echec("champs_invalides", { champs: parChamp(lu.error) });
  return lu.data;
}

/**
 * Un message par champ, pas une liste globale.
 *
 * L'écran affiche l'erreur sous le champ concerné (bibliothèque de
 * composants, « Champs et Sélection ») : une liste en tête de page oblige à
 * retrouver soi-même lequel des huit champs est en cause.
 */
function parChamp(erreur: { issues: readonly { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const probleme of erreur.issues) {
    const cle = probleme.path.map(String).join(".") || "_";
    champs[cle] ??= probleme.message;
  }
  return champs;
}

/**
 * Tout ce qui n'est pas un échec du catalogue devient une indisponibilité.
 *
 * Le message d'origine ne sort jamais : une erreur Prisma cite le nom des
 * colonnes, une erreur réseau cite l'hôte interne. Ce qui est perdu pour
 * l'appelant est écrit dans le journal du serveur, où il est utile.
 */
function versReponse(erreur: unknown, destinataire: Public, nom: string): Response {
  if (erreur instanceof EchecHttp) return reponseEchec(erreur, destinataire);
  console.error(`[api:${nom}]`, erreur);
  return reponseEchec(
    echec("service_indisponible", {
      diagnostic: { service: nom, survenuA: new Date().toISOString() },
    }),
    destinataire,
  );
}
