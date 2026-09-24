"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  CONSENTEMENTS,
  ETAT_INITIAL,
  libelleActifs,
  type CodeConsentement,
  type EtatConsentements,
} from "@/domain/comptes/consentements";
import {
  LIBELLE_ETAT_PARTAGE,
  MENTION_RETRAIT,
  PARTAGES_VIDES,
} from "@/domain/consultants/access";
import {
  MENTION_DECALAGE,
  RENDEZ_VOUS_VIDES,
} from "@/domain/consultants/annulation";
import type { Partage, RendezVousDuCandidat } from "@/server/lecture/consultants";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";

/**
 * A-05 — Consentements.
 *
 * L'état de départ vient de `ETAT_INITIAL`, où tout est à faux : l'écran ne
 * peut pas pré-accorder une autorisation, même par erreur de rédaction.
 *
 * Chaque interrupteur est relié à son titre et à sa description : un lecteur
 * d'écran annonce ce qui est autorisé, pas « activé, bouton ».
 *
 * L'état affiché vient du serveur, où chaque changement écrit une ligne
 * datée : un consentement est une preuve, et une preuve qu'on réécrit n'en
 * est plus une. Tant que la lecture n'a pas abouti, les interrupteurs
 * restent à faux — afficher « accordé » par optimisme, puis se rétracter,
 * serait le pire des deux états.
 *
 * **Les accords de partage sont ici aussi (RG-12.2).** Un accord nominatif
 * donné à un consultant est un consentement au sens ordinaire : daté,
 * nominatif, révocable. Il était annoncé révocable par T-04, par la case de
 * T-05 et par le courrier de confirmation, et la mention nommait cet
 * écran-ci — qui ne parlait que des autorisations générales. Il n'existait
 * donc aucun endroit pour retirer un accès qu'on avait promis retirable.
 */
