import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import {
  ANALYSE_ATTENDUE,
  COMMENT_SE_REMPLIT,
  COMMENT_TARIFER,
  GARDE_FOUS,
  MENTION_GARDE_FOU_NON_TENU,
  libelleDesGardeFous,
  MENTION_AUCUN_DEPASSEMENT,
  MENTION_DEPASSEMENTS_NON_CALCULABLES,
  MENTION_QUOTA_SANS_TARIF,
  MENTION_ETAT_VIDE,
  MENTION_HISTOGRAMME_EN_JETONS,
  MENTION_SANS_DONNEE_CANDIDAT,
  MENTION_TARIF_ABSENT,
  POURQUOI_AUCUNE_VALEUR,
  aucuneMesure,
  depassements,
  hauteurRelative,
  libelleDepassement,
  serieVide,
  type Depassement,
  type Journee,
  type Metrique,
} from "@/domain/backoffice/couts";
import { jourEnFrancais } from "@/domain/format/moment";
import { ExportDesAppels } from "./ExportDesAppels";
import {
  FOURNISSEURS,
  MENTION_CHOIX_DU_FOURNISSEUR,
  MENTION_QUOTA_EN_JETONS,
  type ConsommationDuFournisseur,
  type EtatDeLaFonction,
} from "@/domain/ia/fournisseurs";

/**
 * B-07 — Supervision des coûts IA, présentation. WF-16.
 *
 * ── Ce que cet écran affirmait de trop ─────────────────────────────────
 *
 * Il restait vide tant qu'aucun appel n'avait été enregistré, et c'était la
 * bonne décision. Mais sa sortie de l'état vide ne tenait qu'au nombre de
 * dossiers, alors que le coût, lui, n'était jamais mesuré : le seul
 * écrivain de `AiUsage` posait un zéro. Le premier dossier analysé affichait
 * donc « 0,00 F par dossier » et « 0,0 % au plus haut » sous un plafond de
 * 15 %. L'écran devenait faux en recevant des données, et son mensonge
 * rassurait.
 *
 * Les deux grandeurs sont désormais séparées. Les jetons se comptent — ils
 * s'affichent, et l'histogramme les porte. Le coût se tarife — il attend son
 * tarif, et son absence est nommée plutôt que remplie d'un zéro.
 *
 * ── Une commande rétablie, une commande toujours retirée ───────────────
 *
 * « Modifier les plafonds » et « Exporter le détail des appels » n'étaient
 * reliées à rien. La seconde est rétablie (S.122) : `ExportDesAppels` écrit
 * un vrai fichier, journalisé. La première reste retirée et consignée dans
 * `COMMANDES_ATTENDUES`, parce qu'elle pose une question de fond : un
 * plafond réglable depuis un écran est un plafond qu'on relève le jour où
 * il gêne, c'est-à-dire le jour où il sert.
 */
export interface CoutsIaProps {
  metriques: readonly Metrique[];
  /** Un point par jour, du plus ancien au plus récent, trous comblés à zéro. */
  serie: readonly Journee[];
  /** Dossiers payés dont la part du pack est connue — RG-16.2 les trie. */
  candidats: readonly Depassement[];
  /** Un tarif de jeton est configuré. Sans lui, aucun coût n'est calculable. */
  tarife: boolean;
  /** Le fournisseur de chaque fonction, et ce qui manque pour l'appeler (S.94). */
  fonctions?: readonly EtatDeLaFonction[];
  /** La consommation par fournisseur et par modèle (S.94). */
  parFournisseur?: readonly ConsommationDuFournisseur[];
  /** La période proposée à l'export : celle de l'histogramme, jours civils ISO. */
  periodeExport?: { du: string; au: string };
}

