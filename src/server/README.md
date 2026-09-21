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
    editorial.ts     Guides et articles : le public, les rubriques, B-08.
    paiements.ts     Le tunnel ($-01 à $-05) et le reçu ($-04, $-06).
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

## Le reçu, et ce qu'un document comptable impose

`lecture/paiements.ts` sert trois appelants — l'écran de confirmation
($-04), celui du reçu ($-06) et la route qui renvoie ce reçu par email. La
raison est la même que partout ailleurs ici, mais elle pèse plus lourd :
deux écrans qui annoncent deux montants pour un même paiement ne sont pas
une incohérence d'affichage, c'est un litige.

Trois règles en découlent, et elles vivent dans `domain/paiement/recu.ts`,
donc sans base ni réseau :

**Un reçu ne s'établit qu'après confirmation.** Une transaction en attente
n'a pas de reçu, elle a une promesse. Un statut que la table de
correspondance ne connaît pas ne devient jamais « payé » : l'inconnu tombe
du côté sûr, parce qu'un état ajouté au schéma sans passer par ici ne doit
pas produire un document qui atteste d'un encaissement.

**Un remboursement garde son reçu, mais pas sa prétention.** L'obligation
comptable ne s'efface pas quand l'argent revient ; la pastille et le total
changent de mot, et le renvoi par email se ferme — le courrier annonce une
somme encaissée, et elle ne l'est plus.

**Rien n'est inventé de ce que la base ignore.** Le numéro du portefeuille
qui a payé n'est pas conservé : le reçu nomme le moyen, pas le téléphone.
La référence de l'opérateur n'arrive qu'avec la notification signée, et sa
ligne est absente tant qu'elle n'est pas venue — une ligne vide sur un reçu
se lit comme une donnée perdue.

Le reçu se garde en l'imprimant, comme l'archive d'un dossier : c'est le
navigateur qui fabrique le PDF, et aucune bibliothèque de rendu n'entre au
dépôt pour cela. Le renvoi par email passe par `courrier.ts`, point de
branchement unique ; il n'est pas journalisé, parce qu'un reçu renvoyé ne
change l'état de rien et part vers la seule adresse que son destinataire
possède déjà — l'inscrire noierait les accès qui comptent.

## Le tunnel de paiement, et ce que la relève n'a pas le droit de conclure

`lecture/paiements.ts` porte trois lectures voisines, et leur séparation
est le fond du sujet :

- `tunnelDuPaiement` — ce qu'il faut savoir **avant** de débiter : le
  dossier qu'on ouvre, la devise que son pays suggère, le numéro du compte,
  et si un pack a déjà été payé. Ce dernier point est lu depuis la
  transaction et non depuis le statut du dossier : un dossier peut être
  `ACTIF` sans achat, et c'est bien la transaction confirmée qui dit que le
  pack est payé.
- `paiementDuTunnel` — ce que l'attente et l'échec montrent **pendant**.
- `recuDuPaiement` — le document comptable, **après**.

Les deux dernières lisent la même ligne et ne rendent pas les mêmes
champs. Le tunnel porte le numéro masqué, parce que « notification envoyée
au 97 •• •• 42 » désigne l'appareil qu'il faut aller regarder ; le reçu ne
le porte pas, parce qu'une pièce comptable n'a pas à nommer le portefeuille.
Une lecture unique aurait fait apparaître le numéro sur le reçu, et aucun
des deux écrans ne l'aurait signalé.

**Un seul écran ouvre une transaction.** Le récapitulatif appelle
`POST /api/paiements` et rejoint l'attente avec la référence rendue. Deux
écrans qui créent une transaction, c'est un double débit en attente
d'arriver — un test relit les quatre composants du tunnel pour qu'il n'y en
ait jamais qu'un.

**La relève ne conclut rien.** `$-03` interroge `paiements.statut` toutes
les trois secondes ; la route lit le statut que le webhook signé fait
avancer et ne confirme rien elle-même (RG-05.1). Ce que vaut la réponse est
décidé dans `domain/paiement/attente.ts`, pas dans le composant :

