import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { raisonSansApercu, urlDeLecture } from "@/server/acces/pieces";
import { APERCU_INDISPONIBLE, MOTIF_MINIMUM } from "@/domain/backoffice/revue";

/**
 * Ouverture d'une pièce depuis la file de revue — B-05, RG-15.1.
 *
 * « Tout accès administrateur à une pièce d'identité est journalisé avec
 * motif obligatoire. » L'écran l'annonçait depuis le début, et ne le
 * faisait pas : « Ouvrir la pièce » posait un drapeau local et affichait
 * un aperçu inventé — « page 1 sur 3 » — sans écrire une ligne. L'action
 * `piece.consultation` figurait dans la table des actions auditées sans
 * qu'aucun code ne l'emploie.
 *
 * **La ligne d'audit part avant l'URL.** Signer d'abord et journaliser
 * ensuite laisserait, si l'écriture échoue, un accès réel sans trace —
 * exactement ce que RG-15.1 interdit. Dans l'autre ordre, un échec de
 * signature laisse une trace d'un accès qui n'a rien montré : une trace
 * de trop se relit, une trace manquante ne se retrouve pas.
 *
 * L'URL est signée par `urlDeLecture`, la seule fonction du dépôt qui le
 * fasse, et qui porte ses propres refus — pièce purgée, pièce non balayée
 * (I.D). Les refaire ici les dédoublerait, et deux copies d'une décision
 * de sécurité finissent par diverger.
 */
export const POST = route({
  nom: "admin.revue.consultation",
  acces: "admin",
  limite: "sensible",
  corps: z.object({ motif: z.string().trim().min(MOTIF_MINIMUM).max(500) }),
  async traiter({ corps, params, acteur }) {
    const revue = await db.manualReview.findUnique({
      where: { id: params.id },
      include: {
        analysis: { include: { version: { include: { document: true } } } },
      },
    });
    if (!revue) throw echec("introuvable");

    const version = revue.analysis.version;
    const document = version.document;

    await journaliser({
      acteurId: acteur!.id,
      action: "piece.consultation",
      cible: `document:${document.id}`,
      motif: corps.motif,
      details: { revue: revue.id, dossier: document.applicationId, version: version.rank },
    });

    // Le stockage objet peut être injoignable. L'écran le dira tel quel
    // plutôt que de montrer un cadre vide : l'accès est consigné, et rien
    // n'a été affiché.
    const apercu = await urlDeLecture(version).catch(() => undefined);

    return {
      apercu: apercu ?? null,
      raison: apercu === undefined ? APERCU_INDISPONIBLE : raisonSansApercu(version),
      libelle: document.label,
    };
  },
});
