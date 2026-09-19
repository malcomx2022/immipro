import type { Prisma, VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { visaRulesSchema, type VisaRulesPayload } from "@/domain/rules/schema";
import type { FicheDestination, Mention, Repere } from "@/domain/destinations/fiche";
import { echec } from "@/server/http/echecs";
import { EDITORIAL, editorialDe } from "@/lib/contenu/destinations";

/**
 * Lecture du référentiel réglementaire.
 *
 * INV-4 : « une règle de source SECONDAIRE n'est jamais visible par
 * l'utilisateur. Le filtrage se fait dans la requête, pas dans l'affichage. »
 * Ce module est le seul endroit du serveur qui interroge `VisaRule` pour un
 * candidat, et il ne sait construire qu'un filtre : celui-ci. Un écran ne
 * peut donc pas décider d'en afficher une de plus.
 *
 * RG-14.1 s'y ajoute : une fiche dont la relecture est dépassée disparaît de
 * l'affichage. Un cron la repasse en DRAFT (WF-14), mais entre deux passages
 * du cron la requête ne doit pas la servir — une donnée non relue ne peut
 * pas continuer à se présenter comme fiable, et un retard de tâche de fond
 * n'est pas une raison suffisante.
 */

/**
 * Filtre candidat. Exporté comme valeur pour être vérifiable : un test le
 * compare champ par champ, sans base de données.
 */
export function filtrePourCandidat(aujourdhui: Date): Prisma.VisaRuleWhereInput {
  const jour = new Date(
    Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate()),
  );
  return {
    status: "PUBLISHED",
    // INV-4 — au niveau requête.
    sourceTier: { not: "SECONDAIRE" },
    // RG-14.1 — une relecture dépassée ne s'affiche plus.
    nextReviewAt: { gte: jour },
    effectiveFrom: { lte: jour },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: jour } }],
  };
}

export async function reglesPubliees(aujourdhui = new Date()): Promise<VisaRule[]> {
  return db.visaRule.findMany({
    where: filtrePourCandidat(aujourdhui),
    orderBy: [{ countryCode: "asc" }, { visaType: "asc" }],
  });
}

/** Une règle par identifiant, sous le même filtre. Rien d'autre n'y accède. */
export async function reglePubliee(id: string, aujourdhui = new Date()): Promise<VisaRule | null> {
  return db.visaRule.findFirst({ where: { id, ...filtrePourCandidat(aujourdhui) } });
}

export async function reglePubliieParSlug(
  slug: string,
  aujourdhui = new Date(),
): Promise<VisaRule | null> {
  const paire = Object.entries(EDITORIAL).find(([, e]) => e.slug === slug);
  if (!paire) return null;
  const [cle] = paire;
  const [countryCode, visaType] = cle.split("/");
  return db.visaRule.findFirst({
    where: { countryCode, visaType, ...filtrePourCandidat(aujourdhui) },
  });
}

/**
 * Lecture du payload. Il repasse par le schéma Zod à chaque lecture et non
 * seulement à l'écriture : une règle écrite avant une évolution de schéma,
 * ou reprise à la main un soir d'incident, arriverait sinon jusqu'à l'écran
 * sous une forme que le code ne sait pas lire.
 */