- seul un `CONFIRMEE` conduit à « paiement confirmé » — tout autre état y
  menant annoncerait un débit que l'opérateur n'a pas fait ;
- le rebours épuisé ne vaut pas échec : la transaction reste ouverte tant
  que la base ne l'a pas fermée, et un webhook en retard la confirme encore.
  L'écran cesse de relever et dit que le délai est dépassé, sans rien
  affirmer de l'argent ;
- « délai dépassé » n'est prononcé que si la base l'a prononcé.

**Le motif d'échec est conservé, et c'est lui qui prime.** `failureCause`
porte six valeurs fermées — solde, refus de l'émetteur, annulation du
payeur, moyen invalide, incident technique, délai dépassé — et rien du
texte reçu : celui-ci cite un moyen de paiement, parfois un message de
banque, et ce qui n'est pas déclaré au schéma de lecture n'atteint pas le
code qui écrit. À défaut de cause, l'état de la transaction nomme encore le
motif, et l'adresse est acceptée entre les deux.

Chaque rail en dit ce qu'il sait. FedaPay distingue le refus, l'annulation
et la panne par son seul `status` — l'information était là et se perdait —
et ne nomme jamais le solde, faute de code normalisé. Stripe donne un
`decline_code` du réseau, dont seul un tableau fermé décide de ce qu'on
retient ; un code inconnu retombe sur le refus sans raison, jamais sur le
solde.

Le motif **part avec le compte** (RG-10.4), comme le motif de refus de
visa. L'obligation comptable tient au montant, à la date et à la
référence : savoir qu'une carte a été refusée pour solde un jour de
septembre ne lui sert pas, et décrit une personne. Ce garde-fou-là est
dans `acces/suppression.ts` et non en base — une contrainte `CHECK`
n'interroge pas une autre table.

## Les guides et les articles, et le dernier fichier de contenu

`lecture/editorial.ts` sert les deux écrans publics (P-05, P-07) et le
registre du back-office (B-08). Ils étaient les derniers à lire un fichier
du dépôt : un guide ne se changeait pas sans un développeur, un
déploiement et une relecture de code.

Ce n'était pas seulement lourd. `CLAUDE.md` promet que « un administrateur
qui saisit une promesse dans un guide pays bute sur la même règle qu'un
développeur, et sa publication est bloquée tant que la formulation est
refusée ». La phrase décrivait un dispositif qui n'existait pas, faute
d'écran où saisir un guide. C'est désormais le cas, et avec une nuance qui
compte : **la liste est vérifiée à chaque enregistrement, et ne bloque que
la publication.** Refuser aussi le brouillon empêcherait d'enregistrer un
texte en cours d'écriture et pousserait à rédiger ailleurs pour recoller à
la fin — c'est-à-dire hors du garde-fou.

**Rien de dérivable n'est saisi.** Le sommaire d'un guide se tire de ses
intertitres ; il était écrit à côté d'eux, et un test surveillait la
duplication — que le prototype avait déjà ratée, en annonçant une section
que le corps ne contenait pas. La durée de lecture se compte. La mention
« ce guide est informatif » suit le genre. Trois champs de moins, et trois
classes de contradiction qui disparaissent avec eux.

**Le public ne voit que `PUBLIE`, et le filtrage est dans la requête.** Un
document retiré qui arriverait jusqu'à l'écran pour y être masqué serait
déjà sorti de la base.

**Régénéré à la demande, pas pré-généré.** Le build se fait en intégration
continue, sans base de données (J.8) : `generateStaticParams` ne peut plus
rien énumérer. Les pages de document se rendent à la première demande,
restent en cache une heure, et la publication invalide leur adresse — la
leur **et celle de leur rubrique**, sans quoi un guide publié resterait une
heure invisible depuis la page qui existe pour le trouver.

Les trois index — `/guides`, `/articles`, `/destinations` — n'ont pas cette
chance. Une page sans paramètre dynamique est pré-rendue au build, où il
n'y a pas de base, et la construction échoue : `force-dynamic` est la seule
réponse honnête, pour une requête par visite sur une liste de quelques
lignes. La différence tient au segment, pas au contenu.

