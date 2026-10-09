"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { CONSENTEMENTS } from "@/domain/comptes/consentements";
import { HORS_LIGNE, appeler } from "@/lib/api";
import { ECHECS, type EchecCandidat } from "@/domain/echecs/catalogue";
import { SOCLE_BOUTON, VARIANTES_BOUTON } from "@/components/ui/bouton-styles";
import { LienBouton } from "@/components/ui/LienBouton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Dossier } from "@/domain/dossiers/dossier";
import { attendUneSuite } from "@/domain/dossiers/dossier";
import type { Piece } from "@/domain/dossiers/piece";
import { estAPhotographier, estDeposeeNonVerifiee, sousTitreDepot } from "@/domain/dossiers/piece";
import type { ControleDuDepot } from "@/domain/dossiers/quarantaine";
import type { ResultatAnalyse } from "@/domain/dossiers/analyse";
import {
  PORTEE_ANALYSE,
  RESERVE_LECTURE,
  libelleSuite,
  mentionDeRelecture,
  mentionSuite,
  valeurAffichee,
} from "@/domain/dossiers/analyse";
import { AUTRE_CHOSE, refusDuSignalement } from "@/domain/dossiers/signalement";
import type { Coupure, EtatTeleversement, Fichier, Quota } from "@/domain/dossiers/televersement";
import {
  CADRAGES,
  CONSEILS_PHOTO,
  DELAI_DE_RELANCE_MS,
  RELANCES_AUTOMATIQUES,
  messageCoupure,
  FORMATS_ACCEPTES,
  envoiEnCours,
  libelleAvancement,
  libelleCta,
  libelleFichier,
  libelleQuota,
  mentionPendantEnvoi,
  mentionPied,
  messageQuotaEpuise,
  quotaEpuise,
  refusDuFichier,
  titreQuotaEpuise,
} from "@/domain/dossiers/televersement";
import { cn } from "@/lib/utils";
import { MENTION_AU_CHOIX, SANS_EXIGENCE_CHIFFREE } from "@/domain/dossiers/verification";
import { SourceNote } from "@/components/ui/SourceNote";
import { EnteteDossier } from "../../EnteteDossier";
import { CODE_MONTEE_DOSSIER } from "@/domain/payments/montee";

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
  /**
   * L'autorisation de traiter les pièces d'identité (RG-02.1, RG-02.2),
   * lue côté serveur au rendu. Sans elle, aucun dépôt n'est accepté.
   */
  autorise?: boolean;
  analyse?: ResultatAnalyse;
  /**
   * Ce que le contrôle de sécurité a dit du dernier fichier déposé, lu sur
   * la version au rendu. `null` tant qu'aucun fichier n'est déposé.
   */
  controle?: ControleDuDepot | null;
  /** Prix de la recharge, déjà mis en forme dans la devise du compte. */
  prixRecharge: string;
  /** Volume de la recharge, en analyses. */
  volumeRecharge: number;
  /**
   * Prix du passage à Dossier, mis en forme, quand le dossier est couvert
   * par Essentiel et peut passer à Dossier au prix de la différence (S.88).
   */
  prixPassage?: string | null;
}

type Vue = "ANALYSE" | "TELEVERSEMENT";