export function payload(regle: VisaRule): VisaRulesPayload {
  const lu = visaRulesSchema.safeParse(regle.rules);
  if (!lu.success) {
    throw echec("regle_indisponible", {
      diagnostic: {
        service: "regles",
        survenuA: new Date().toISOString(),
        trace: `${regle.countryCode}/${regle.visaType} v${regle.version}`,
      },
    });
  }
  return lu.data;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Mention de source — INV-8.
 *
 * Elle est construite ici et non dans chaque appelant : une fiche sans
 * source ne doit pas pouvoir exister, et `FicheDestination.mention` est
 * obligatoire dans son type. La date de prochaine relecture accompagne la
 * date de vérification, parce qu'une information vérifiée il y a trois mois
 * et relue demain ne se lit pas comme une information vérifiée il y a trois
 * mois et jamais reprogrammée.
 */
export function mentionDe(regle: VisaRule): Mention {
  return {
    source: new URL(regle.sourceUrl).hostname.replace(/^www\./u, ""),
    verifieeLe: iso(regle.verifiedAt),
    relectureLe: iso(regle.nextReviewAt),
    ...(editorialDe(regle.countryCode, regle.visaType)?.autorite
      ? { autorite: editorialDe(regle.countryCode, regle.visaType)!.autorite }
      : {}),
  };
}

const montant = (m: { valeur: number; devise: string; periodicite: string } | null): string =>
  m === null
    ? "Non exigé"
    : `${new Intl.NumberFormat("fr-FR").format(m.valeur)} ${m.devise}${
        m.periodicite === "mensuel" ? " / mois" : m.periodicite === "annuel" ? " / an" : ""
      }`;

const fourchette = (
  f: { min: number; max: number; devise: string; periodicite: string } | null,
): string =>
  f === null
    ? "Non communiqué"
    : `${new Intl.NumberFormat("fr-FR").format(f.min)} à ${new Intl.NumberFormat("fr-FR").format(
        f.max,
      )} ${f.devise}${f.periodicite === "annuel" ? " / an" : " / mois"}`;

/**
 * Vue candidat d'une règle. Le type exige la mention : la fonction ne peut
 * pas rendre une fiche sans source (INV-8).
 *
 * Rien de ce qui relève de l'exploitation ne passe : ni le rang de version,
 * ni le vérificateur, ni les notes internes. Le back-office les lit sur son
 * propre chemin.
 */
export function versFiche(regle: VisaRule): FicheDestination | null {
  const edito = editorialDe(regle.countryCode, regle.visaType);
  if (!edito) return null;
  const p = payload(regle);

  const reperes: Repere[] = [
    { intitule: "Frais de scolarité", valeur: fourchette(p.frais_scolarite) },
    { intitule: "Ressources à prouver", valeur: montant(p.preuve_fonds) },
    {
      intitule: "Délai de traitement",
      valeur: p.delai_traitement_jours
        ? `${p.delai_traitement_jours.min} à ${p.delai_traitement_jours.max} jours`
        : "Non communiqué",
    },
  ];

  const conditions: Repere[] = [
    {
      intitule: "Langue",
      valeur: p.niveau_langue_min
        ? `${p.niveau_langue_min} — ${p.langues_acceptees.join(", ")}`
        : `Aucun niveau exigé — ${p.langues_acceptees.join(", ")}`,
    },
    { intitule: "Frais de dossier", valeur: montant(p.frais_dossier) },
    ...p.conditions
      .filter((c) => c.bloquant)
      .map((c) => ({ intitule: c.code.replace(/_/gu, " "), valeur: c.message_echec })),
  ];

  return {
    slug: edito.slug,
    code: regle.countryCode,
    pays: edito.pays,
    intitule: p.libelle,
    resume: edito.resume,
    reperes,
    conditions,
    travailEtudiant: libelleTravail(p),
    apresDiplome: libelleApresDiplome(p),
    reserves: p.reserves.map((texte) => ({ texte, ton: "attention" as const })),
    piecesAReunir: p.pieces_requises.length,
    mention: mentionDe(regle),
  };
}

/**
 * RG-03.3 : `permis_employeur_requis` est affiché en évidence. Le droit au
 * travail appartient à l'employeur et non à l'étudiant, et c'est une source
 * majeure de désillusion — la phrase le dit avant la limite horaire, qui
 * est la partie rassurante.
 */
function libelleTravail(p: VisaRulesPayload): string {
  const t = p.travail_autorise;
  if (!t.autorise) return "Travail non autorisé pendant les études.";
  const parts: string[] = [];
  if (t.permis_employeur_requis) {
    parts.push("L'employeur doit obtenir un permis de travail avant l'embauche");
  }
  if (t.limite_hebdomadaire_heures) parts.push(`${t.limite_hebdomadaire_heures} h par semaine`);
  if (t.plein_temps_vacances) parts.push("temps plein pendant les vacances");
  if (t.delai_carence_mois) parts.push(`après ${t.delai_carence_mois} mois de séjour`);
  return `${parts.join(", ")}.`;
}

function libelleApresDiplome(p: VisaRulesPayload): string {
  const a = p.apres_etudes;
  if (!a || !a.dispositif) return "Aucun dispositif de recherche d'emploi après le diplôme.";
  const suite = a.duree_mois ? ` — ${a.duree_mois} mois` : "";
  const depot = a.delai_depot_apres_diplome_mois
    ? `, à demander dans les ${a.delai_depot_apres_diplome_mois} mois suivant le diplôme`
    : "";
  return `${a.dispositif}${suite}${depot}.`;
}
