import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { dossierDuCandidat, exigerModifiable, recalculerCompletude } from "@/server/acces/dossiers";
import {
  dateDePeremption,
  enregistrerLaVersion,
  exigerConsentementPieces,
  exigerUnDepotConforme,
  pieceDuDossier,
  preparerLeDepot,
  refusDeLaDemande,
  versionDeMemeEmpreinte,
} from "@/server/acces/pieces";
import { compteur, solde } from "@/server/acces/quota";
import { getQueue, JOBS, poster } from "@/lib/queue";
import { antivirusConfigure } from "@/server/securite/antivirus";
import { lireLesConstats } from "@/server/exploitation/constats";
import { moteurPrisEnDefaut } from "@/domain/exploitation/constats";
import { MENTION_EN_QUARANTAINE } from "@/domain/dossiers/quarantaine";

/**
 * Dépôt d'une pièce — C-07, WF-06.
 *
 * Deux appels, et c'est délibéré. Le premier prépare : il vérifie ce qui se
 * vérifie sans l'octet — consentement, format, taille, empreinte déjà
 * connue, quota — et rend une URL de dépôt valable cinq minutes. Le second
 * confirme, une fois le fichier écrit dans le stockage par le navigateur.
 *
 * Faire transiter le fichier par cette route serait plus court à écrire et
 * plus cher à tout le reste : dix mégaoctets montent deux fois, et un rendu
 * reste bloqué pendant l'envoi sur une connexion mobile.
 *
 * L'ordre des vérifications suit ce qu'il coûte de les rater. Le balayeur
 * d'abord (I.D) : sans lui, l'URL signée conduirait à une quarantaine dont
 * rien ne sortirait, et le candidat aurait envoyé dix mégaoctets pour une
 * pièce qui ne s'ouvre jamais. Le consentement ensuite (RG-02.2) : sans lui,
 * rien ne doit partir. L'empreinte (RG-06.2) : un fichier déjà connu ne se
 * renvoie pas et ne se décompte pas. Le quota en dernier (RG-06.5) : il
 * n'interdit pas le dépôt, il n'interdit que l'analyse.
 */
const demande = z.object({
  nom: z.string().min(1).max(255),
  octets: z.number().int().positive(),
  typeMime: z.string().min(1).max(100),
  empreinte: z.string().regex(/^[a-f0-9]{64}$/iu, "Empreinte SHA-256 attendue."),
});

export const POST = route({
  nom: "piece.depot.preparation",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: demande,
  async traiter({ corps, params, acteur }) {
    // I.D — l'antivirus est un prérequis du téléversement, pas une option.
    // Refuser ici coûte un aller-retour ; l'accepter coûterait un fichier
    // que rien ne pourra promouvoir.
    if (!antivirusConfigure()) throw echec("televersement_indisponible");

    /*
      Et un moteur **pris en défaut** ferme le dépôt aussi — 22/09/2026.

      Un moteur qui a déclaré sain le fichier d'essai répond sans
      détecter : tout ce qu'il examine passera, et c'est la seule panne
      de cette chaîne qui ne se remarquerait pas. La sonde le voyait
      déjà et le disait à l'état de service ; personne n'en tirait de
      conséquence, si bien que les dépôts continuaient d'être acceptés
      et promus par un moteur qui ne lit rien.

      L'absence de constat, elle, ne ferme rien : une pièce déposée sans
      constat reste en quarantaine et n'est promue que sur un verdict
      « saine ». Fermer sur l'ignorance bloquerait chaque démarrage à
      froid sans rien protéger de plus.
    */
    if (moteurPrisEnDefaut((await lireLesConstats()).antivirus)) {
      throw echec("televersement_indisponible");
    }

    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    exigerModifiable(dossier);
    await exigerConsentementPieces(acteur!.id);

    const piece = await pieceDuDossier(params.pieceId!, dossier.id, acteur!.id);

    const refus = refusDeLaDemande(corps);
    if (refus) throw echec("fichier_refuse", { corps: refus });

    // RG-06.2 — même empreinte, verdict réutilisé, aucun octet renvoyé et
    // aucune analyse décomptée.
    const connue = await versionDeMemeEmpreinte(piece.id, corps.empreinte);
    if (connue) throw echec("piece_deja_deposee");

    const depot = await preparerLeDepot(dossier.id, piece);
    return {
      depot,
      // RG-06.5 — le quota épuisé ne ferme pas le dépôt, il ferme l'analyse.
      analyseraLaPiece: (await solde(dossier.id)) > 0,
      quota: await compteur(dossier.id),
    };
  },
});

/**
 * Confirmation. Les octets sont en quarantaine ; le job de balayage est mis
 * en file, et c'est lui qui promeut, écarte, ou laisse en attente (I.D).
 *
 * Le job d'analyse n'est plus mis en file ici. Il l'est par le worker, après
 * promotion : c'est la traduction en code de « aucun fichier non analysé
 * n'est transmis à l'extraction ». Le débit du quota a lieu plus loin
 * encore, au moment où l'appel part — une pièce qui n'atteint jamais
 * l'analyse ne doit rien coûter.
 */
export const PUT = route({
  nom: "piece.depot.confirmation",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: demande.extend({ cle: z.string().min(1) }),
  async traiter({ corps, params, acteur }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    exigerModifiable(dossier);
    const piece = await pieceDuDossier(params.pieceId!, dossier.id, acteur!.id);

    await exigerUnDepotConforme(corps.cle, corps.octets, dossier.id, piece);
    /*
      Deux confirmations du même dépôt (double clic, réponse perdue puis
      renvoyée) butent sur l'unicité de la clé ou de l'empreinte : la
      pièce est déjà en place, ce n'est pas une panne.
    */
    const version = await enregistrerLaVersion(piece.id, { cle: corps.cle, demande: corps }).catch(
      (erreur: unknown) => {
        if ((erreur as { code?: unknown } | null)?.code === "P2002") {
          throw echec("piece_deja_deposee");
        }
        throw erreur;
      },
    );

    await db.document.update({
      where: { id: piece.id },
      data: {
        // Un balayage est en cours, quel que soit le quota : la pièce est
        // bien en cours de traitement, et l'écran ne doit pas la présenter
        // comme au repos. C'est le balayage qui décidera de la suite.
        status: "EN_ANALYSE",
        expiresAt: dateDePeremption(piece.validityMonths, new Date()),
        // Un fichier existe désormais : la ligne propose de le remplacer, pas
        // de l'ajouter. Sans quoi le candidat cherche une pièce qu'il vient
        // d'envoyer.
        ...(piece.remedy === "TELEVERSER" ? { remedy: "REMPLACER" as const } : {}),
      },
    });

    const file = await getQueue();
    // `poster` et non `send` : une mise en file perdue rendrait la réponse
    // « en cours d'analyse » ci-dessous fausse, et la pièce attendrait un
    // balayage qui ne viendrait jamais.
    await poster(file, JOBS.BALAYAGE_PIECE, {
      applicationId: dossier.id,
      documentId: piece.id,
      versionId: version.id,
    });

    await recalculerCompletude(dossier.id);
    return {
      versionId: version.id,
      etat: "EN_ANALYSE",
      mention: MENTION_EN_QUARANTAINE,
      /** RG-06.5 — dit d'avance si l'analyse suivra la promotion. */
      analyseraLaPiece: (await solde(dossier.id)) > 0,
      quota: await compteur(dossier.id),
    };
  },
});