export function CoutsIa({
  metriques,
  serie,
  candidats,
  tarife,
  fonctions = [],
  parFournisseur = [],
  periodeExport,
}: CoutsIaProps) {
  const vide = aucuneMesure(metriques);
  const sansAppel = serieVide(serie);
  /*
    Sans tarif, la marge n'existe pas : `partDuPrix` vaut `null`, et une
    ligne « marge » ne peut pas en sortir. Le filtre est là quand même —
    l'écran ne doit pas tenir sur une garantie que seule la lecture
    fournit, sous peine d'afficher un rapport entre un coût absent et un
    prix le jour où un appelant changera d'avis.
  */
  const audela = depassements(candidats).filter((d) => tarife || d.nature === "quota");

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Coûts IA"
        resume={
          vide
            ? "Aucune mesure enregistrée : l'écran attend les premières écritures dans AiUsage."
            : tarife
              ? "Consommation et coûts de la période."
              : "Consommation de la période. Les coûts attendent un tarif de jeton."
        }
      />

      <div className="flex flex-col gap-5 p-6">
        {tarife ? null : (
          <section className="flex flex-col gap-2 rounded-lg border-l-6 border-warning bg-white p-4 shadow-e2">
            <h2 className="text-16 font-semibold text-ink-900">
              Les coûts ne sont pas calculés
            </h2>
            <p className="max-w-[80ch] text-pretty text-14 text-ink-700">
              {MENTION_TARIF_ABSENT}
            </p>
            <p className="max-w-[80ch] text-pretty text-13 text-ink-500">
              {COMMENT_TARIFER}
            </p>
          </section>
        )}

        <FournisseursIA fonctions={fonctions} parFournisseur={parFournisseur} />

        {/* Sans période proposée, pas d'export : le serveur la fournit toujours. */}
        {periodeExport ? (
          <ExportDesAppels duParDefaut={periodeExport.du} auParDefaut={periodeExport.au} />
        ) : null}

        <div className="grid grid-cols-5 gap-3">
          {metriques.map((m) => (
            <div
              key={m.cle}
              className="flex flex-col gap-1 rounded-lg border border-ink-300 bg-white p-4"
            >
              <span className="text-13 text-ink-500">{m.libelle}</span>
              <span className="text-24 font-semibold text-ink-900">
                {m.valeur ?? "—"}
              </span>
              <span className="text-pretty text-13 text-ink-500">
                {m.valeur === null && m.tarifee && !tarife
                  ? "sans tarif de jeton, cette valeur n'existe pas"
                  : m.source}
              </span>
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">Jetons consommés par jour</h2>
          {sansAppel ? (
            <div className="flex h-32 items-center justify-center rounded-md bg-ink-100 text-14 text-ink-500">
              Aucun appel enregistré
            </div>
          ) : (
            <Histogramme serie={serie} />
          )}
          <p className="text-pretty text-13 text-ink-500">{MENTION_ETAT_VIDE}</p>
          <p className="text-pretty text-13 text-ink-500">
            {MENTION_HISTOGRAMME_EN_JETONS}
          </p>
        </section>

        <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">Dépassements individuels</h2>
          {/*
            Sans tarif, la marge n'est pas calculable — et elle n'est plus
            la seule mesure : le quota de jetons du pack se compare sans
            connaître le prix de rien. La section disait donc « rien à
            relever » là où un dossier à dix fois son quota attendait.
          */}
          {!tarife ? (
            <p className="max-w-[80ch] text-pretty text-14 text-ink-700">
              {MENTION_DEPASSEMENTS_NON_CALCULABLES} {MENTION_QUOTA_SANS_TARIF}
            </p>
          ) : null}
          {audela.length === 0 ? (
            <p className="text-14 text-ink-700">{MENTION_AUCUN_DEPASSEMENT}</p>
          ) : (
            <>
              <ul className="flex flex-col">
                {audela.map((d) => (
                  <li
                    key={`${d.dossierId}-${d.nature}`}
                    className="flex items-baseline justify-between gap-6 border-t border-ink-300 py-2.5"
                  >
                    <span className="font-mono text-13 text-ink-700">{d.dossierId}</span>
                    <span className="text-14 text-ink-900">{libelleDepassement(d)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-pretty text-13 text-ink-500">{ANALYSE_ATTENDUE}</p>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-16 font-semibold text-ink-900">Garde-fous</h2>
            {/* Le décompte se lit avant la liste : un superviseur doit savoir
                combien de ces seuils freinent réellement quelque chose avant
                d'en lire les conséquences, pas après. */}
            <p className="text-13 text-ink-500">{libelleDesGardeFous()}</p>
          </div>
          <dl className="flex flex-col">
            {GARDE_FOUS.map((g) => (
              <div
                key={g.libelle}
                className="flex items-baseline justify-between gap-6 border-t border-ink-300 py-2.5"
              >
                <dt className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-14 text-ink-900">{g.libelle}</span>
                  <span className="text-pretty text-13 text-ink-500">{g.consequence}</span>
                  {/* Un seuil écrit et non appliqué le dit, et dit ce qui lui
                      manque : le retirer ferait disparaître le besoin avec la
                      ligne, le taire ferait croire à un frein qui n'existe
                      pas. */}
                  {g.tenu ? null : (
                    <>
                      <span className="text-pretty text-13 font-medium text-warning">
                        {MENTION_GARDE_FOU_NON_TENU}
                      </span>
                      <span className="text-pretty text-13 text-ink-500">
                        Il manque {g.manque}.
                      </span>
                    </>
                  )}
                </dt>
                <dd className="whitespace-nowrap text-14 font-medium text-ink-900">
                  {g.seuil}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex max-w-[80ch] flex-col gap-2 rounded-lg bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">
            Comment cet écran se remplit
          </h2>
          <p className="text-pretty text-14 text-ink-700">{COMMENT_SE_REMPLIT}</p>
          <p className="text-pretty text-14 text-ink-700">{POURQUOI_AUCUNE_VALEUR}</p>
        </section>

        <p className="text-pretty text-13 text-ink-500">{MENTION_SANS_DONNEE_CANDIDAT}</p>
      </div>
    </div>
  );
}

/**
 * Barres en jetons. Le jour à zéro garde sa place et son libellé : c'est ce
 * que la mention d'état vide promet, et c'est le jour où la file s'est
 * arrêtée qu'un superviseur doit voir.
 */
function Histogramme({ serie }: { serie: readonly Journee[] }) {
  const nombre = new Intl.NumberFormat("fr-FR");

  return (
    <ul className="flex h-32 items-end gap-1.5" aria-label="Jetons consommés par jour">
      {serie.map((j) => (
        <li
          key={j.jour}
          className="flex h-full flex-1 flex-col justify-end border-b-2 border-ink-300"
          title={`${jourEnFrancais(j.jour)} · ${nombre.format(j.jetons)} jetons`}
        >
          <span className="sr-only">
            {jourEnFrancais(j.jour)} : {nombre.format(j.jetons)} jetons,{" "}
            {j.appels === 0
              ? "aucun appel"
              : `${nombre.format(j.appels)} appel${j.appels > 1 ? "s" : ""}`}
          </span>
          <span
            aria-hidden
            className="w-full rounded-t-sm bg-accent-700"
            /* Un jour sans appel n'a pas de barre : son emplacement reste
               visible par le trait de base, et une barre minimale montrerait
               une consommation là où il n'y en a pas eu. */
            style={{ height: `${hauteurRelative(j, serie) * 100}%` }}
          />
        </li>
      ))}
    </ul>
  );
}

const NOMBRE = new Intl.NumberFormat("fr-FR");
const MONTANT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });

/**
 * Les fournisseurs d'IA — S.94.
 *
 * Deux questions, dans l'ordre où un exploitant se les pose : qui sert
 * chaque fonction, et est-ce branché — la raison dite comme une action
 * quand ce ne l'est pas ; puis ce que chacun a consommé. Le choix ne se
 * fait pas ici : il se fait par configuration, et l'écran le dit.
 */
function FournisseursIA({
  fonctions,
  parFournisseur,
}: {
  fonctions: readonly EtatDeLaFonction[];
  parFournisseur: readonly ConsommationDuFournisseur[];
}) {
  return (
    <section
      aria-labelledby="fournisseurs-ia"
      className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="fournisseurs-ia" className="text-16 font-semibold text-ink-900">
          Fournisseurs d&apos;IA
        </h2>
        <p className="max-w-[80ch] text-pretty text-13 text-ink-500">
          {MENTION_CHOIX_DU_FOURNISSEUR}
        </p>
      </div>

      <dl className="flex flex-col">
        {fonctions.map((f) => (
          <div
            key={f.fonction}
            className="flex flex-col gap-1 border-t border-ink-300 py-2.5 md:flex-row md:items-baseline md:justify-between md:gap-6"
          >
            <dt className="text-14 font-medium text-ink-900">{f.libelle}</dt>
            <dd className="flex flex-col gap-0.5 md:items-end">
              <span className="text-14 text-ink-900">
                {f.libelleFournisseur}
                {f.modele ? <span className="font-mono text-13 text-ink-500"> · {f.modele}</span> : null}
              </span>
              <span
                className={
                  f.branche ? "text-13 font-medium text-success" : "text-13 font-medium text-warning"
                }
              >
                {f.branche ? "Branché" : "Non branché"}
                {f.tarife ? " · tarif renseigné" : " · sans tarif de jeton"}
              </span>
              {f.raison ? (
                <span className="max-w-[60ch] text-pretty text-13 text-ink-700 md:text-right">
                  {f.raison}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-14 font-semibold text-ink-900">Consommation par fournisseur</h3>
        {parFournisseur.length === 0 ? (
          <p className="text-14 text-ink-700">
            Aucun appel enregistré : la ventilation par fournisseur apparaîtra au premier appel.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-14">
              <caption className="sr-only">Consommation par fournisseur et par modèle</caption>
              <thead>
                <tr className="bg-ink-100 text-13 font-medium text-ink-700">
                  <th scope="col" className="px-3 py-2 text-left">Fournisseur</th>
                  <th scope="col" className="px-3 py-2 text-left">Modèle</th>
                  <th scope="col" className="px-3 py-2 text-right">Appels</th>
                  <th scope="col" className="px-3 py-2 text-right">Jetons d&apos;entrée</th>
                  <th scope="col" className="px-3 py-2 text-right">Jetons de sortie</th>
                  <th scope="col" className="px-3 py-2 text-right">Coût</th>
                </tr>
              </thead>
              <tbody>
                {parFournisseur.map((l) => (
                  <tr key={`${l.fournisseur}-${l.modele ?? "historique"}`} className="border-t border-ink-300">
                    <td className="px-3 py-2 text-ink-900">{FOURNISSEURS[l.fournisseur].libelle}</td>
                    <td className="px-3 py-2 font-mono text-13 text-ink-700">
                      {l.modele ?? "non consigné (avant S.94)"}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-900">{NOMBRE.format(l.appels)}</td>
                    <td className="px-3 py-2 text-right text-ink-900">{NOMBRE.format(l.jetonsEntree)}</td>
                    <td className="px-3 py-2 text-right text-ink-900">{NOMBRE.format(l.jetonsSortie)}</td>
                    <td className="px-3 py-2 text-right text-ink-900">
                      {l.coutMicros === null || l.devise === null
                        ? "sans tarif"
                        : `${MONTANT.format(l.coutMicros / 1_000_000)} ${l.devise}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="max-w-[80ch] text-pretty text-13 text-ink-500">{MENTION_QUOTA_EN_JETONS}</p>
      </div>
    </section>
  );
}
