import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { dossierDuCandidat, exigerModifiable, recalculerCompletude } from "@/server/acces/dossiers";
import {
  dateDePeremption,
  enregistrerLaVersion,
  exigerConsentementPieces,
  pieceDuDossier,
  preparerLeDepot,
  refusDeLaDemande,
  versionDeMemeEmpreinte,
} from "@/server/acces/pieces";
import { compteur, solde } from "@/server/acces/quota";
import { getQueue, JOBS } from "@/lib/queue";

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
 * L'ordre des vérifications suit ce qu'il coûte de les rater. Le
 * consentement d'abord (RG-02.2) : sans lui, rien ne doit partir. L'empreinte
 * ensuite (RG-06.2) : un fichier déjà connu ne se renvoie pas et ne se
 * décompte pas. Le quota en dernier (RG-06.5) : il n'interdit pas le dépôt,
 * il n'interdit que l'analyse.
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
 * Confirmation. La pièce passe en analyse et le job est mis en file ; le
 * débit du quota a lieu dans le worker, au moment où l'appel IA part, et non
 * ici — une pièce qui n'atteint jamais l'analyse ne doit rien coûter.
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

    const version = await enregistrerLaVersion(piece.id, { cle: corps.cle, demande: corps });
    const analysable = (await solde(dossier.id)) > 0;

    await db.document.update({
      where: { id: piece.id },
      data: {
        status: analysable ? "EN_ANALYSE" : "ATTENDUE",
        expiresAt: dateDePeremption(piece.validityMonths, new Date()),
        // Un fichier existe désormais : la ligne propose de le remplacer, pas
        // de l'ajouter. Sans quoi le candidat cherche une pièce qu'il vient
        // d'envoyer.
        ...(piece.remedy === "TELEVERSER" ? { remedy: "REMPLACER" as const } : {}),
      },
    });

    if (analysable) {
      const file = await getQueue();
      await file.send(JOBS.ANALYSE_DOCUMENT, {
        applicationId: dossier.id,
        documentId: piece.id,
        versionId: version.id,
      });
    }

    await recalculerCompletude(dossier.id);
    return {
      versionId: version.id,
      etat: analysable ? "EN_ANALYSE" : "ATTENDUE",
      quota: await compteur(dossier.id),
    };
  },
});
