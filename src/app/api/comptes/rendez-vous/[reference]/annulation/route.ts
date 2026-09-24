import { route } from "@/server/http/route";
import { annulerLeRendezVous } from "@/server/consultations/annulation";

/**
 * Annulation d'un rendez-vous par le candidat — RG-12.5.
 *
 * `acces: "candidat"` et non `"candidat_verifie"` : réserver a demandé un
 * compte vérifié, annuler n'a pas à en redemander. Quelqu'un dont
 * l'adresse ne se vérifie plus doit pouvoir libérer un créneau et récupérer
 * sa somme — le contraire retiendrait de l'argent sur une formalité.
 *
 * Adressée par référence et non par identifiant : c'est ce que le candidat
 * a sous les yeux, dans le courrier de confirmation comme à l'écran. Le
 * filtre de propriétaire est dans la requête du traitement.
 *
 * Non journalisée. Le journal d'audit porte les accès d'un opérateur aux
 * pièces d'un candidat et les décisions prises **sur** un compte ; un
 * candidat qui annule son propre rendez-vous n'est ni l'un ni l'autre. Le
 * remboursement, lui, garde sa ligne — c'est un mouvement d'argent, et le
 * traitement l'écrit.
 */
export const POST = route({
  nom: "comptes.rendezvous.annulation",
  acces: "candidat",
  limite: "sensible",
  async traiter({ params, acteur }) {
    return annulerLeRendezVous(params.reference!, acteur!.id);
  },
});
