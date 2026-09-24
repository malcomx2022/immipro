import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Enregistrement du profil — C-02, WF-02 étapes 3 et 4.
 *
 * ── L'enregistrement effaçait ce qu'on ne lui donnait pas ───────────
 *
 * La route composait ses colonnes ainsi :
 *
 *     objectif: corps.objectif ?? null,
 *     fieldOfStudy: corps.domaine ?? null,
 *     yearsExperience: corps.anneesExperience ?? null,
 *     budgetTotal: corps.budgetTotal ?? null,
 *     budgetCurrency: corps.budgetDevise ?? null,
 *
 * Un `??` sur une valeur absente n'est pas un effacement demandé, c'est un
 * effacement subi : C-02 n'envoie ni objectif, ni domaine, ni expérience,
 * ni budget, et les vidait donc à chaque clic sur « Enregistrer ». Exécuté
 * avant correction, sur une base réelle :
 *
 *     avant : objectif "Étudier", fieldOfStudy "Informatique",
 *             yearsExperience 3, budgetTotal 4000000, budgetCurrency "XOF"
 *     après : objectif null, fieldOfStudy null, yearsExperience null,
 *             budgetTotal null, budgetCurrency null
 *
 * L'en-tête de la route dit pourtant ce que ces colonnes portent : « les
 * réponses du simulateur alimentent le profil à la création — le candidat
 * ne resaisit rien ». Le seul écran qui écrit ce profil les effaçait.
 *
 * ── Absent, vide, et la différence entre les deux ───────────────────
 *
 * `undefined` laisse la colonne intacte : ce que l'appelant n'a pas
 * mentionné ne lui appartient pas. La chaîne vide, elle, est un geste — le
 * candidat a effacé le champ — et elle vide la colonne. Sans cette seconde
 * règle, le correctif rendrait les champs ineffaçables, ce qui serait le
 * défaut inverse.
 *
 * ── Pourquoi l'écriture vit ici ─────────────────────────────────────
 *
 * La même raison que `server/regles/publication`, `server/revue/decision`
 * et `server/veille/releve` : dans sa route, elle était derrière
 * `next/headers`, donc hors de portée de toute fumée. Un effacement de
 * colonnes ne se voit qu'en relisant la ligne après coup.
 */

export interface CorpsDuProfil {
  prenom?: string;
  nom?: string;
  telephone?: string;
  pays?: string;
  objectif?: string;
  diplome?: string;
  domaine?: string;
  anneesExperience?: number;
  langues?: Record<string, string>;
  budgetTotal?: number;
  budgetDevise?: "XOF" | "EUR";
}

/**
 * Absent → la clé n'est pas dans l'objet, et Prisma ne touche pas la
 * colonne. Vide → la clé y est, à `null`, et la colonne se vide. C'est
 * l'omission qui protège, pas une valeur sentinelle.
 */
const texte = (valeur: string | undefined): { valeur: string | null } | undefined =>
  valeur === undefined ? undefined : { valeur: valeur.trim() === "" ? null : valeur.trim() };

const nombre = (valeur: number | undefined): { valeur: number } | undefined =>
  valeur === undefined ? undefined : { valeur };

/**
 * Les langues arrivent en bloc et se remplacent en bloc : le contrat porte
 * un dictionnaire, pas des entrées. Un dictionnaire dont toutes les valeurs
 * sont vides vaut un effacement — c'est ce que C-02 envoie quand le
 * candidat efface son niveau d'anglais, seule langue qu'il saisit.
 */
const langues = (
  valeur: Record<string, string> | undefined,
): { valeur: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue } | undefined => {
  if (valeur === undefined) return undefined;
  const retenues = Object.fromEntries(
    Object.entries(valeur).filter(([, v]) => v.trim() !== ""),
  );
  // Une colonne `Json?` se vide par `DbNull` — le `null` de JSON est une
  // valeur, et les deux ne se disent pas du même mot chez Prisma.
  return { valeur: Object.keys(retenues).length === 0 ? Prisma.DbNull : retenues };
};

/**
 * Ne garde que les colonnes mentionnées, et les déballe.
 *
 * Paramétrée par le type Prisma de la table : une colonne mal nommée, ou
 * une valeur du mauvais type, ne compile pas. Un `Record<string, never>`
 * aurait fait passer les deux.
 */
const mentionnees = <T,>(entrees: { [K in keyof T]?: { valeur: T[K] } }): T =>
  Object.fromEntries(
    Object.entries(entrees)
      .filter(([, v]) => v !== undefined)
      .map(([cle, v]) => [cle, (v as { valeur: unknown }).valeur]),
  ) as T;

/** Les colonnes que cette écriture touche, et aucune autre. */
type ColonnesDuCompte = Pick<
  Prisma.UserUpdateInput,
  "firstName" | "lastName" | "phone" | "countryCode"
>;
type ColonnesDuProfil = Omit<
  Prisma.ProfileUncheckedCreateInput,
  "id" | "userId" | "updatedAt"
>;

export async function enregistrerLeProfil(userId: string, corps: CorpsDuProfil): Promise<void> {
  const compte = mentionnees<ColonnesDuCompte>({
    firstName: texte(corps.prenom),
    lastName: texte(corps.nom),
    phone: texte(corps.telephone),
    countryCode: texte(corps.pays),
  });
  if (Object.keys(compte).length > 0) {
    await db.user.update({ where: { id: userId }, data: compte });
  }

  const profil = mentionnees<ColonnesDuProfil>({
    objectif: texte(corps.objectif),
    highestDegree: texte(corps.diplome),
    fieldOfStudy: texte(corps.domaine),
    yearsExperience: nombre(corps.anneesExperience),
    languages: langues(corps.langues),
    budgetTotal: nombre(corps.budgetTotal),
    budgetCurrency: texte(corps.budgetDevise),
  });
  if (Object.keys(profil).length === 0) return;

  // `upsert` et non `update` : le profil n'existe pas tant que rien n'a
  // été saisi. Les colonnes non mentionnées sont absentes des deux côtés.
  await db.profile.upsert({
    where: { userId },
    create: { userId, ...profil },
    update: profil,
  });
}