export function PieceDuDossier({
  dossier,
  piece,
  quota,
  autorise = true,
  analyse,
  controle = null,
  prixRecharge,
  volumeRecharge,
  prixPassage = null,
}: PieceDuDossierProps) {
  const [vue, setVue] = useState<Vue>(analyse ? "ANALYSE" : "TELEVERSEMENT");
  const [etat, setEtat] = useState<EtatTeleversement>(quotaEpuise(quota) ? "QUOTA_EPUISE" : "PRET");
  const [fichier, setFichier] = useState<Fichier | null>(null);
  const [brut, setBrut] = useState<File | null>(null);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [envoyes, setEnvoyes] = useState(0);
  const [refus, setRefus] = useState<string | null>(null);
  /**
   * Ce que le serveur a répondu sur le sort de la pièce (RG-06.5).
   *
   * Les deux appels du dépôt le portent, et personne ne le lisait : l'écran
   * annonçait « L'analyse démarre automatiquement à la fin » quel que soit
   * le quota. Il part d'une estimation locale — le compteur affiché —, puis
   * suit la réponse du serveur, qui relit le solde : entre le moment où la
   * page a été rendue et celui où le fichier monte, une autre pièce a pu
   * consommer la dernière analyse.
   */
  const [analysera, setAnalysera] = useState(!quotaEpuise(quota));
  /*
    L'autorisation est demandée ici, au moment où elle sert — 03/10/2026.

    En test de production, le dépôt n'aboutissait pas : sans autorisation,
    le serveur refusait la pièce (« L'analyse de tes pièces demande ton
    autorisation ») et l'écran ne donnait aucun moyen de l'accorder — le
    bloc annonçait « Ouvrir mes autorisations » sans lien. Le candidat
    restait devant un bouton qui ne menait nulle part.

    La case est la même autorisation que celle de « Mes consentements » :
    séparée des conditions, décochée par défaut, enregistrée avec sa date
    et révocable (RG-02.1). L'état vit dans le composant et ne se
    réinitialise pas quand la page se rafraîchit après un dépôt.
  */
  const [consenti, setConsenti] = useState(autorise);
  const [enregistrementConsentement, setEnregistrementConsentement] = useState(false);
  const [echecConsentement, setEchecConsentement] = useState<EchecCandidat | null>(null);
  /**
   * Le fichier vient d'arriver et le serveur l'a confirmé — 03/10/2026.
   *
   * L'écran restait sur « Envoi en cours » : la confirmation réussie
   * rafraîchissait la page, mais l'état de l'envoi vit dans le composant,
   * et rien ne le faisait sortir de `ENVOI`. Le fichier était sur le
   * serveur, la barre disait le contraire.
   */
  const [recu, setRecu] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const router = useRouter();
  /*
    S.157, R-02 — « sera envoyé dès le retour du réseau ». Trouvé par la
    recette RF-5 : au retour du réseau, l'écran revenait à « prêt » et rien
    ne partait ; qui attendait, comme on le lui avait dit, attendait en
    vain. L'envoi coupé repart désormais de lui-même, une fois, avec le même
    fichier : au retour du réseau, ou après quelques secondes si le
    navigateur se croit déjà en ligne (le stockage, lui, ne répondait pas).
    Un double envoi n'est pas à craindre : rien n'est enregistré avant la
    confirmation, et une empreinte déjà connue est refusée (RG-06.2).
  */
  const [coupureEnCours, setCoupureEnCours] = useState<Coupure>("HORS_LIGNE");
  const aRelancer = useRef(false);
  const relancesRestantes = useRef(RELANCES_AUTOMATIQUES);
  const minuteurDeRelance = useRef<number | null>(null);
  const envoiCourant = useRef<(auto: boolean) => Promise<void>>(async () => undefined);

  /*
    Le contrôle se fait hors de la page, en quelques secondes : l'écran se
    relit tant qu'il est en cours, pour que son issue apparaisse sans que
    la personne recharge. Pas au-delà de deux minutes — passé ce délai, la
    mention d'attente prend le relais et dit ce qui se passe.
  */
  const controleEnCours = controle?.etat === "EN_QUARANTAINE";
  useEffect(() => {
    if (!controleEnCours) return;
    const debut = Date.now();
    const minuteur = window.setInterval(() => {
      if (Date.now() - debut > RELECTURE_MAXI_MS) window.clearInterval(minuteur);
      else router.refresh();
    }, RELECTURE_MS);
    return () => window.clearInterval(minuteur);
  }, [controleEnCours, router]);

  // L'analyse d'un fichier qu'on vient de déposer s'ouvre d'elle-même dès
  // qu'elle arrive : c'est la suite attendue du geste.
  useEffect(() => {
    if (recu && analyse) setVue("ANALYSE");
  }, [recu, analyse]);

  // Le réseau est un état de l'écran, pas une erreur de fin d'envoi : le
  // dire avant que la personne appuie lui évite de croire que son geste a
  // échoué.
  useEffect(() => {
    const perdu = () => setEtat("RESEAU_COUPE");
    const revenu = () => {
      if (aRelancer.current) relancer();
      else setEtat(quotaEpuise(quota) ? "QUOTA_EPUISE" : "PRET");
    };
    window.addEventListener("offline", perdu);
    window.addEventListener("online", revenu);
    if (typeof navigator !== "undefined" && navigator.onLine === false) perdu();
    return () => {
      window.removeEventListener("offline", perdu);
      window.removeEventListener("online", revenu);
    };
  }, [quota]);

  // La relance appelle l'envoi du dernier rendu, celui qui connaît le fichier.
  useEffect(() => {
    envoiCourant.current = envoyer;
  });
  useEffect(
    () => () => {
      if (minuteurDeRelance.current !== null) window.clearTimeout(minuteurDeRelance.current);
    },
    [],
  );

  function relancer() {
    if (!aRelancer.current) return;
    aRelancer.current = false;
    if (minuteurDeRelance.current !== null) window.clearTimeout(minuteurDeRelance.current);
    minuteurDeRelance.current = null;
    relancesRestantes.current -= 1;
    void envoiCourant.current(true);
  }

  /** L'envoi n'a pas joint le serveur ou le stockage : on garde le fichier. */
  function coupure() {
    setEtat("RESEAU_COUPE");
    if (relancesRestantes.current <= 0) {
      setCoupureEnCours("RELANCE_ECHOUEE");
      return;
    }
    setCoupureEnCours("ENVOI_EN_ATTENTE");
    aRelancer.current = true;
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      minuteurDeRelance.current = window.setTimeout(relancer, DELAI_DE_RELANCE_MS);
    }
  }

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
  async function autoriser(coche: boolean) {
    if (!coche) return;
    setEnregistrementConsentement(true);
    setEchecConsentement(null);
    const resultat = await appeler<{ accorde: boolean }>("/api/comptes/consentements", {
      methode: "PUT",
      corps: { code: "pieces_identite", accorde: true },
    });
    setEnregistrementConsentement(false);
    if (resultat.ok) setConsenti(true);
    else setEchecConsentement(resultat.echec);
  }

  async function envoyer(auto = false) {
    if (!consenti) return;
    if (!fichier || !brut) {
      if (!auto) champ.current?.click();
      return;
    }
    // Un envoi lancé à la main rouvre le droit à une relance automatique.
    if (!auto) relancesRestantes.current = RELANCES_AUTOMATIQUES;
    aRelancer.current = false;
    setCoupureEnCours("HORS_LIGNE");
    setEtat("ENVOI");
    setEchec(null);
    setEnvoyes(0);
    setRecu(null);

    const empreinte = await empreinteDuFichier(brut);
    const demande = {
      nom: fichier.nom,
      octets: fichier.octets,
      typeMime: brut.type,
      empreinte,
    };

    const prepare = await appeler<{
      depot: { url: string; cle: string };
      analyseraLaPiece: boolean;
    }>(`/api/dossiers/${dossier.id}/pieces/${piece.id}/depot`, { corps: demande });
    if (!prepare.ok && prepare.echec === HORS_LIGNE) {
      coupure();
      return;
    }
    if (!prepare.ok) {
      setEtat(quotaEpuise(quota) ? "QUOTA_EPUISE" : "PRET");
      // Autorisation retirée entre-temps, depuis un autre appareil : la case
      // revient plutôt qu'un refus sans issue.
      if (prepare.echec.titre === TITRE_CONSENTEMENT_MANQUANT) setConsenti(false);
      else setEchec(prepare.echec);
      return;
    }
    setAnalysera(prepare.donnees.analyseraLaPiece);

    const monte = await televerser(prepare.donnees.depot.url, brut, setEnvoyes);
    if (!monte) {
      coupure();
      return;
    }

    const confirme = await appeler<{ analyseraLaPiece: boolean }>(
      `/api/dossiers/${dossier.id}/pieces/${piece.id}/depot`,
      { methode: "PUT", corps: { ...demande, cle: prepare.donnees.depot.cle } },
    );
    if (!confirme.ok) {
      setEtat("PRET");
      setEchec(confirme.echec);
      return;
    }
    // Le serveur relit le solde à la confirmation : c'est sa réponse qui
    // décide, pas celle de la préparation.
    setAnalysera(confirme.donnees.analyseraLaPiece);
    setRecu(fichier.nom);
    setFichier(null);
    setBrut(null);
    if (champ.current) champ.current.value = "";
    setEtat(quotaEpuise(quota) ? "QUOTA_EPUISE" : "PRET");
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
    <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
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

      {recu ? (
        <p
          role="status"
          className="text-pretty rounded-md border-l-6 border-success bg-white p-3.5 text-14 text-ink-900 shadow-e2"
        >
          Ton fichier « {recu} » est bien arrivé.
        </p>
      ) : null}

      {controle ? (
        <section
          aria-live="polite"
          className={cn(
            "flex flex-col gap-1.5 rounded-lg p-4",
            controle.etat === "INFECTEE"
              ? "border-l-6 border-danger bg-white shadow-e2"
              : "bg-ink-100",
          )}
        >
          <h2 className="text-16 font-semibold text-ink-900">{controle.titre}</h2>
          <p className="text-pretty text-14 text-ink-700">{controle.corps}</p>
          {/* Pourquoi l'analyse ne suit pas (RG-06.5) : le motif est écrit
              sur la pièce par le balayage. */}
          {controle.etat === "SAINE" && estDeposeeNonVerifiee(piece) && piece.message ? (
            <p className="text-pretty text-13 text-ink-700">{piece.message}</p>
          ) : null}
        </section>
      ) : null}

      {etat === "RESEAU_COUPE" ? (
        <section className="flex flex-col gap-1.5 rounded-lg border-l-6 border-danger bg-white p-4 shadow-e2">
          <h2 className="text-16 font-semibold text-ink-900">Connexion perdue</h2>
          <p className="text-pretty text-14 text-ink-700">{messageCoupure(coupureEnCours)}</p>
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
              Ajouter des analyses
            </LienBouton>
            {/* S.88 — sur un dossier Essentiel, le passage à Dossier se
                propose à côté de la recharge, sous son propre nom : l'un
                change la couverture, l'autre ajoute des analyses. */}
            {prixPassage ? (
              <LienBouton
                href={`/paiement/recapitulatif?dossier=${dossier.id}&achat=${CODE_MONTEE_DOSSIER}`}
                variante="secondaire"
                pleineLargeur
                className="md:w-auto"
              >
                Passer à Dossier — {prixPassage}
              </LienBouton>
            ) : null}
            {/*
              Le dépôt sans analyse n'avait pas de route à écrire : RG-06.5
              l'avait déjà tranché, et toute la chaîne l'appliquait. Le
              dépôt vérifie le solde, le balayage promeut le fichier et
              remet la pièce en attente sans mettre l'analyse en file. Seul
              ce bouton n'était relié à rien — c'est le même geste que
              « Ajouter la pièce », à ceci près qu'on sait d'avance que
              l'analyse ne suivra pas.
            */}
            <Button
              variante="secondaire"
              pleineLargeur
              className="md:w-auto"
              disabled={!consenti}
              raisonDesactivation={
                consenti ? undefined : "Coche l'autorisation ci-dessus pour déposer ta pièce."
              }
              onClick={() => void envoyer()}
            >
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
          <p className="text-pretty text-13 text-ink-500">{mentionPendantEnvoi(analysera)}</p>
        </section>
      ) : null}

      {!consenti ? (
        <section className="flex flex-col gap-3 rounded-lg border border-ink-300 p-4">
          <h2 className="text-16 font-semibold text-ink-900">
            Ton autorisation est nécessaire pour déposer une pièce
          </h2>
          <p className="text-pretty text-14 text-ink-700">{AUTORISATION_PIECES.siRefuse}</p>
          <Checkbox
            libelle="J'autorise l'analyse de mes pièces d'identité"
            description={AUTORISATION_PIECES.description}
            checked={false}
            disabled={enregistrementConsentement}
            onChangement={(coche) => void autoriser(coche)}
          />
          {echecConsentement ? <BlocEchec echec={echecConsentement} /> : null}
          <p className="text-pretty text-13 text-ink-500">
            Tu peux la retirer à tout moment dans{" "}
            <Link href="/consentements" className="text-accent-600 underline">
              Mes consentements
            </Link>
            .
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

      {/* La phrase affirmait « Tu as autorisé l'analyse automatique des
          pièces financières le 11/09/2026 » à tous les candidats : une
          autorisation et une date inventées. */}
      <p className="text-pretty text-13 text-ink-500">
        Tes pièces sont chiffrées et supprimées à la clôture du dossier.
        {consenti ? (
          <>
            {" "}
            Tes autorisations se gèrent dans{" "}
            <Link href="/consentements" className="text-accent-600 underline">
              Mes consentements
            </Link>
            .
          </>
        ) : null}
      </p>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        <Button
          pleineLargeur
          chargement={envoiEnCours(etat)}
          disabled={!consenti}
          raisonDesactivation={
            consenti ? undefined : "Coche l'autorisation ci-dessus pour déposer ta pièce."
          }
          onClick={() => void envoyer()}
          className="min-h-action"
        >
          {libelleCta(etat)}
        </Button>
        <p className="text-center text-13 text-ink-500">{mentionPied(etat, coupureEnCours)}</p>
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
  /*
    Les champs lus, et eux seuls. L'exigence de la règle était ajoutée
    ici, à la suite : elle s'affichait donc sous « Ce que nous avons lu »,
    c'est-à-dire parmi ce qui a été lu **dans le fichier du candidat**.
    Elle n'en vient pas — elle vient du référentiel — et quand elle
    manquait, `valeurAffichee` la rendait « non lue », le mot qui dit à
    quelqu'un que sa pièce était illisible.
  */
  const lignes = analyse.champs;
  const relue = analyse.relecture?.etat === "TRANCHEE";
  const enRelecture = analyse.relecture ? mentionDeRelecture(analyse.relecture) : null;

  return (
    <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
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
        {/* S.157, R-01 — la décision ci-dessus a remplacé cette lecture. */}
        {relue ? (
          <p className="text-pretty text-13 text-ink-500">
            Lecture automatique, avant la relecture. La décision de la personne qui a relu ta
            pièce la remplace.
          </p>
        ) : null}
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
        {analyse.relecture ? (
          enRelecture ? (
            <p role="status" className="text-pretty rounded-md bg-ink-100 p-3.5 text-14 text-ink-700">
              {enRelecture}
            </p>
          ) : null
        ) : (
          <>
            <p className="text-pretty text-13 text-ink-500">{RESERVE_LECTURE}</p>
            {/* Un dossier déposé ou clos garde ses pièces telles quelles : rien à relire. */}
            {attendUneSuite(dossier) ? (
              <Signalement
                dossierId={dossier.id}
                pieceId={piece.id}
                lus={lignes.map((c) => c.intitule)}
              />
            ) : null}
          </>
        )}
        <div className="flex flex-col gap-1">
          <Link
            href={`/dossiers/${dossier.id}/pieces/${piece.id}/versions`}
            className="flex min-h-touch items-center text-14 text-accent-700 underline"
          >
            Voir l&apos;historique des versions
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-16 font-semibold text-ink-900">Ce que la règle demande</h2>
        {analyse.exigences.length === 0 ? (
          <p className="text-pretty text-14 text-ink-700">{SANS_EXIGENCE_CHIFFREE}</p>
        ) : (
          <dl className="flex flex-col">
            {analyse.exigences.map((bloc) => (
              <div
                key={bloc.exigences.map((e) => e.intitule).join("|")}
                className="flex flex-col gap-0.5 border-t border-ink-300 py-2.5"
              >
                {bloc.exigences.map((exigence) => (
                  <div
                    key={exigence.intitule}
                    className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <dt className="text-14 text-ink-500">{exigence.intitule}</dt>
                    <dd className="text-14 font-medium text-ink-900 sm:text-right">
                      {exigence.valeur}
                    </dd>
                  </div>
                ))}
                {/* Quatre seuils de salaire ne sont pas quatre exigences à
                    tenir ensemble : la phrase l'accompagne, sinon la liste
                    seule dit le contraire de ce que la règle prévoit. */}
                {bloc.auChoix ? (
                  <p className="text-pretty text-13 text-ink-500">{MENTION_AU_CHOIX}</p>
                ) : null}
              </div>
            ))}
          </dl>
        )}
        {analyse.mention ? <SourceNote {...analyse.mention} /> : null}
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
        <p className="text-center text-13 text-ink-500">
          {mentionSuite(analyse.verdict, quota, analyse.verdictLu)}
        </p>
      </div>
    </div>
  );
}

/**
 * Signaler une erreur de lecture — S.157, R-03.
 *
 * Sur place, et non sur une page à part : le candidat coche les valeurs
 * qu'il voit fausses, juste au-dessus. Il ne recopie pas la bonne valeur
 * (elle irait au journal, qui ne se purge pas avec les pièces) ;
 * l'opérateur relit la pièce elle-même.
 */
function Signalement({
  dossierId,
  pieceId,
  lus,
}: {
  dossierId: string;
  pieceId: string;
  lus: readonly string[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [designes, setDesignes] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const router = useRouter();
  const choix = [...lus, AUTRE_CHOSE];
  const refus = refusDuSignalement(designes, lus);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (refus || envoi) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ dejaEnRelecture: boolean }>(
      `/api/dossiers/${dossierId}/pieces/${pieceId}/signalement`,
      { corps: { champs: designes } },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    // L'écran se relit : c'est le serveur qui dit que la relecture est ouverte.
    router.refresh();
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex min-h-touch items-center self-start text-14 text-accent-700 underline"
      >
        Signaler une erreur de lecture
      </button>
    );
  }

  return (
    <form onSubmit={envoyer} className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-pretty pb-1 text-14 font-medium text-ink-900">
          Quelles valeurs sont fausses ?
        </legend>
        {choix.map((intitule) => (
          <Checkbox
            key={intitule}
            libelle={intitule}
            checked={designes.includes(intitule)}
            onChangement={(coche) =>
              setDesignes((d) => (coche ? [...d, intitule] : d.filter((x) => x !== intitule)))
            }
          />
        ))}
      </fieldset>
      <p className="text-pretty text-13 text-ink-500">
        Une personne de l&apos;équipe relit la pièce elle-même. Le signalement ne consomme pas
        d&apos;analyse.
      </p>
      {echec ? <BlocEchec echec={echec} annonce /> : null}
      <Button
        type="submit"
        pleineLargeur
        chargement={envoi}
        disabled={refus !== null}
        raisonDesactivation={refus ?? undefined}
      >
        Envoyer le signalement
      </Button>
    </form>
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
  return [...new Uint8Array(condensat)].map((o) => o.toString(16).padStart(2, "0")).join("");
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

/** Cadence de relecture pendant le contrôle, et sa limite. */
const RELECTURE_MS = 4000;
const RELECTURE_MAXI_MS = 2 * 60 * 1000;

/** L'autorisation demandée sur place : le texte de « Mes consentements ». */
const AUTORISATION_PIECES = CONSENTEMENTS.find((c) => c.code === "pieces_identite")!;

/** Reconnaît le refus « consentement manquant » : l'écran ne reçoit pas le code technique. */
const TITRE_CONSENTEMENT_MANQUANT = ECHECS.consentement_manquant.titre;
