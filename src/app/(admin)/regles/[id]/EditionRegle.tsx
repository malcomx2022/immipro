"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import {
  AIDE_LIBELLE_CANDIDAT,
  AIDE_MOTIF,
  CHAMPS_CANDIDAT,
  LIBELLE_NIVEAU,
  MENTION_SANS_MIGRATION,
  aChange,
  comparer,
  compterChangements,
  effetDeLaPublication,
  messageDeRefus,
  publiable,
  verifierTextesCandidat,
  visiblePourLeCandidat,
  type ChampCandidat,
  type Regle,
} from "@/domain/backoffice/regle";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import { jourEnFrancais } from "@/domain/format/moment";
import { formatMontant } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CHAMP_CONTROLE } from "@/components/ui/champ";

/**
 * B-02 — Édition d'une règle versionnée. WF-14, INV-3, INV-8.
 *
 * C'est ici que le vocabulaire interdit trouve son troisième point
 * d'application. Jusqu'à ce lot, la liste protégeait le code : un
 * administrateur qui saisissait « 95 % de réussite » dans le libellé d'une
 * checklist passait à travers tout le dispositif, et son texte s'affichait
 * tel quel chez le candidat. Les deux champs destinés au candidat sont
 * maintenant validés à la saisie, avec la même liste et la même
 * reconnaissance de la négation, et la publication est bloquée tant qu'une
 * formulation est refusée.
 *
 * INV-3 reste tenu : publier n'migre aucun dossier. L'effet est montré avant,
 * avec le nombre de dossiers alertés, le nombre mis en arbitrage, et zéro
 * migration — le type lui-même le dit.
 */
export interface EditionRegleProps {
  enVigueur: Regle;
  brouillon: Regle;
  dossiersConcernes: number;
  dossiersSousLaNouvelleRegle: number;
  historique: readonly { version: number; le: string; par: string }[];
}