**Les deux rubriques ne se classent pas pareil.** Un article est daté : le
plus récent d'abord. Un guide porte un pays, et celui qu'on cherche est
celui où l'on veut aller — ordre alphabétique, `localeCompare` en français
pour qu'« Émirats » se range à sa place. La date affichée suit la même
logique : un guide montre sa **vérification** (un guide de 2024 revérifié
le mois dernier vaut mieux qu'un guide publié le mois dernier et jamais
relu), un article sa **parution**.

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

Chaque dépendance extérieure a un **point de branchement unique**, et chacune
traite son absence plutôt que de faire semblant :

| Dépendance | Point de branchement | Sans elle |
|---|---|---|
| Messagerie | `courrier.ts`, `leTransport` / `brancherTransport` | Les courriers sont journalisés, l'absence de configuration est signalée une fois |
| Antivirus | `securite/antivirus.ts`, `leBalayeur` | Le dépôt est refusé et le message dit que le contrôle manque (I.D) |
| Extraction IA | `jobs/analyse.ts`, `lExtracteur` | La pièce part en revue manuelle et l'analyse est recréditée — jamais déclarée conforme sans lecture |
| Rédaction IA | `redaction/service.ts`, `leRedacteur` / `laCritique` | L'écran dit ce qui manque ; la réécriture par le candidat, elle, n'attend rien |
| Remboursement | `paiement/remboursement.ts`, `leRembourseur` | La dette reste ouverte et visible en B-04, la tentative est comptée |
| Interrogation des fournisseurs | `jobs/reconciliation.ts`, `Interrogation` | Le retard est marqué, un écart s'ouvre au-delà de 24 h, rien n'est accusé sur un silence |

### Configuré n'est pas branché

`/api/health` lisait `process.env`. Une variable renseignée valait dépendance
présente, et l'adresse répondait « ok » — sur une installation dont aucun
courrier ne part et dont aucune pièce n'est balayée.

Un **résolveur** par point de branchement (`leBalayeur`, `lExtracteur`…) rend
la fonction que l'appelant exécutera. `server/exploitation/capacites.ts`
interroge ces résolveurs-là et compare ce qu'ils rendent à leur fonction non
branchée : la présence d'un adaptateur se déduit, elle ne se déclare pas. Le
jour du branchement, une ligne change dans le point de branchement, et
l'appelant comme l'état de service en tiennent compte au même instant.

Six capacités, et il en faut trois pour atteindre la dernière :

| Capacité | Ce qu'elle dit |
|---|---|
| `IMPLEMENTATION_ABSENTE` | aucun adaptateur — quelles que soient les variables |
| `NON_CONFIGUREE` | adaptateur présent, configuration absente |
| `CONFIGUREE_NON_VERIFIEE` | configuré, aucune sonde concluante |
| `OPERATIONNELLE` | adaptateur, configuration, sonde — les trois |
| `DEGRADEE` | facultative indisponible, le repli fonctionne |
| `EN_PANNE` | attendue et injoignable |

Une bloquante n'est acquittée que par `OPERATIONNELLE`. Les sondes sont
locales et sans effet de bord : aucun courrier, aucun appel de fournisseur,
aucun jeton d'IA, aucune écriture. La seule concluante aujourd'hui signe un
corps connu et vérifie que la fonction qu'appellent les routes de webhook
accepte la bonne signature **et refuse** une signature altérée.

## Vérifier

```
npm run check             # lint, typecheck, tests, vocabulaire
npm run smoke:migrations  # la base reconstruite depuis zéro, garde-fous compris
npm run db:garde-fous     # 62 écritures interdites, essayées une par une
npm run smoke:worker      # le paquet du worker, exécuté pour de bon
npm run seed:rules        # les quatre règles de référence
npm run seed:demo         # une candidate, un veilleur, un administrateur
```

`db:garde-fous` échoue désormais quand une contrainte manque : le fichier
SQL, seul, rend `0` quoi qu'il arrive — chaque bloc provoque exprès une
violation, il ne peut pas s'arrêter à la première. La ligne « ACCEPTÉ » se
perdait au milieu de soixante autres.

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
