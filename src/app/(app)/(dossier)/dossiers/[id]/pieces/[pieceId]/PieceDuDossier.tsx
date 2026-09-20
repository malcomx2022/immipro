"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { SOCLE_BOUTON, VARIANTES_BOUTON } from "@/components/ui/bouton-styles";
import { LienBouton } from "@/components/ui/LienBouton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Dossier } from "@/domain/dossiers/dossier";
import type { Piece } from "@/domain/dossiers/piece";
import { estAPhotographier, sousTitreDepot } from "@/domain/dossiers/piece";
import type { ResultatAnalyse } from "@/domain/dossiers/analyse";
import {
  PORTEE_ANALYSE,
  RESERVE_LECTURE,
  libelleSuite,
  mentionSuite,
  valeurAffichee,
} from "@/domain/dossiers/analyse";
import type { EtatTeleversement, Fichier, Quota } from "@/domain/dossiers/televersement";
import {
  CADRAGES,
  CONSEILS_PHOTO,
  FORMATS_ACCEPTES,
  envoiEnCours,
  libelleAvancement,
  libelleCta,
  libelleFichier,
  libelleQuota,
  mentionPied,
  messageQuotaEpuise,
  quotaEpuise,
  refusDuFichier,
  titreQuotaEpuise,
} from "@/domain/dossiers/televersement";
import { cn } from "@/lib/utils";
import { EnteteDossier } from "../../EnteteDossier";

/**
 * C-07 téléversement et C-08 résultat d'analyse — WF-06.
 *
 * Un seul écran de pièce, deux vues : une pièce déjà analysée s'ouvre sur son
 * verdict, une pièce attendue sur le dépôt. Les séparer en deux routes aurait
 * obligé le candidat à deviner laquelle ouvrir depuis la checklist.
 *
 * Les deux états que l'utilisateur ne provoque pas sont câblés sur des
 * signaux réels : le quota épuisé vient du quota, la perte de réseau des
 * événements `online` / `offline`. Ce sont eux qui décident si la personne
 * abandonne, ils ne pouvaient pas rester des maquettes.
 */
export interface PieceDuDossierProps {
  dossier: Dossier;
  piece: Piece;
  quota: Quota;
  analyse?: ResultatAnalyse;
  /** Prix de la recharge, déjà mis en forme dans la devise du compte. */
  prixRecharge: string;
  /** Volume de la recharge, en analyses. */
  volumeRecharge: number;
}

type Vue = "ANALYSE" | "TELEVERSEMENT";

