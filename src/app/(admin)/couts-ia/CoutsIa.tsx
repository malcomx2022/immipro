import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import {
  ANALYSE_ATTENDUE,
  COMMENT_SE_REMPLIT,
  COMMENT_TARIFER,
  GARDE_FOUS,
  MENTION_AUCUN_DEPASSEMENT,
  MENTION_DEPASSEMENTS_NON_CALCULABLES,
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
 * ── Les deux commandes retirées ────────────────────────────────────────
 *
 * « Modifier les plafonds » et « Exporter le détail des appels » n'étaient
 * reliées à rien. La règle de Q.A vaut ici comme ailleurs. La première pose
 * une question de fond, consignée dans `COMMANDES_ATTENDUES` : un plafond
 * réglable depuis un écran est un plafond qu'on relève le jour où il gêne,
 * c'est-à-dire le jour où il sert.
 */
export interface CoutsIaProps {
  metriques: readonly Metrique[];
  /** Un point par jour, du plus ancien au plus récent, trous comblés à zéro. */
  serie: readonly Journee[];
  /** Dossiers payés dont la part du pack est connue — RG-16.2 les trie. */
  candidats: readonly Depassement[];
  /** Un tarif de jeton est configuré. Sans lui, aucun coût n'est calculable. */
  tarife: boolean;
}

export function CoutsIa({ metriques, serie, candidats, tarife }: CoutsIaProps) {
  const vide = aucuneMesure(metriques);
  const sansAppel = serieVide(serie);
  const audela = depassements(candidats);

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
          {!tarife ? (
            <p className="max-w-[80ch] text-pretty text-14 text-ink-700">
              {MENTION_DEPASSEMENTS_NON_CALCULABLES}
            </p>
          ) : audela.length === 0 ? (
            <p className="text-14 text-ink-700">{MENTION_AUCUN_DEPASSEMENT}</p>
          ) : (
            <>
              <ul className="flex flex-col">
                {audela.map((d) => (
                  <li
                    key={d.dossierId}
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
          <h2 className="text-16 font-semibold text-ink-900">Garde-fous</h2>
          <dl className="flex flex-col">
            {GARDE_FOUS.map((g) => (
              <div
                key={g.libelle}
                className="flex items-baseline justify-between gap-6 border-t border-ink-300 py-2.5"
              >
                <dt className="flex flex-col">
                  <span className="text-14 text-ink-900">{g.libelle}</span>
                  <span className="text-pretty text-13 text-ink-500">{g.consequence}</span>
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