export function EditionRegle({
  enVigueur,
  brouillon,
  dossiersConcernes,
  dossiersSousLaNouvelleRegle,
  historique,
}: EditionRegleProps) {
  const [textes, setTextes] = useState<Record<ChampCandidat, string>>({
    libelleCandidat: brouillon.libelleCandidat,
    reserveCandidat: brouillon.reserveCandidat,
  });
  const [motif, setMotif] = useState("");
  const [tentative, setTentative] = useState(false);

  const fautes = verifierTextesCandidat(textes);
  const peutPublier = publiable(textes) && motif.trim().length > 0;

  const differences = comparer(
    enVigueur,
    { ...brouillon, ...textes },
    formatMontant,
    jourEnFrancais,
  );
  const effet = effetDeLaPublication(dossiersConcernes, dossiersSousLaNouvelleRegle);

  const fautePour = (champ: ChampCandidat) => fautes.find((f) => f.champ === champ);

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre={`${brouillon.pays} — ${brouillon.procedure}`}
        resume={`Brouillon version ${brouillon.version} · version ${enVigueur.version} en vigueur pour ${dossiersConcernes} dossiers`}
        actions={
          <>
            <Button variante="secondaire">Enregistrer le brouillon</Button>
            <Button
              disabled={!peutPublier}
              raisonDesactivation={
                fautes.length > 0
                  ? "Un texte destiné au candidat est refusé : corrige-le avant de publier."
                  : "Renseigne le motif du changement : il part au journal d'audit."
              }
              onClick={() => setTentative(true)}
            >
              Publier la version {brouillon.version}
            </Button>
          </>
        }
      />

      <div className="flex gap-6 p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
            <h2 className="text-16 font-semibold text-ink-900">Valeurs de la règle</h2>

            <Champ
              libelle={brouillon.intituleMontant}
              valeur={formatMontant(brouillon.montant, brouillon.devise)}
              note={`Modifié · version ${enVigueur.version} : ${formatMontant(enVigueur.montant, enVigueur.devise)}`}
            />
            <Champ
              libelle="Applicable aux dépôts à partir du"
              valeur={jourEnFrancais(brouillon.applicableDepuis)}
              note={`Modifié · version ${enVigueur.version} : ${jourEnFrancais(enVigueur.applicableDepuis)}`}
            />
            <Champ
              libelle="Délai d'instruction"
              valeur={brouillon.delaiInstruction}
              note="Inchangé"
            />
            <Champ
              libelle="Source"
              valeur={`${brouillon.source} · ${LIBELLE_NIVEAU[brouillon.niveauSource]}`}
              note={
                visiblePourLeCandidat(brouillon.niveauSource)
                  ? "Visible par le candidat"
                  : "Source secondaire : cette règle n'est jamais affichée au candidat (INV-4)"
              }
            />
            <Champ
              libelle="Prochaine relecture"
              valeur={jourEnFrancais(brouillon.prochaineRelecture)}
            />
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-16 font-semibold text-ink-900">Textes affichés au candidat</h2>
              <p className="text-pretty text-13 text-ink-500">
                Ces deux champs passent le même vocabulaire interdit que le code de
                l&apos;interface. Une promesse de résultat y est refusée à
                l&apos;enregistrement, pas signalée après coup.
              </p>
            </div>

            {CHAMPS_CANDIDAT.map(({ cle, libelle }) => {
              const faute = fautePour(cle);
              return (
                <div key={cle} className="flex flex-col gap-1.5">
                  <label htmlFor={cle} className="text-14 font-medium text-ink-900">
                    {libelle}
                  </label>
                  <textarea
                    id={cle}
                    rows={3}
                    value={textes[cle]}
                    onChange={(e) =>
                      setTextes((p) => ({ ...p, [cle]: e.target.value }))
                    }
                    aria-invalid={faute ? true : undefined}
                    aria-describedby={`${cle}-aide`}
                    className={cn(
                      CHAMP_CONTROLE,
                      "h-auto py-2.5",
                      faute && "border-danger",
                    )}
                  />
                  <span
                    id={`${cle}-aide`}
                    role={faute ? "alert" : undefined}
                    className={cn("text-pretty text-13", faute ? "text-danger" : "text-ink-500")}
                  >
                    {faute
                      ? messageDeRefus(faute)
                      : cle === "libelleCandidat"
                        ? AIDE_LIBELLE_CANDIDAT
                        : "Affichée sous la règle, dans la checklist."}
                  </span>
                </div>
              );
            })}
          </section>

          <section className="flex flex-col gap-1.5 rounded-lg border border-ink-300 bg-white p-5">
            <label htmlFor="motif" className="text-14 font-medium text-ink-900">
              Motif du changement
            </label>
            <textarea
              id="motif"
              rows={2}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              aria-describedby="motif-aide"
              className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
            />
            <span id="motif-aide" className="text-13 text-ink-500">
              {AIDE_MOTIF}
            </span>
          </section>
        </div>

        <aside className="flex w-[340px] flex-none flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
            <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
              Différences avec la version {enVigueur.version}
            </h2>
            <p className="text-13 text-ink-500">
              {compterChangements(differences)} champ
              {compterChangements(differences) > 1 ? "s" : ""} modifié
              {compterChangements(differences) > 1 ? "s" : ""} sur {differences.length}
            </p>
            <dl className="flex flex-col">
              {differences.map((d) => (
                <div key={d.champ} className="flex flex-col gap-0.5 border-t border-ink-300 py-2">
                  <dt className="text-13 text-ink-500">{d.champ}</dt>
                  <dd className="text-pretty text-14 text-ink-900">
                    {aChange(d) ? (
                      <>
                        <span className="text-ink-500 line-through">{d.avant}</span>{" "}
                        <span aria-hidden="true">→</span> {d.apres}
                      </>
                    ) : (
                      <span className="text-ink-700">Inchangé</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
            <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
              Effet de la publication
            </h2>
            <dl className="flex flex-col">
              <Ligne intitule={`Dossiers en version ${enVigueur.version}`} valeur={effet.dossiersConcernes} />
              <Ligne intitule="Arbitrage candidat requis" valeur={effet.arbitragesRequis} />
              <Ligne intitule="Alertes envoyées" valeur={effet.alertes} />
              <Ligne intitule="Dossiers migrés" valeur={effet.migrationsAutomatiques} />
            </dl>
            <p className="text-pretty text-13 text-ink-500">{MENTION_SANS_MIGRATION}</p>
          </section>

          <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
            <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
              Historique
            </h2>
            <ul className="flex flex-col">
              {historique.map((h) => (
                <li
                  key={h.version}
                  className="flex items-baseline justify-between gap-3 border-t border-ink-300 py-2 text-14"
                >
                  <span className="text-ink-900">v{h.version}</span>
                  <span className="text-13 text-ink-500">
                    {jourEnFrancais(h.le)} · {h.par}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {tentative && peutPublier ? (
            <p aria-live="polite" className="text-pretty text-13 text-ink-700">
              Publication demandée. La version {brouillon.version} devient la référence
              des nouveaux dossiers ; les {effet.dossiersConcernes} dossiers existants
              gardent la leur.
            </p>
          ) : null}

          <p className="text-pretty text-13 text-ink-500">{MENTION_AUDIT}</p>
        </aside>
      </div>
    </div>
  );
}

function Champ({
  libelle,
  valeur,
  note,
}: {
  libelle: string;
  valeur: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-14 font-medium text-ink-900">{libelle}</span>
      <span className="text-16 text-ink-900">{valeur}</span>
      {note ? <span className="text-pretty text-13 text-ink-500">{note}</span> : null}
    </div>
  );
}

function Ligne({ intitule, valeur }: { intitule: string; valeur: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ink-300 py-2">
      <dt className="text-14 text-ink-700">{intitule}</dt>
      <dd className="text-16 font-semibold text-ink-900">{valeur}</dd>
    </div>
  );
}