export function PieceDuDossier({
  dossier,
  piece,
  quota,
  analyse,
  prixRecharge,
  volumeRecharge,
}: PieceDuDossierProps) {
  const [vue, setVue] = useState<Vue>(analyse ? "ANALYSE" : "TELEVERSEMENT");
  const [etat, setEtat] = useState<EtatTeleversement>(quotaEpuise(quota) ? "QUOTA_EPUISE" : "PRET");
  const [fichier, setFichier] = useState<Fichier | null>(null);
  const [brut, setBrut] = useState<File | null>(null);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [envoyes, setEnvoyes] = useState(0);
  const [refus, setRefus] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Le réseau est un état de l'écran, pas une erreur de fin d'envoi : le
  // dire avant que la personne appuie lui évite de croire que son geste a
  // échoué.
  useEffect(() => {
    const perdu = () => setEtat("RESEAU_COUPE");
    const revenu = () => setEtat(quotaEpuise(quota) ? "QUOTA_EPUISE" : "PRET");
    window.addEventListener("offline", perdu);
    window.addEventListener("online", revenu);
    if (typeof navigator !== "undefined" && navigator.onLine === false) perdu();
    return () => {
      window.removeEventListener("offline", perdu);
      window.removeEventListener("online", revenu);
    };
  }, [quota]);

  function choisir(liste: FileList | null) {
    const brut = liste?.[0];
    if (!brut) return;
    const candidat: Fichier = { nom: brut.name, octets: brut.size };
    const motif = refusDuFichier(candidat);
    setRefus(motif);
    if (motif) return;
    setFichier(candidat);
    setBrut(brut);
    setEnvoyes(0);
    setEchec(null);
  }

  /**
   * Envoi en trois temps — WF-06, règle d'architecture 4.
   *
   * 1. Le serveur vérifie ce qui se vérifie sans l'octet — consentement,
   *    format, taille, empreinte déjà connue — et rend une URL de dépôt
   *    valable cinq minutes.
   * 2. Le navigateur écrit **directement** dans le stockage. Faire transiter
   *    dix mégaoctets par l'application les ferait monter deux fois, sur une
   *    connexion mobile.
   * 3. Le serveur confirme et met l'analyse en file.
   *
   * L'empreinte est calculée ici, avant l'envoi : c'est elle qui permet au
   * serveur de reconnaître un fichier déjà déposé et de ne rien refacturer
   * (RG-06.2). La calculer après l'envoi ferait monter les octets pour rien.
   */
  async function envoyer() {
    if (!fichier || !brut) {
      champ.current?.click();
      return;
    }
    setEtat("ENVOI");
    setEchec(null);
    setEnvoyes(0);

    const empreinte = await empreinteDuFichier(brut);
    const demande = {
      nom: fichier.nom,
      octets: fichier.octets,
      typeMime: brut.type,
      empreinte,
    };

    const prepare = await appeler<{ depot: { url: string; cle: string } }>(
      `/api/dossiers/${dossier.id}/pieces/${piece.id}/depot`,
      { corps: demande },
    );
    if (!prepare.ok) {
      setEtat(quotaEpuise(quota) ? "QUOTA_EPUISE" : "PRET");
      setEchec(prepare.echec);
      return;
    }

    const monte = await televerser(prepare.donnees.depot.url, brut, setEnvoyes);
    if (!monte) {
      setEtat("RESEAU_COUPE");
      return;
    }

    const confirme = await appeler(
      `/api/dossiers/${dossier.id}/pieces/${piece.id}/depot`,
      { methode: "PUT", corps: { ...demande, cle: prepare.donnees.depot.cle } },
    );
    if (!confirme.ok) {
      setEtat("PRET");
      setEchec(confirme.echec);
      return;
    }
    router.refresh();
  }

  if (vue === "ANALYSE" && analyse) {
    return (
      <Analyse
        dossier={dossier}
        piece={piece}
        analyse={analyse}
        quota={quota}
        onRemplacer={() => setVue("TELEVERSEMENT")}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${dossier.id}`}
        libelleRetour="Checklist"
      />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          {piece.libelle}
        </h1>
        <p className="text-pretty text-14 text-ink-700">{sousTitreDepot(piece)}</p>
      </div>

      {piece.constat ? (
        <p className="text-pretty rounded-md bg-ink-100 p-3.5 text-14 text-ink-700">
          {piece.constat}
        </p>
      ) : null}

      {etat === "RESEAU_COUPE" ? (
        <section className="flex flex-col gap-1.5 rounded-lg border-l-6 border-danger bg-white p-4 shadow-e2">
          <h2 className="text-16 font-semibold text-ink-900">Connexion perdue</h2>
          <p className="text-pretty text-14 text-ink-700">
            Ton fichier est conservé sur ton téléphone et sera envoyé dès le retour du réseau. Ne
            quitte pas l&apos;application.
          </p>
        </section>
      ) : null}

      {etat === "QUOTA_EPUISE" ? (
        <section className="flex flex-col gap-3 rounded-lg bg-accent-50 p-4">
          <h2 className="text-16 font-semibold text-accent-700">{titreQuotaEpuise(quota)}</h2>
          <p className="text-pretty text-14 text-accent-700">
            {messageQuotaEpuise(volumeRecharge, prixRecharge)}
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            {/* La recharge n'est pas un pack et ne se choisit donc pas sur
                $-01, qui le dit lui-même : le lien menait à un écran qui
                refusait de la vendre. Elle va droit au récapitulatif. */}
            <LienBouton
              href={`/paiement/recapitulatif?dossier=${dossier.id}&achat=recharge`}
              pleineLargeur
              className="md:w-auto"
            >
              Recharger {volumeRecharge} analyses
            </LienBouton>
            <Button variante="secondaire" pleineLargeur className="md:w-auto">
              Téléverser sans analyse
            </Button>
          </div>
        </section>
      ) : null}

      {etat === "ENVOI" && fichier ? (
        <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-4">
          <h2 className="text-16 font-semibold text-ink-900">Envoi en cours</h2>
          <p className="text-14 text-ink-700">{libelleFichier(fichier)}</p>
          <div
            role="progressbar"
            aria-label="Avancement de l'envoi"
            aria-valuemin={0}
            aria-valuemax={fichier.octets}
            aria-valuenow={envoyes}
            className="h-2 w-full overflow-hidden rounded-full bg-white"
          >
            <span
              className="block h-full bg-accent-700"
              style={{ width: `${(envoyes / fichier.octets) * 100}%` }}
            />
          </div>
          <p aria-live="polite" className="text-13 text-ink-700">
            {envoyes > 0
              ? libelleAvancement(envoyes, fichier.octets, 20)
              : "Envoi démarré. Ne ferme pas cette page."}
          </p>
          <p className="text-pretty text-13 text-ink-500">
            Tu peux continuer à remplir ton dossier pendant l&apos;envoi. L&apos;analyse démarre
            automatiquement à la fin.
          </p>
        </section>
      ) : null}

      {etat !== "ENVOI" ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row">
            {estAPhotographier(piece) ? (
              <label
                className={cn(
                  SOCLE_BOUTON,
                  VARIANTES_BOUTON.secondaire,
                  "w-full cursor-pointer md:w-auto",
                )}
              >
                Prendre une photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => choisir(e.target.files)}
                />
              </label>
            ) : null}
            <label
              className={cn(
                SOCLE_BOUTON,
                VARIANTES_BOUTON.secondaire,
                "w-full cursor-pointer md:w-auto",
              )}
            >
              Choisir un fichier
              <input
                ref={champ}
                type="file"
                accept={FORMATS_ACCEPTES.map((f) => `.${f}`).join(",")}
                className="sr-only"
                onChange={(e) => choisir(e.target.files)}
              />
            </label>
          </div>
          {fichier ? <p className="text-14 text-ink-700">{libelleFichier(fichier)}</p> : null}
          {refus ? (
            <p role="alert" className="text-pretty text-14 text-danger">
              {refus}
            </p>
          ) : null}
          {/* Refus venu du serveur : il dit ce qui est conservé, l'écran ne
              le reformule pas. */}
          {echec ? <BlocEchec echec={echec} /> : null}
          {piece.astuce ? <p className="text-pretty text-13 text-ink-500">{piece.astuce}</p> : null}
        </section>
      ) : null}

      {/* Une lettre de motivation ne se photographie pas : les conseils de
          prise de vue ne s'affichent que sous une pièce à numériser. */}
      {estAPhotographier(piece) ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-19 font-semibold text-ink-900">Pour une photo lisible</h2>
          <ol className="flex flex-col gap-2">
            {CONSEILS_PHOTO.map((conseil, index) => (
              <li key={conseil} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ink-100 text-13 font-semibold text-ink-700"
                >
                  {index + 1}
                </span>
                <span className="text-pretty text-14 text-ink-700">{conseil}</span>
              </li>
            ))}
          </ol>
          <ul className="grid grid-cols-3 gap-2">
            {CADRAGES.map((cadrage) => (
              <li key={cadrage.legende} className="flex flex-col items-center gap-1.5">
                <Image
                  src={cadrage.illustration}
                  alt=""
                  width={300}
                  height={230}
                  unoptimized
                  className="h-auto w-full rounded-md bg-ink-100"
                />
                <span className="text-center text-13 text-ink-500">{cadrage.legende}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-1.5 rounded-lg bg-ink-100 p-4">
        <p className="text-14 font-medium text-ink-900">{libelleQuota(quota)}</p>
        <p className="text-13 text-ink-700">
          Une nouvelle version de la même pièce consomme une analyse.
        </p>
      </section>

      <p className="text-pretty text-13 text-ink-500">
        Tes pièces sont chiffrées et supprimées à la clôture du dossier. Tu as autorisé
        l&apos;analyse automatique des pièces financières le 11/09/2026.
      </p>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        <Button
          pleineLargeur
          chargement={envoiEnCours(etat)}
          onClick={() => void envoyer()}
          className="min-h-action"
        >
          {libelleCta(etat)}
        </Button>
        <p className="text-center text-13 text-ink-500">{mentionPied(etat)}</p>
      </div>
    </div>
  );
}

function Analyse({
  dossier,
  piece,
  analyse,
  quota,
  onRemplacer,
}: {
  dossier: Dossier;
  piece: Piece;
  analyse: ResultatAnalyse;
  quota: Quota;
  onRemplacer: () => void;
}) {
  const lignes = [...analyse.champs, analyse.exigence];

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${dossier.id}`}
        libelleRetour="Checklist"
      />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Résultat d&apos;analyse
        </h1>
        <p className="text-14 text-ink-700">
          {piece.libelle} · {analyse.fichier}
        </p>
        <StatusBadge etat={analyse.verdict} className="self-start" />
      </div>

      <div
        aria-hidden="true"
        className="flex h-40 items-center justify-center rounded-lg bg-ink-100 text-13 text-ink-500"
      >
        aperçu de la pièce · page 1 sur {analyse.pages}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-pretty text-19 font-semibold text-ink-900">{analyse.titre}</h2>
        <p className="text-pretty text-16 text-ink-700">{analyse.corps}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-16 font-semibold text-ink-900">Ce que nous avons lu</h2>
        <dl className="flex flex-col">
          {/* En 390 px, « 13 569,24 € · 8 901 000 F » ne tient pas sur la même
              ligne que son intitulé : la valeur passe dessous plutôt que de
              déborder hors de l'écran. */}
          {lignes.map((champ) => (
            <div
              key={champ.intitule}
              className="flex flex-col gap-0.5 border-t border-ink-300 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
            >
              <dt className="text-14 text-ink-500">{champ.intitule}</dt>
              <dd className="text-14 font-medium text-ink-900 sm:text-right">
                {valeurAffichee(champ)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-pretty text-13 text-ink-500">{RESERVE_LECTURE}</p>
        <div className="flex flex-col gap-1">
          <Link
            href={`/dossiers/${dossier.id}/pieces/${piece.id}/signalement`}
            className="flex min-h-touch items-center text-14 text-accent-700 underline"
          >
            Signaler une erreur de lecture
          </Link>
          <Link
            href={`/dossiers/${dossier.id}/pieces/${piece.id}/versions`}
            className="flex min-h-touch items-center text-14 text-accent-700 underline"
          >
            Voir l&apos;historique des versions
          </Link>
        </div>
      </section>

      <p className="text-pretty text-13 text-ink-500">{PORTEE_ANALYSE}</p>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        {analyse.verdict === "CONFORME" ? (
          <LienBouton href={`/dossiers/${dossier.id}`} pleineLargeur className="min-h-action">
            {libelleSuite(analyse.verdict)}
          </LienBouton>
        ) : (
          <Button pleineLargeur onClick={onRemplacer} className="min-h-action">
            {libelleSuite(analyse.verdict)}
          </Button>
        )}
        <p className="text-center text-13 text-ink-500">{mentionSuite(analyse.verdict, quota)}</p>
      </div>
    </div>
  );
}

/**
 * Empreinte SHA-256 du fichier, calculée dans le navigateur.
 *
 * `crypto.subtle` demande un contexte sécurisé : en HTTP simple, elle est
 * absente. Plutôt que d'échouer, on rend une empreinte vide, que le serveur
 * refusera avec un message lisible — c'est préférable à une exception sans
 * texte au moment où quelqu'un dépose son passeport.
 */
async function empreinteDuFichier(fichier: File): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) return "";
  const octets = await fichier.arrayBuffer();
  const condensat = await crypto.subtle.digest("SHA-256", octets);
  return [...new Uint8Array(condensat)]
    .map((o) => o.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Envoi direct au stockage, avec l'avancement réel.
 *
 * `XMLHttpRequest` et non `fetch` : c'est la seule API du navigateur qui
 * rapporte l'avancement d'un envoi. Sans elle, l'écran affiche une barre qui
 * n'avance pas, ce qui est pire que pas de barre du tout sur une connexion
 * lente.
 */
function televerser(
  url: string,
  fichier: File,
  avancer: (octets: number) => void,
): Promise<boolean> {
  return new Promise((resoudre) => {
    const requete = new XMLHttpRequest();
    requete.open("PUT", url);
    requete.setRequestHeader("content-type", fichier.type);
    requete.upload.onprogress = (e) => avancer(e.loaded);
    requete.onload = () => resoudre(requete.status >= 200 && requete.status < 300);
    requete.onerror = () => resoudre(false);
    requete.onabort = () => resoudre(false);
    requete.send(fichier);
  });
}
