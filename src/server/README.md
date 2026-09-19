# Couche serveur

Ce qui se trouve entre les écrans et la base. Trois règles gouvernent le
découpage, et elles expliquent pourquoi chaque fichier est là où il est.

**`src/domain/` ne descend jamais ici.** Le domaine ne connaît ni Prisma, ni
Next, ni le réseau. Le serveur l'appelle, jamais l'inverse. Une règle métier
qui se retrouve dans une route est une règle qu'aucun test pur ne couvre.

**Un invariant se tient au plus bas niveau où il peut l'être.** Dans une
contrainte de la base quand c'est possible, sinon dans une requête, sinon
dans le composeur de routes, et en dernier recours dans une route. Plus il
est haut, plus il y a d'endroits où l'oublier.

**Ce qu'un type ne peut pas porter ne fuit pas.** Le barème interne
n'apparaît pas dans `CompletenessPublic`, le quota de jetons n'apparaît pas
dans `PackPublic`. Il faudrait changer un type du domaine pour les faire
sortir, et cela se voit en revue.

## Carte

```
src/server/
  http/
    echecs.ts        Catalogue d'échecs. Deux sérialisations : candidat et opérateur.
    reponse.ts       Mise en forme, en-têtes de cache.
    limites.ts       Limitation de débit. Décision pure, stockage remplaçable.
    messages-zod.ts  Messages de validation en français, posés globalement.
    route.ts         Le composeur. Accès, débit, entrée, sortie, échecs.
  securite/
    secret.ts        Empreintes scrypt, codes à usage unique, clés d'objet.
    session.ts       Sessions en base, révocables.
  acces/
    regles.ts        Référentiel. INV-4 et RG-14.1 dans la requête.
    dossiers.ts      Appartenance dans la requête, INV-3 à l'ouverture.
    pieces.ts        Dépôt en deux temps, URLs présignées de 5 minutes.
    quota.ts         Grand livre d'analyses. Débit atomique (INV-6).
    paiements.ts     Idempotence à la création et à la notification (INV-7).
    comptes.ts       Inscription, connexion, codes, mot de passe.
    journal.ts       Audit avec motif obligatoire (RG-15.1).
  paiement/
    signature.ts     Vérification HMAC horodatée des webhooks.
    cycle.ts         Machine à états d'une transaction.
    notifications.ts Lecture des charges utiles FedaPay et Stripe.
    reception.ts     Traitement commun aux deux rails.
  vue/
    dossier.ts       Prisma → types du domaine que les écrans consomment déjà.
    destinations.ts  Règle → destination évaluable par le simulateur.
  jobs/
    worker.ts        Branchement pg-boss et cadences.
    analyse.ts       WF-06. Déterministe d'abord, IA pour l'extraction seule.
    purge.ts         INV-5. Le contenu part, la trace reste.
    veille.ts        RG-14.1. Dépublication à l'échéance de relecture.
    reconciliation.ts RG-05.4. Le filet du paiement débité sans crédit.
    divergence.ts    WF-11. Rien n'est migré d'office.
  courrier.ts        Courriers transactionnels. Transport non branché.
```

## Écrire une route

```ts
export const POST = route({
  nom: "dossiers.ouverture",      // clé de limitation et de journal
  acces: "candidat_verifie",      // décide aussi du public de la réponse
  limite: "sensible",             // ou "lecture", "attente", "webhook"
  corps: z.object({ … }),         // validé, messages en français
  async traiter({ corps, acteur, params }) {
    return { … };                 // sérialisé en JSON, sans cache par défaut
  },
});
```

Un `throw echec("quota_epuise")` produit la réponse voulue : statut, titre,
corps, ce qui est conservé, l'action. Tout le reste devient une
indisponibilité, et le message d'origine reste dans le journal du serveur —
une erreur Prisma cite le nom des colonnes, une erreur réseau cite l'hôte
interne, ni l'un ni l'autre ne sort.

`limite: "webhook"` dispense de la limitation de débit et **oblige** à
fournir `signature`. Le type le refuse autrement, et un test relit les
fichiers pour qu'aucune autre route ne prenne la dispense.

## Ce qui n'est pas branché, et pourquoi c'est dit

Trois dépendances extérieures n'ont pas de clé dans `.env.example`. Chacune a
un point de branchement unique, et chacune traite son absence plutôt que de
faire semblant :

| Dépendance | Point de branchement | Sans elle |
|---|---|---|
| Messagerie | `courrier.ts`, `brancherTransport` | Les courriers sont journalisés, l'absence de configuration est signalée une fois |
| Extraction IA | `jobs/analyse.ts`, `Extracteur` | La pièce part en revue manuelle et l'analyse est rendue — jamais déclarée conforme sans lecture |
| Fournisseurs de paiement | `jobs/reconciliation.ts`, `Interrogation` | Le retard est marqué, un écart s'ouvre au-delà de 24 h, rien n'est accusé sur un silence |

## Vérifier

```
npm run check          # lint, typecheck, 666 tests, vocabulaire
npm run db:garde-fous  # 16 écritures interdites, essayées une par une
```

`tests/api-invariants.test.ts` relit les routes **comme un texte** : composeur
obligatoire, dispense de débit réservée aux webhooks signés, aucun barème
interne ni quota de jetons sérialisé hors back-office. C'est le même
garde-fou de dérive que `tests/schema-domaine.test.ts`, appliqué à l'API.
