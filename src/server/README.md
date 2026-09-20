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
    consentements.ts Un genre par autorisation, lu par A-05 et par T-03.
    suppression.ts   RG-10.4. Purge immédiate, puis anonymisation.
    partenaires.ts   WF-13. Les trois issues d'une proposition, commission au résultat.
    journal.ts       Audit avec motif obligatoire (RG-15.1).
  paiement/
    signature.ts     Vérification HMAC horodatée des webhooks.
    cycle.ts         Machine à états d'une transaction.
    notifications.ts Lecture des charges utiles FedaPay et Stripe.
    reception.ts     Traitement commun aux deux rails.
  vue/
    dossier.ts       Prisma → types du domaine que les écrans consomment déjà.
    destinations.ts  Règle → destination évaluable par le simulateur.
  lecture/
    destinations.ts  Fiches publiées, vedettes, comparateur.
    dossiers.ts      Tableau de bord, checklist, complétude, échéancier, analyse.
    alertes.ts       Alertes d'un candidat, divergence à arbitrer.
    consultants.ts   Annuaire habilité, créneaux disponibles.
    redaction.ts     Pièces à rédiger, versions, remarques.
    backoffice.ts    Les sept écrans B, plus l'édition d'une règle.
    partenaires.ts   WF-13. Rien n'est proposable par défaut.
    portabilite.ts   Export du compte et archive d'un dossier.
  jobs/
    worker.ts        Branchement pg-boss et cadences.
    analyse.ts       WF-06. Déterministe d'abord, IA pour l'extraction seule.
    purge.ts         INV-5. Le contenu part, la trace reste — copies comprises.
    veille.ts        RG-14.1. Dépublication à l'échéance de relecture.
    reconciliation.ts RG-05.4. Le filet du paiement débité sans crédit.
    divergence.ts    WF-11. Rien n'est migré d'office.
  courrier.ts        Courriers transactionnels. Transport non branché.
```

## Une assemblée, deux entrées

`lecture/` est appelé par **les pages serveur et les routes**. C'est la seule
règle de ce découpage, et elle a une raison : deux chemins vers la même
donnée divergent, et c'est l'écran qui finit par mentir.

Une page serveur appelle directement, sans passer par HTTP. S'interroger
soi-même coûte un aller-retour, oblige à réémettre le cookie de session, et
fait dépendre le rendu de sa propre disponibilité. Les routes restent pour
les écrans interactifs — qui appellent avec `src/lib/api.ts` — et pour un
client qui ne serait pas cette application.

Le partage page / composant suit la même logique partout : `page.tsx` lit et
garde l'accès, `Composant.tsx` rend. C'est ce qui permet de vérifier un
écran sans base de données, et une lecture sans rendu.

## Garder l'accès

Une page protégée ne vérifie rien elle-même : la garde est au **gabarit**.
`(dossier)/layout.tsx` exige une session, `(admin)/layout.tsx` exige au moins
le rôle veilleur, et chaque page du back-office resserre selon ce qu'elle
montre. Un écran ajouté demain sous l'un de ces groupes est protégé sans que
personne y pense — c'est exactement le genre d'oubli qui ouvre un dossier à
qui n'est pas connecté.

Les pages redirigent, les routes refusent avec le contrat d'échec : une page
n'a pas de corps JSON à rendre, une API n'a pas à renvoyer une redirection à
un client qui attend un objet. La redirection porte `suite`, pour que
quelqu'un dont la session a expiré revienne là où il allait.

## Ce qui part, ce qui reste

Deux chemins effacent, et ils n'effacent pas la même chose.

`jobs/purge.ts` est la **purge de rétention** (INV-5, RG-10.1) : à
l'échéance, le contenu des pièces d'un dossier s'en va — l'objet dans le
stockage, le texte d'une pièce rédigée, et les copies que ce contenu a
laissées ailleurs : les champs lus par l'analyse, la trace du moteur, les
deux valeurs qu'une remarque critique opposait, les réponses d'entretien.
Cette dernière partie manquait ; supprimer le fichier en gardant le numéro
de passeport qu'on y avait lu n'est pas une purge. Restent le verdict, le
genre de remarque et les horodatages : ils prouvent que la vérification a eu
lieu sans nommer personne.

`acces/suppression.ts` est la **suppression de compte** (RG-10.4). Elle
purge tous les dossiers sans attendre l'échéance, puis anonymise. Elle
n'efface pas la ligne du compte : un reçu de paiement pointe dessus, et C-11
l'annonce au candidat avant même qu'il clôture. Ce qui part est tout ce qui
nomme quelqu'un ; ce qui reste est un compte sans personne.

La frontière tient en une phrase : **ce qui décrit une personne s'en va, ce
qui décrit une transaction reste.**

`lecture/portabilite.ts` est le troisième côté de la même question : avant
d'effacer, rendre. Deux sorties, deux besoins, et les confondre donnerait un
fichier qui ne sert ni à l'un ni à l'autre. **L'export du compte** répond au
droit d'accès : du JSON, structuré, relisible par une machine. **L'archive
d'un dossier** répond à un geste : une page qui s'imprime, à garder avant la
purge.

Aucune des deux ne porte les fichiers. Ils se téléchargent un par un, par
une URL signée créée au clic (règle d'architecture 4). Ce n'est pas un
pis-aller : une archive unique de plusieurs dizaines de méga-octets, sur une
connexion mobile qui coupe, échoue au bout de quatre minutes et ne laisse
rien — pièce par pièce, ce qui est passé est passé. Et un lien signé posé
dans une page meurt avant qu'on y arrive ; imprimé, il est mort pour
toujours.

Une règle de plus, et elle est facile à enfreindre sans le voir :
**l'export rend ce que le candidat voit, pas ce que la base garde.** Le
barème interne de WF-07 est une donnée sur la personne, et l'arbitrage C-09
interdit de la lui montrer — l'exporter la lui montrerait par la porte de
derrière. L'export porte donc la complétude comme les écrans la disent : un
palier et un dénombrement.

L'ordre des deux temps est celui de la réversibilité. La demande ferme
l'accès tout de suite — c'est gratuit et immédiat. L'anonymisation vient
après la purge, parce qu'anonymiser d'abord laisserait, en cas de panne du
stockage, des fichiers sans propriétaire identifiable que plus personne ne
saurait retrouver. Entre les deux, le compte est « suppression demandée » :
B-03 l'affiche, et la passe quotidienne de purge le reprend.

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
npm run check          # lint, typecheck, 678 tests, vocabulaire
npm run db:garde-fous  # 16 écritures interdites, essayées une par une
npm run seed:rules     # les quatre règles de référence
npm run seed:demo      # une candidate, un veilleur, un administrateur
```

`seed:demo` est le seul moyen de **voir** les écrans. Il crée une candidate
avec un dossier en cours et un brouillon, des pièces dans plusieurs états,
une analyse, une alerte et un consultant habilité — plus un compte par rôle,
parce que la seule façon de vérifier le moindre privilège est d'ouvrir les
écrans avec chacun et de constater ce qui se ferme. Il refuse de tourner en
production : un jeu de démonstration écrit dans une base réelle y laisse un
compte au mot de passe connu.

`tests/api-invariants.test.ts` relit les routes **comme un texte** : composeur
obligatoire, dispense de débit réservée aux webhooks signés, aucun barème
interne ni quota de jetons sérialisé hors back-office. C'est le même
garde-fou de dérive que `tests/schema-domaine.test.ts`, appliqué à l'API.