export function Consentements() {
  const [etat, setEtat] = useState<EtatConsentements>({ ...ETAT_INITIAL });
  const [lu, setLu] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [enAttente, setEnAttente] = useState<Partial<EtatConsentements>>({});
  const prefixe = useId();

  useEffect(() => {
    let vivant = true;
    void appeler<{ etat: EtatConsentements }>("/api/comptes/consentements").then((r) => {
      if (!vivant) return;
      if (r.ok) setEtat(r.donnees.etat);
      else setEchec(r.echec);
      setLu(true);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const basculer = (code: CodeConsentement) => (actif: boolean) => {
    setEtat((precedent) => ({ ...precedent, [code]: actif }));
    setEnAttente((precedent) => ({ ...precedent, [code]: actif }));
  };

  /**
   * Chaque bascule est envoyée séparément. Un enregistrement groupé qui
   * échoue à mi-chemin laisserait une partie des autorisations accordées et
   * l'autre non, sans que l'écran sache laquelle — sur un consentement, ce
   * doute n'est pas acceptable.
   */
  async function enregistrer() {
    setEnvoi(true);
    setEchec(null);
    for (const [code, accorde] of Object.entries(enAttente)) {
      const resultat = await appeler("/api/comptes/consentements", {
        methode: "PUT",
        corps: { code, accorde },
      });
      if (!resultat.ok) {
        setEnvoi(false);
        setEchec(resultat.echec);
        return;
      }
      setEnAttente((precedent) => {
        const suite = { ...precedent };
        delete suite[code as CodeConsentement];
        return suite;
      });
    }
    setEnvoi(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 pb-8 md:flex-row md:gap-16 md:px-12 md:py-6">
      <div className="flex min-w-0 flex-col gap-5 md:w-[560px] md:flex-none">
        {/* Le lien s'appelait « Mon profil » et menait à l'écran de
            connexion : servi, donc invisible au test des liens morts, et
            faux pour quiconque est déjà connecté. */}
        <Link href="/profil" className="text-14 font-semibold text-ink-900">
          Mon profil
        </Link>

        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            Mes consentements
          </h1>
          <p className="text-pretty text-16 text-ink-700">
            Chaque autorisation est indépendante et révocable à tout moment. Le
            refus de l&apos;analyse des pièces d&apos;identité ne bloque pas ton
            compte.
          </p>
        </div>

        <ul className="flex flex-col border-b border-ink-300">
          {CONSENTEMENTS.map((consentement) => {
            const idTitre = `${prefixe}-${consentement.code}-titre`;
            const idTexte = `${prefixe}-${consentement.code}-texte`;
            return (
              <li
                key={consentement.code}
                className="flex items-start gap-4 border-t border-ink-300 px-0 py-5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span id={idTitre} className="text-16 font-semibold text-ink-900">
                    {consentement.titre}
                  </span>
                  <span id={idTexte} className="text-pretty text-14 text-ink-700">
                    {consentement.description}
                  </span>
                  {consentement.siRefuse ? (
                    <span className="text-pretty text-13 text-ink-500">
                      {consentement.siRefuse}
                    </span>
                  ) : null}
                </div>
                <Switch
                  idLibelle={idTitre}
                  idDescription={idTexte}
                  checked={etat[consentement.code]}
                  onChangement={basculer(consentement.code)}
                />
              </li>
            );
          })}
        </ul>

        <RendezVous />

        <Partages />

        <div className="flex flex-col gap-2">
          <Link
            href="/compte/mes-donnees"
            className="flex min-h-touch items-center text-14 text-accent-600"
          >
            Télécharger mes données
          </Link>
          <Link
            href="/compte/suppression"
            className="flex min-h-touch items-center text-14 text-accent-600"
          >
            Supprimer mon compte et mes pièces
          </Link>
          <p className="text-pretty text-13 text-ink-500">
            Historique des consentements conservé cinq ans, comme l&apos;exige la
            réglementation.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:w-72 md:flex-none md:border-0 md:p-0">
        {echec ? <BlocEchec echec={echec} /> : null}
        <Button
          pleineLargeur
          className="min-h-action"
          chargement={envoi}
          disabled={!lu || Object.keys(enAttente).length === 0}
          raisonDesactivation={
            !lu
              ? "Lecture de tes autorisations en cours."
              : Object.keys(enAttente).length === 0
                ? "Aucune autorisation n'a changé depuis le dernier enregistrement."
                : undefined
          }
          onClick={() => void enregistrer()}
        >
          Enregistrer
        </Button>
        <p aria-live="polite" className="text-center text-13 text-ink-500">
          {libelleActifs(etat)}
        </p>
      </div>
    </div>
  );
}

/**
 * Les dossiers ouverts à un consultant — RG-12.2.
 *
 * Les accords retirés et échus restent affichés : le retrait est un
 * retrait, pas une suppression, et une liste qui ne montre que l'ouvert ne
 * permet pas de vérifier qu'on a bien fermé. Ils portent leur état, et les
 * deux ne se confondent pas — un accès échu s'est fermé tout seul, un accès
 * retiré l'a été par quelqu'un.
 */
function Partages() {
  const [partages, setPartages] = useState<Partage[] | null>(null);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const lire = useCallback(async () => {
    const r = await appeler<{ partages: Partage[] }>("/api/comptes/partages");
    if (r.ok) setPartages(r.donnees.partages);
    else setEchec(r.echec);
  }, []);

  useEffect(() => {
    void lire();
  }, [lire]);

  async function retirer(id: string) {
    setEnCours(id);
    setEchec(null);
    const r = await appeler(`/api/comptes/partages/${id}/retrait`, { corps: {} });
    setEnCours(null);
    if (!r.ok) {
      setEchec(r.echec);
      return;
    }
    // L'état vient du serveur plutôt que d'une écriture optimiste : la date
    // du retrait est la sienne, et c'est elle qui compte.
    await lire();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-19 font-semibold text-ink-900">Dossiers partagés</h2>

      {echec ? <BlocEchec echec={echec} /> : null}

      {partages === null ? (
        <p role="status" className="text-14 text-ink-700">
          Lecture de tes partages en cours.
        </p>
      ) : partages.length === 0 ? (
        <p className="text-pretty text-14 text-ink-700">{PARTAGES_VIDES}</p>
      ) : (
        <>
          <ul className="flex flex-col border-b border-ink-300">
            {partages.map((partage) => (
              <li
                key={partage.id}
                className="flex flex-col gap-2 border-t border-ink-300 py-4 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-16 font-semibold text-ink-900">
                    {partage.consultant}
                  </span>
                  <span className="text-pretty text-14 text-ink-700">
                    {partage.cabinet} · {partage.dossier}
                  </span>
                  <span className="text-13 text-ink-500">
                    Accordé le {partage.donneLe} · {LIBELLE_ETAT_PARTAGE[partage.etat]} ·{" "}
                    {partage.echeance}
                  </span>
                </div>
                {partage.etat === "actif" ? (
                  <Button
                    variante="secondaire"
                    chargement={enCours === partage.id}
                    onClick={() => void retirer(partage.id)}
                  >
                    Retirer l&apos;accès
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-pretty text-13 text-ink-500">{MENTION_RETRAIT}</p>
        </>
      )}
    </section>
  );
}

/**
 * Les rendez-vous à venir, et le geste que trois surfaces promettaient.
 *
 * `conditions()` sous les créneaux, l'écran de confirmation de paiement et
 * le courrier de confirmation disaient tous « annulation ou report sans
 * frais jusqu'au […] ». Rien n'annulait : le seul chemin qui annulait un
 * rendez-vous était la suppression du compte. Un candidat qui voulait
 * décaler une heure devait effacer son dossier.
 *
 * Ils sont ici, avec les accords de partage, parce que c'est le même
 * écran : ce que le candidat a donné, et ce qu'il peut reprendre.
 *
 * **L'avertissement se lit avant, jamais après.** Découvrir après coup
 * qu'une consultation a été retenue, c'est avoir été trompé — même quand
 * la retenue est légitime. Il vient du domaine, cas par cas, et le cas qui
 * coûte ne s'ouvre pas sur une bonne nouvelle.
 */
function RendezVous() {
  const [liste, setListe] = useState<RendezVousDuCandidat[] | null>(null);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [suite, setSuite] = useState<string | null>(null);
  const [illisible, setIllisible] = useState(false);

  const lire = useCallback(async () => {
    const r = await appeler<{ rendezVous: RendezVousDuCandidat[] }>(
      "/api/comptes/rendez-vous",
    );
    if (!r.ok) {
      setEchec(r.echec);
      setIllisible(true);
      return;
    }
    /*
      Une réponse sans la liste n'est pas une liste vide. Afficher « aucun
      rendez-vous » sur une lecture qui a échoué ferait croire qu'il n'y a
      rien à annuler, sur l'écran même où l'on vient annuler.
    */
    if (!Array.isArray(r.donnees.rendezVous)) {
      setIllisible(true);
      return;
    }
    setIllisible(false);
    setListe(r.donnees.rendezVous);
  }, []);

  useEffect(() => {
    void lire();
  }, [lire]);

  async function annuler(reference: string) {
    setEnCours(reference);
    setEchec(null);
    const r = await appeler<{ mention: string }>(
      `/api/comptes/rendez-vous/${encodeURIComponent(reference)}/annulation`,
      { corps: {} },
    );
    setEnCours(null);
    if (!r.ok) {
      setEchec(r.echec);
      return;
    }
    // La suite vient du serveur : c'est lui qui sait si un remboursement a
    // été ouvert, et l'écrire ici en doublerait la décision.
    setSuite(r.donnees.mention);
    setAConfirmer(null);
    await lire();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-19 font-semibold text-ink-900">Rendez-vous à venir</h2>

      {echec ? <BlocEchec echec={echec} /> : null}

      {suite ? (
        <p role="status" className="text-pretty text-14 text-ink-700">
          {suite}
        </p>
      ) : null}

      {illisible ? (
        <p role="status" className="text-pretty text-14 text-ink-700">
          Tes rendez-vous n&apos;ont pas pu être lus. Réessaie dans un instant : rien
          n&apos;est perdu, et aucun rendez-vous n&apos;a été annulé.
        </p>
      ) : liste === null ? (
        <p role="status" className="text-14 text-ink-700">
          Lecture de tes rendez-vous en cours.
        </p>
      ) : liste.length === 0 ? (
        <p className="text-pretty text-14 text-ink-700">{RENDEZ_VOUS_VIDES}</p>
      ) : (
        <>
          <ul className="flex flex-col border-b border-ink-300">
            {liste.map((rdv) => (
              <li
                key={rdv.reference}
                className="flex flex-col gap-2 border-t border-ink-300 py-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-16 font-semibold text-ink-900">{rdv.quand}</span>
                    <span className="text-pretty text-14 text-ink-700">
                      {rdv.consultant} · {rdv.cabinet} · {rdv.dossier}
                    </span>
                    <span className="text-13 text-ink-500">
                      Référence {rdv.reference} · annulation sans frais jusqu&apos;au{" "}
                      {rdv.limite}
                    </span>
                  </div>
                  {aConfirmer === rdv.reference ? null : (
                    <Button
                      variante="secondaire"
                      onClick={() => {
                        setSuite(null);
                        setAConfirmer(rdv.reference);
                      }}
                    >
                      Annuler ce rendez-vous
                    </Button>
                  )}
                </div>

                {/* La confirmation porte l'avertissement du cas, et non un
                    « es-tu sûr ? » qui ne dit rien de ce qu'on perd. */}
                {aConfirmer === rdv.reference ? (
                  <div className="flex flex-col gap-3 rounded-lg bg-ink-100 p-4">
                    <p className="text-pretty text-14 text-ink-900">{rdv.avertissement}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        chargement={enCours === rdv.reference}
                        onClick={() => void annuler(rdv.reference)}
                      >
                        Confirmer l&apos;annulation
                      </Button>
                      <Button variante="secondaire" onClick={() => setAConfirmer(null)}>
                        Garder ce rendez-vous
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-pretty text-13 text-ink-500">{MENTION_DECALAGE}</p>
        </>
      )}
    </section>
  );
}
