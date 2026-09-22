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
  dossiers/
    extracteur.ts    WF-06 étape 5. Les octets partent, jamais une URL.
  redaction/
    adaptateur.ts    WF-08 étapes 3 et 4. Mise en forme diffusée, relecture fermée.
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

#### Rien ne se déclare purgé tant que les octets sont là

Une suppression que le stockage refuse n'efface plus la version. Elle
l'effaçait : le `catch` autour de `removeObject` portait « objet déjà
absent, c'est l'état visé », et deux choses y étaient fausses.

D'abord, **un objet absent ne lève pas** : `DELETE` sur une clé inconnue
rend 204, chez S3 comme chez MinIO. Le cas annoncé ne passait jamais par
là. Ensuite, ce qui y passait était l'inverse — une panne réelle, comptée
« manquant », la version marquée purgée et sa **clé effacée**. Le fichier
restait dans le stockage, la base affirmait qu'il était parti, et plus
rien ne permettait de le retrouver.

Une version dont l'objet résiste garde donc sa clé et son état. Le
document n'est purgé que si plus rien de lui ne reste, le dossier que si
tout est parti ; sinon il demeure échu et la passe du lendemain réessaie.
`/api/health` compte les échéances dépassées, pour qu'une reprise ne
devienne pas une attente indéfinie.

`acces/suppression.ts` est la **suppression de compte** (RG-10.4). Elle
purge tous les dossiers sans attendre l'échéance, puis anonymise —
**seulement si la purge a tout emporté**. Ce garde-fou existait, avec son
commentaire (« anonymiser ici rendrait le fichier orphelin et
introuvable »), et c'était un chemin mort : la purge se déclarant
complète quoi qu'il arrive, le compte se retrouvait anonymisé par-dessus
un fichier survivant. Il est vivant depuis le 22/09/2026, et
`scripts/fumee-purge.mts` l'éprouve devant un stockage qui refuse. Elle
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

**Un achat porte sa catégorie, il ne la laisse pas deviner.**
`domain/payments/achat.ts` est l'union discriminée partagée par l'écran,
le schéma de la route et la couche d'accès : `pack` avec son code,
`recharge`, `consultation`. Le récapitulatif recevait auparavant un
triplet `{ code, libelle, prix }` et redevinait la catégorie sur le
code — tout ce qui n'était pas `recharge` partait en pack, si bien
qu'une consultation s'affichait juste et se sérialisait faux (S.24).

Quatre fonctions la traversent, chacune par un `switch` exhaustif :
`corpsDAchat` (ce qui part sur le fil), `tarifDe` (le montant, pour
l'écran comme pour le serveur), `codeEnregistre` (ce qu'on écrit dans
`Transaction.packCode`, avec son inverse `achatDepuisLeCode` juste à
côté) et `ouvrableDepuisLeRecapitulatif`. Une catégorie ajoutée ne
compile pas tant que les quatre questions n'ont pas de réponse.

**$-02 n'ouvre pas de consultation**, et c'est la dernière de ces quatre
questions. Une consultation payée confirme un créneau **tenu**, retrouvé
par `Appointment.transactionId` ; ouverte depuis le récapitulatif, elle
ne citerait aucun rendez-vous et la notification signée n'aurait rien à
confirmer. Elle se paie depuis T-05, où l'horaire existe — et l'écran
d'échec renvoie une consultation à l'annuaire plutôt qu'au
récapitulatif, parce que sa tenue a été libérée avec l'échec.

**La contrepartie vient du domaine, pas de l'écran.** Trois achats
traversent $-03 et $-04, qui n'en connaissaient qu'un : ils annonçaient
« ton pack s'ouvre » et « ton dossier est ouvert » à qui venait de payer
quarante-cinq minutes d'entretien. `domain/paiement/contrepartie.ts`
répond par catégorie et par `switch` exhaustif — ce qui s'ouvre, la
phrase de confirmation, la suite proposée. Il est à part parce que la
question se pose sur deux écrans, et qu'écrite dans chacun elle avait
déjà divergé.

**Le rendez-vous payé se lit à part du reçu.** `consultationDuPaiement`
joint `Appointment` par `transactionId` pour que $-03 nomme le créneau,
le consultant et l'échéance de tenue — et pour que $-04 montre la limite
d'annulation opposable. Ce n'est pas un champ de `Recu` : un reçu est une
pièce comptable, qui nomme le moyen de paiement et jamais le
portefeuille. Les deux décomptes y sont distincts : cinq minutes pour la
confirmation, vingt pour la tenue du créneau.

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
| Messagerie | `courrier.ts`, `leTransport` / `brancherTransport` | Les courriers sont journalisés, l'absence de configuration est signalée une fois. Un échec transitoire (4xx) se reprend, un refus (5xx) non — la distinction décide si un candidat peut redemander son code |
| Antivirus | `securite/antivirus.ts`, `leBalayeur` | Le dépôt est refusé et le message dit que le contrôle manque (I.D). Avec un moteur, une indisponibilité laisse la pièce en quarantaine et ouvre un incident — jamais une promotion |
| Extraction IA | `dossiers/extracteur.ts`, `lExtracteur` | La pièce part en revue manuelle et l'analyse est recréditée — jamais déclarée conforme sans lecture. Avec une clé, une lecture qui n'aboutit pas nomme sa cause : une saturation se rejoue, un scan flou demande une photo, une clé refusée appelle un exploitant |
| Rédaction IA | `redaction/service.ts`, `leRedacteur` / `laCritique` | L'écran dit ce qui manque ; la réécriture par le candidat, elle, n'attend rien. Avec une clé, une relecture qui n'aboutit pas ne date rien : R-04 continue de dire que le texte n'a pas été lu, et rien n'est débité |
| Remboursement | `paiement/remboursement.ts`, `leRembourseur` | La dette reste ouverte et visible en B-04, la tentative est comptée |
| Interrogation des fournisseurs | `jobs/reconciliation.ts`, `Interrogation` | Le retard est marqué, un écart s'ouvre au-delà de 24 h, rien n'est accusé sur un silence |

### La lecture d'une pièce, et ce qu'elle ne décide pas

Branchée le 22/09/2026, sur `ANTHROPIC_API_KEY`. Trois choses la tiennent.

**Ce qui part, ce sont les octets.** Jamais une URL, ni présignée ni
permanente — même règle que le balayage, et pour la même raison : une
adresse confiée à un tiers se rappelle demain, et la purge de rétention
n'en effacerait rien. Le seul lecteur du seau de confiance hors du
navigateur est cet adaptateur-là.

**Le modèle lit, il ne juge pas.** Il rend ce qui est écrit sur la pièce —
une date telle qu'elle y figure, un montant tel qu'il y est imprimé. La
mesure se calcule en TypeScript : « six mois de validité » n'est pas une
mention du passeport, c'est une soustraction entre sa date de fin et la
date de départ visée. C'est RG-06.1, et ce n'est pas une élégance — le
défaut qui a motivé ce lot était exactement là.

Avant le branchement, l'extracteur recevait la clé de l'objet et le code
de la pièce, et devait rendre des champs nommés d'après les **conditions**
du référentiel. Le code de la pièce ne les nomme pas. En exécutant la
chaîne avec un extracteur rendant ce qu'un modèle rend dans ces
conditions — un numéro, un nom, une date d'expiration —, un passeport
valable jusqu'en 2029 ressortait :

> aucune valeur lisible constaté, 6 mois exigé. Ton passeport doit rester
> valable 6 mois après le départ. Fais-le renouveler puis redépose-le.

La demande porte donc les conditions, et `domain/dossiers/extraction.ts`
construit le schéma de réponse à partir d'elles.

**Sans repère, rien n'est jugé.** Un dossier neuf n'a pas de date cible :
le candidat dépose son passeport avant d'avoir arrêté son départ. La
condition passe alors **en réserve** — ni conforme, on n'a pas vérifié, ni
fautive, la pièce n'a rien — et le message demande le renseignement qui
manque, sans proposer de remplacer le fichier.

Le reste suit les mêmes règles que le balayage : une cause qui se dissipe
seule se rejoue (trois fois, DOC-11 WF-06), les autres partent en revue
humaine avec le motif qui convient, et **les jetons consommés sont
enregistrés même quand rien n'a été rendu** — un appel raté a coûté, et
INV-6 ne connaît pas de dépassement silencieux.

### La relecture d'une pièce rédigée, et ce qui la distingue d'un silence

Branchée le 22/09/2026, sur la même clé que la lecture des pièces.

**Une liste de remarques vide est un résultat** — « relu, rien à
reprendre ». Une absence de relecture n'en est pas un. Les deux se
ressemblent dans les données, et l'écran les confondait : il décidait
d'afficher un avis sur `redactionConfiguree()`, c'est-à-dire sur la
présence d'`ANTHROPIC_API_KEY`. Aucune analyse n'ayant jamais tourné, la
base rendait `[]`, et le candidat lisait « Rien à reprendre sur cette
version » sur une lettre que personne n'avait lue. Le branchement de la
lecture des pièces, le matin même, avait rendu ce chemin ordinaire.

La relecture se constate donc **sur la version** : `critiquedAt` n'est
posée que par une analyse qui a abouti, dans la même transaction que ses
remarques. Séparées, une interruption entre les deux écritures laisserait
soit des remarques qu'aucune date ne rend visibles, soit une date sans
remarques — qui se lirait « rien à reprendre ».

`laCritique` n'avait par ailleurs **aucun appelant**. La route
`POST /api/dossiers/[id]/redaction/[type]/relecture` lui en donne un, et
R-04 porte le geste qui l'appelle : le seul de l'écran, et il annonce ce
qu'il coûte avant le clic (RG-08.4).

**Ce que le modèle reçoit** : les réponses de l'entretien et le texte de
la version. Aucune pièce jointe — le recoupement inter-pièces reste en
TypeScript (`domain/redaction/coherence.ts`), sur ce que le dossier sait
déjà de lui-même. La règle d'architecture 2 tient, et elle évite en plus
d'envoyer le contenu d'un passeport pour relire une lettre.

La mise en forme est **diffusée** : une lettre fait quelques milliers de
jetons de sortie, et une demande qui les attend en bloc atteint le délai
de la passerelle avant d'avoir fini. La relecture, qui rend une liste
courte sous schéma fermé, ne l'est pas.

Les six causes d'échec d'un appel — clé refusée, cadence dépassée,
service muet — vivent dans `domain/ia/appel.ts` et sont partagées avec la
lecture des pièces. Deux listes pour une même règle divergent, et c'est
celle qu'on n'a pas sous les yeux qu'on oublie de corriger.

### Quelle pièce établit quelle condition

Elle se **déclare** dans le référentiel (`condition.piece`), depuis le
22/09/2026. Elle se devinait par comparaison de préfixes de codes, à deux
endroits et selon deux règles différentes — deux réponses possibles à la
même question.

La devinette tenait tant qu'une condition portait le nom de sa pièce.
Elle s'écroulait dès qu'un rédacteur nommait une condition d'après ce
qu'elle exige : `salaire_min_moins_30_ans` ne partage aucun préfixe avec
`contrat_travail`. Sur la procédure kennismigrant, **aucune des cinq
conditions ne se rattachait à rien** : l'extraction ne demandait aucun
champ, les trois pièces ressortaient « conformes » sans qu'une seule
comparaison ait eu lieu, et le dossier ne devenait jamais prêt — les
conditions bloquantes restaient insatisfaites quoi que le candidat
dépose.

Trois gardes, et chacune à sa place :

- **le schéma** vérifie qu'une condition rattachée nomme une pièce qui
  existe. À chaque lecture, donc — et rien de plus, parce qu'INV-3 fige
  des payloads écrits avant cette évolution : les refuser rendrait
  illisible ce que des dossiers en cours ont gelé.
- **la publication** refuse une condition bloquante sans pièce
  (`raisonsDIncompletabilite`). C'est le dernier moment où personne n'a
  encore ouvert de dossier dessus.
- **un test** relit les données de la graine : la forme d'une règle et sa
  terminabilité sont deux questions, et seule la première était posée.

Une pièce sur laquelle rien ne porte est **reçue**, et le message le dit.
« Les informations lues correspondent à ce qui est exigé » affirme une
comparaison, et c'est cette phrase qui couvrait le défaut.

Les seuils **alternatifs** (`condition.alternative`) se jugent en bloc :
satisfaire l'un suffit, et le verdict nomme ceux qui ne le sont pas —
4 400 € satisfont le seuil des moins de trente ans et pas celui des
trente ans et plus, et le candidat est le seul à savoir lequel le
concerne. En dessous de tous, l'échec cite le **moins exigeant** : c'est
le seul constat vrai quel que soit le seuil applicable.

### Les rappels d'échéance, et pourquoi ils se groupent

Branchés le 22/09/2026. La file `echeancier.rappel` existait, déclarée
sans écrivain avec ce motif : « l'envoi attend la messagerie ». Le
transport SMTP avait été branché le matin même, et la phrase est devenue
fausse sans que rien ne bouge — un candidat dont une échéance était
dépassée depuis trois jours ne recevait ni courrier ni notification.

RG-09.2 pose **deux règles distinctes**, et le lot porte donc deux
marques : « un email hebdomadaire » est une cadence, qui porte sur le
dossier (`Application.lastReminderAt`) ; « sauf urgence à moins de 7
jours » est une exception, qui porte sur l'échéance
(`Deadline.remindedAt`).

La seconde décide de tout. Sans elle, une urgence repartirait chaque jour
jusqu'à la date — la façon la plus sûre de se faire filtrer, et le filtre
emporte le rappel qui comptait. Le groupement n'est pas une économie
d'envois : c'est ce qui garde le canal lisible.

Ce que le job ne décide pas : quoi envoyer. `domain/dossiers/rappels.ts`
le dit sans base ni réseau — la cadence, l'urgence, l'horizon, le texte.
Le job lit, appelle, envoie et marque.

Un envoi qui se reprend (`injoignable`, dont les 4xx) ne marque rien : la
passe du lendemain reprend le rappel. Marquer d'abord ferait d'une panne
de messagerie un rappel définitivement perdu. Ce qui ne partira pas
davantage demain — transport non branché, adresse refusée — est marqué :
la notification reste, et elle attend le candidat à l'écran.

### L'état d'un dossier ne s'écrit pas sans sa date

Correctif du 22/09/2026, au soir. Une garde de la base tient depuis le
premier jour, et elle est juste :

```sql
CHECK (("status" = 'PRET') = ("readyAt" IS NOT NULL))
```

« Prêt à déposer » est un état **calculé**, et la date où il a été atteint
en fait partie. Seulement, la règle ne vivait nulle part dans le code.
Sept écritures changeaient `status` ; **une seule** posait la date avec —
et depuis le 22/09 seulement, après que la même garde eut transformé
l'analyse d'une pièce en panne. Les six autres étaient refusées dès que le
dossier était prêt :

| Écriture | État visé | Ce que le refus faisait |
|---|---|---|
| déclaration de dépôt (WF-10 §1) | `SOUMIS` | `PRET` en est le **seul** état accepté : le dépôt était impossible, toujours |
| clôture avec issue (WF-10) | `ISSUE_DECLAREE` | renoncer avant de déposer échouait |
| mise en pause d'une divergence (WF-11) | `SUSPENDU` | la passe entière mourait, et les dossiers suivants n'étaient pas prévenus |
| arbitrage d'une divergence (T-02) | `ACTIF` | « je migre » ne faisait rien |
| activation d'un pack payé | `ACTIF` | un second pack encaissé et non crédité |
| archivage de fin de purge (RG-10.4) | `ARCHIVE` | les octets partis, la base les croyant présents, `purgedAt` jamais posée |

La règle vit dans `domain/dossiers/etat.ts`, et les sept écritures y
passent. `miseEnEtat(vise, readyAtActuelle)` rend le couple : la date est
posée en entrant dans `PRET`, **conservée** si le dossier y était déjà —
elle dit depuis quand, la repousser ferait vieillir le dossier à l'envers
—, et retirée partout ailleurs.

Ce qu'une règle pure ne peut pas faire, c'est éprouver une contrainte de
base. C'est précisément l'angle mort qui a laissé six écritures fausses
quatre jours : rien, dans la chaîne de vérification, n'écrivait réellement
dans une base sur ces chemins-là. `scripts/fumee-transitions.mts` le fait,
depuis un dossier réellement `PRET` — le seul état qui porte une date,
donc le seul depuis lequel la garde peut mordre.

Deux décisions sont descendues des routes vers `server/dossiers/` pour
cela (`parcours.ts`, `migration.ts`) : une route ne s'appelle pas depuis
une fumée, et une fumée qui réécrit la décision de la route n'éprouve pas
la route.

### L'autorisation d'analyse, et ce que son retrait arrête

Correctif du 23/09/2026. RG-02.1 annonce le consentement au traitement des
pièces d'identité **révocable**. Il ne l'était que pour l'avenir : le retrait
écrivait une ligne, refusait les dépôts suivants, et n'arrêtait rien de ce
qui était déjà en file.

Exécuté — le candidat autorise, dépose, se ravise, et le job reprend :

```
  autorisation accordée ?    false
  un nouveau dépôt est refusé ? oui
  appels au modèle           : 1
  jetons débités             : 4500
  analyses consommées        : 1
  état de la pièce           : A_CORRIGER
```

Le fichier partait au service de lecture, une analyse était débitée, un
verdict s'écrivait — après le retrait de l'accord.

L'autorisation se relit désormais à deux endroits, et les deux sont
nécessaires. À la **promotion** (`balayage`), parce que le candidat a pu se
raviser entre le dépôt et le balayage. À l'**analyse**, parce qu'il peut se
raviser pendant que le job attend dans la file — c'est même l'intervalle le
plus probable. La lecture précède le débit et la lecture du fichier : ni
jeton dépensé, ni octet transmis.

Une lecture, pas deux. `exigerConsentementPieces` refaisait la requête que
`autorisationAccordee` faisait déjà, avec sa propre version de « la dernière
ligne l'emporte ». Deux lectures d'un même registre de preuve finissent par
répondre différemment ; sur un registre de consentement, c'est la pire des
divergences. Elle délègue.

**La pièce dit pourquoi elle n'a pas été analysée.** Il y a deux motifs
désormais, et une mention unique en démentirait un : envoyer recharger des
analyses quelqu'un qui vient de retirer son accord lui ferait payer pour un
geste qu'il a lui-même fait. Le motif est écrit sur la pièce
(`MENTION_NON_ANALYSEE`), et la pastille reste « Conservée, non vérifiée » —
ce qu'on veut savoir d'abord est que le fichier est arrivé.

**Et l'écran des autorisations disait l'inverse de la règle.** « Sans cette
autorisation, tu téléverses tes pièces sans analyse automatique » décrivait
un parcours qui n'existe pas : RG-02.2 refuse le dépôt lui-même. Le candidat
lisait l'inverse de ce qui allait se passer, au moment précis où il décidait.

### Ce qui sépare deux versions d'une règle

Correctif du 23/09/2026. La comparaison qui décide de l'impact d'une
publication ne regardait que les **codes** des conditions bloquantes —
apparition, disparition. Jamais leur valeur.

Un seuil qui passe de 4 357 € à 1 000 € garde son code. La comparaison
rendait donc `MINEUR` avec un diff vide, et `propagerLaPublication` sort
immédiatement dans ce cas : **aucun dossier n'était prévenu**. C'est le
changement réglementaire le plus régulier du produit qui passait ainsi —
DOC-11 le nomme (« Majeur | **Seuil** ou pièce obligatoire modifié ») et
RG-14.3 dit quand il revient : « les montants IND changent au 1er janvier ».

La comparaison vit maintenant dans `domain/rules/comparaison.ts`, pure, et
**deux appelants en dépendent** : la propagation de WF-11 et le contrôle de
relecture de WF-14 §4. Une seule définition de « une condition bloquante a
bougé » — la leçon de S.42, où la même relation écrite deux fois donnait
deux réponses.

**Durcir n'est pas assouplir.** Un seuil relevé retire l'éligibilité à qui
l'atteignait tout juste : c'est le cas critique, mise en pause et email
nominatif. Un seuil abaissé ne retire rien ; notification et proposition de
migration suffisent.

| Ce qui bouge | Sens | Impact |
|---|---|---|
| `gte` dont la valeur monte, `lte` dont elle baisse | durcit | critique |
| l'inverse | assouplit | majeur |
| l'opérateur, l'unité | inordonnable | critique |
| une condition devient bloquante | durcit | critique |
| elle quitte son groupe d'alternatives | durcit — elle devient exigible seule | critique |
| elle change de pièce porteuse | la checklist bouge, l'exigence non | majeur |
| `message_echec` seul | aucune exigence ne change | rien ne part |

Quand les deux versions ne s'ordonnent pas, la réponse prudente est celle
qui prévient. Se tromper dans ce sens fait lire un message de trop ; se
tromper dans l'autre laisse quelqu'un déposer sous une exigence qu'il ne
remplit plus.

Le dernier point compte autant : réécrire une phrase ne change aucune
exigence, et faire partir une alerte à tous les dossiers ouverts parce
qu'un texte a été clarifié apprend à ignorer les suivantes.

### Un dossier en pause, et les trois phrases qui disaient le contraire

Correctif du 23/09/2026. WF-11 met en pause le dossier d'un candidat dont
une condition d'éligibilité vient de changer — c'est le lot de la veille.
Restait à savoir ce que ce candidat lit en ouvrant son dossier.

```
── Le même dossier, mis en pause par une divergence critique ──
  en base            : SUSPENDU
  bandeau du dossier : « Actif »
  palier             : COMPLET
  prochaine action   : « Rien ne bloque un dépôt. »
  « Je dépose »      : refusé — « Ton dossier n'est pas encore complet :
                       il reste des pièces obligatoires à réunir.
                       La checklist dit lesquelles. »
```

Trois phrases sur le même écran, fausses toutes les trois. `SUSPENDU`
n'avait pas de mot dans le vocabulaire candidat : `versStatut` le rendait
`ACTIF`. Toutes les pièces étant conformes, la prochaine action annonçait
que rien ne bloquait un dépôt — sur le seul dossier dont le dépôt était
bloqué. Et le refus envoyait relire une checklist complète en cherchant des
pièces qui ne manquaient pas.

La notification, elle, disait juste : « Ton dossier est mis en pause le
temps que tu regardes. » Mais elle vit sur l'écran des alertes, et le
candidat qui ouvre son dossier ne la voit pas.

`StatutDossier` porte donc `EN_PAUSE`. Le mot n'est pas nouveau — le
courrier et la notification de WF-11 l'employaient déjà —, il manquait à
l'écran du dossier. `MENTION_EN_PAUSE` dit le constat, ce qui est conservé,
et **où se prend la décision** : une pause qu'on ne sait pas lever n'est
pas actionnable, et la décision ne se prend pas sur l'écran du dossier.

Trois conséquences, et une quatrième qui se déduit : dans la liste des
dossiers, celui qui est en pause passe devant. C'est le seul qu'aucune
pièce ne fera avancer.

### Ce qui s'affiche, et ce qui est en vigueur

Correctif du 23/09/2026, né de la rencontre de deux passes justes.

RG-14.1 repasse en `DRAFT` une fiche dont la relecture est dépassée : « une
donnée non relue ne peut pas continuer à se présenter comme fiable ». La
passe est juste, et elle ne fait que de la tenue de livre — le filtre de
lecture candidat écarte déjà ces fiches, requête par requête.

La publication de la version suivante, elle, cherchait son prédécesseur par
`status = 'PUBLISHED'`. Après une passe de veille, elle n'en trouvait plus :

```
La passe de veille de 3 h du matin (RG-14.1) :
  1 fiche(s) dépubliée(s) — la v1 passe à DRAFT

Puis le veilleur finit sa relecture, et un administrateur publie la v2 :
  version archivée   : AUCUNE
  divergence en file : false

  le candidat est-il prévenu que son seuil passe de 4357 € à 5857 € ? NON
```

La v1 restait `DRAFT` pour toujours, sans date de fin ; la v2 se croyait
première ; et le dossier figé sur la v1 n'apprenait rien. La relecture par
défaut étant de quatre-vingt-dix jours, tout retard du veilleur ouvre cette
fenêtre — et une nouvelle version paraît précisément quand il vient de
relire.

**`status` dit ce qui s'affiche ; `publishedAt` dit ce qui a été mis en
vigueur.** Les deux étaient confondus. Une fiche dépubliée pour retard cesse
d'être montrée, mais elle reste la version que des dossiers ont figée
(INV-3) : elle est toujours en vigueur pour eux. La succession se lit donc
sur la mise en vigueur — « mise en vigueur, jamais remplacée » —, que la
dépublication ne touche pas.

La date est posée **une fois**. Une fiche republiée après une échéance de
relecture garde celle de son entrée en vigueur : la déplacer à chaque remise
en ligne ferait passer une vieille version devant une plus récente.

Deux gardes en base tiennent la cohérence : on n'archive pas ce qui n'a
jamais été mis en vigueur, et on ne termine pas ce qui n'a pas commencé. La
seconde répare au passage un silence de RG-14.4 — la version remplacée porte
enfin sa date de fin, même lorsqu'elle était en brouillon au moment d'être
remplacée.

### Une règle entre en base par deux chemins, et un seul contrôlait

Correctif du 23/09/2026. CLAUDE.md annonce « une seule liste, quatre points
d'application » pour le vocabulaire interdit, et nomme B-02 pour les textes
d'une règle. B-02 le fait. Mais B-02 n'est qu'un des **deux** chemins par
lesquels une règle entre en base : l'autre est la graine, qui charge le
référentiel livré — et elle ne contrôlait que la forme et la terminabilité.

Le référentiel portait donc, en base et à l'écran :

```
NL etudes_mvv_vvr  1 faute(s)
  conditions.2.message_echec · « 50 % »
  → arbitrage C-09 — aucune part affichée sur le dossier
```

C'est un `message_echec`, c'est-à-dire la phrase que le candidat lit sur sa
pièce quand la condition échoue. La publication l'aurait refusée ; la graine
l'a chargée.

`refusDuReferentiel` réunit les deux refus de contenu — terminabilité et
vocabulaire — et les **deux chemins l'appellent**. Deux listes de mots
refusés finiraient par diverger, et c'est celle de la graine qui gagnerait,
puisque c'est elle qui charge la production.

**Le texte a été réécrit, pas excepté.** `copy-exceptions.json` était
l'autre issue, et le projet la prévoit. Elle n'a pas été prise : le budget
est de cinq dérogations, et « moins de la moitié de ses crédits annuels »
dit exactement « moins de 50 % » en toutes lettres. Une dérogation se
dépense pour ce qui n'a pas d'équivalent — ici, le seuil réglementaire reste
dit, et `valeur: 50` reste dans la condition, où il sert à comparer et n'est
jamais affiché.

### La relecture par un second opérateur, et ce qu'elle n'était pas

WF-14 §4 : « Relecture par un second opérateur pour toute modification de
condition bloquante. » Le contrôle n'existait pas. Le commentaire de la
route affirmait que la séparation veilleur / administrateur en tenait
lieu — mais `ROLES_ADMIS` laisse un administrateur passer les deux portes,
et rien ne comparait qui avait écrit à qui publiait.

Exécuté : une version qui divise le seuil kennismigrant par quatre, écrite
et publiée par la même personne, franchissait les quatre garde-fous de la
publication — source (RG-14.2), schéma (WF-14 §3), vocabulaire (INV-1,
INV-2), terminabilité (S.42) — sans qu'aucun ne regarde la seule chose qui
comptait.

`VisaRule.verifiedBy` porte l'email de qui a écrit la version : chaque
édition l'y inscrit. Il n'y avait rien à ajouter en base, seulement à
comparer. La décision descend dans `server/regles/publication.ts` pour
qu'une fumée puisse publier pour de bon — même raison que le dépôt la
veille.

Le contrôle porte sur **toute** modification, pas seulement sur celles qui
durcissent : abaisser un seuil n'enlève l'éligibilité à personne, et ouvre
la procédure à des dossiers qu'elle n'aurait pas dû accueillir. Une version
qui ne touche aucune bloquante — une clarification de formulation — se
publie seule, sans quoi la relecture deviendrait une formalité qu'on
apprend à contourner.

Le journal d'audit garde les deux noms et la liste des conditions touchées :
c'est la preuve de diligence de RG-14.4, et elle ne vaut que si elle dit qui
a fait quoi.

### Une divergence réglementaire prévient tout le monde, ou rejoue

`propagerLaPublication` tenait dans une boucle sans filet : le premier
dossier en échec emportait la liste. Trois choses la tiennent désormais, et
elles vont ensemble.

**Chaque dossier est traité pour lui-même.** Ce qui échoue est compté dans
`aReprendre` et nommé dans `incidents` ; les autres reçoivent leur alerte.

**La passe est reprenable.** `RuleMigration.alertedAt` dit que le candidat
a été *prévenu* — la ligne d'arbitrage, elle, est créée avant l'alerte et
ne peut pas le dire. Sans cette marque, chaque reprise ajoutait une
seconde notification identique à ceux qui l'avaient déjà reçue.

**Le courrier critique n'est plus avalé.** RG-11.3 demande un email
nominatif ; il partait dans un `catch` qui journalisait. Il suit maintenant
la règle des rappels d'échéance : envoyé **avant** la marque, et une
coupure (`injoignable`, dont les 4xx) ne marque rien — la reprise le
reprend au lieu de le perdre.

Le bilan est rendu, et c'est l'ouvrier qui décide de rejouer
(`doitRejouer`). Lever depuis la propagation enfouirait le compte dans un
message d'erreur, et on ne pourrait plus vérifier que **les autres
dossiers, eux, ont bien été prévenus** — ce qui est tout l'objet du
correctif.

Dernier point, du même ordre : la pause finit quand le candidat a regardé.
Le courrier dit « ton dossier est mis en pause le temps que tu regardes ».
La branche « je conserve » n'écrivait que l'arbitrage, et le dossier restait
`SUSPENDU` — un état dont ni les rappels d'échéance ni le passage en `PRET`
ne sortent. Les deux branches lèvent la pause désormais, et rendent la main
au calcul de complétude plutôt que de décider à sa place.

### Le balayage antivirus, et la seule issue qui promeut

Branché le 22/09/2026. `ANTIVIRUS_URL` ne désigne pas un fournisseur connu
dont il faudrait deviner l'interface : elle désigne **le moteur que
l'exploitant met en face**, et c'est donc nous qui publions le contrat. Il
tient en quatre lignes, pour qu'une trentaine de lignes de colle suffisent
devant n'importe quel moteur — ClamAV et les autres n'exposent pas d'HTTP.

```
POST <ANTIVIRUS_URL>
Content-Type: application/octet-stream
<les octets du fichier>

200 {"status":"clean"}
200 {"status":"infected","signature":"Eicar-Test-Signature"}
```

**Aucune URL n'est transmise** — ni présignée, ni permanente. La
quarantaine existe pour qu'il n'y ait aucune adresse de lecture sur ces
octets ; en confier une à un tiers rouvrirait exactement ce qu'elle ferme,
et pour une durée qu'on ne contrôlerait plus.

Trois verdicts, et **un seul promeut** :

| Verdict | Les octets | La version | La suite |
|---|---|---|---|
| `SAINE` | passent dans le stockage de confiance | `SAINE`, datée | l'analyse part si le quota la couvre (RG-06.5) |
| `INFECTEE` | sont détruits | `INFECTEE`, sans clé | la pièce redevient à déposer, le candidat lit pourquoi |
| `INDISPONIBLE` | **ne bougent pas** | reste en quarantaine, l'attente est comptée | reprise, ou incident ouvert |

Le choix se fait par `switch` exhaustif sur `Verdict`, avec un
`const jamais: never`. Ce n'est pas une élégance : l'indisponibilité était
rendue par `null` et testée par `if (!verdict)` ; le jour où elle est
devenue un objet — pour porter sa cause —, ce test est passé à côté, parce
qu'un objet est toujours vrai. Le code tombait dans la branche de
promotion, et une pièce que personne n'avait balayée serait entrée dans le
stockage de confiance parce qu'un moteur n'avait pas répondu.

**Rejouer et signaler sont deux questions distinctes.** Une panne réseau se
reprend ; un fichier trop volumineux se rejouerait à l'identique jusqu'à la
fin des temps, et rejouer sans fin une tâche qui ne peut pas aboutir remplit
la file et noie l'incident qu'il fallait voir. `seReprendSeule` tranche, la
file porte une politique de reprise, et le seuil d'incident est franchi
**avant** que les reprises soient épuisées — être prévenu pendant qu'on peut
encore agir. Aucune des combinaisons n'accepte le fichier : signaler est une
visibilité, pas une porte de sortie. `/api/health` compte les pièces
bloquées et l'ancienneté de la plus vieille.

**La sonde présente EICAR au moteur**, une fois, au démarrage du worker.
C'est la seule chose qui prouve quelque chose : une `ANTIVIRUS_URL` bien
formée devant un service qui répond poliment `clean` à tout passerait pour
opérationnelle en laissant entrer chaque fichier — la seule panne de cette
chaîne qui ne se remarquerait pas. `INFECTEE` sur EICAR vaut preuve ;
`SAINE` est une panne, et il vaut mieux la lire au démarrage que sur le
premier fichier réellement infecté. La sonde est dans le worker et non dans
`/api/health`, pour la même raison que celle du courrier : cette adresse est
interrogée par un répartiteur de charge et ne déclenche rien.

### Le tunnel de paiement, et ce que l'ouverture ne fait pas

Le clic sur « Payer » ouvre une session chez le fournisseur et envoie le
navigateur sur sa page hébergée. Il ne confirme rien : `CONFIRMEE` et le
crédit du quota n'ont qu'une source, la notification signée (RG-05.1,
INV-7). Ni l'ouverture, ni l'adresse de retour, ni la relève de statut.

L'ordre des opérations porte deux garanties :

1. **L'ouvreur est réclamé avant la moindre écriture.** Sans clé, le refus
   est immédiat et aucune transaction locale n'est créée : une attente que
   rien ne viendrait clore serait pire qu'un refus.
2. **La transaction locale vient ensuite, et elle est reprise.** Sa
   référence est la clé d'idempotence, donc stable d'une tentative à
   l'autre : un second clic, ou une reprise après une réponse réseau
   perdue, retrouve la même session au lieu d'en ouvrir une seconde.

L'identifiant du fournisseur est enregistré **dès qu'il existe**, y compris
quand l'URL manque encore (`creee_sans_url`) : c'est ce qui permet de
*retrouver* au lieu de recréer. Il ne s'écrase jamais — l'écriture est
conditionnée à la colonne nulle, ce qui la rend sûre face à une
notification arrivée entre-temps (M.B). Et si cette session appartient déjà
à une autre transaction locale, l'ouverture est **refusée** : le candidat
partirait payer une session dont la notification créditerait le dossier du
voisin.

Trois refus avant d'envoyer qui que ce soit payer :

| Vérification | Ce qu'elle refuse |
|---|---|
| l'URL hébergée | absente, relative, en clair, ou sur un domaine étranger |
| la référence interne | une session qui ne renvoie pas notre référence — le webhook ne saurait pas quoi confirmer |
| le montant et la devise | ce que le fournisseur a enregistré doit être ce que la plateforme a décidé |

**La devise comparée n'existe pas toujours.** FedaPay documente
`currency_id`, un entier, là où sa création accepte `currency: { iso }` :
sur une lecture — donc sur toute reprise — il n'y a pas de code ISO à
comparer. `retrouver` reçoit la devise de la transaction locale et la rend
en repli ; sans elle, la comparaison échouait à tous les coups et **chaque
reprise d'un paiement en francs CFA ouvrait un écart** puis refusait le
candidat, alors que rien ne divergeait. Le repli ne contourne pas la
vérification : dès que le fournisseur dit la devise, c'est la sienne qui
est comparée, et le montant l'est toujours — c'est par lui qu'une
divergence réelle se manifeste.

Le client ne choisit jamais son fournisseur : il suit la devise (N.A), et
ni le fournisseur ni le montant ne sont reçus du navigateur. Les clés
sortantes ne sont lues que par `paiement/ouvreurs.ts`, et n'atteignent
aucun composant client.

**Le franc CFA n'a pas de sous-unité, l'euro si.** 12 € valent 1 200 pour
Stripe, 5 000 F valent 5 000 pour FedaPay. La conversion vit dans
`domain/paiement/ouverture.ts` — une erreur d'un facteur cent sur un débit
réel n'a pas sa place dans un adaptateur que personne ne relit.

Ce qui s'éprouve où :

| Vérification | Où |
|---|---|
| forme des requêtes, réponses inattendues, URL, référence, conversion | `tests/tunnel-ouverture.test.ts`, contre un `fetch` simulé |
| double soumission, reprise, écart de montant, appartenance, ordre webhook / retour | `npm run smoke:tunnel`, sur PostgreSQL avec un ouvreur simulé |
| exactitude des champs envoyés au fournisseur | `npm run sandbox:paiement`, qui s'abstient et le dit sans clés |

### La réconciliation, et ce qu'elle refuse de conclure

Le webhook peut se perdre. Un candidat débité qui ne voit rien arriver est
le pire défaut de ce produit. `jobs/reconciliation.ts` interroge désormais
le fournisseur (RG-05.4), et **applique l'état retrouvé par le même
service que les webhooks** — `appliquerLaNotification`. Une seule fonction
écrit un état de paiement et crédite un pack : la réconciliation n'a pas
son propre chemin d'écriture, donc pas sa propre façon de se tromper. Elle
hérite au passage de l'idempotence par `PaymentEvent.providerEventId` et de
la protection contre les courses.

L'identifiant d'événement est **déterministe** —
`reconciliation:<référence>:<état>` : deux passes qui lisent le même état
portent la même clé, et la seconde est un rejeu. Il est préfixé, donc
distinct d'un `stripe:evt_…`, mais ce n'est pas la clé qui départage une
course avec un webhook : c'est la table des transitions, qui refuse de
faire progresser un état déjà atteint.

Cinq issues, et leurs frontières sont la règle :

| Issue | Ce que le job en fait |
|---|---|
| `connu` | applique l'état, avec la cause **que le fournisseur a donnée** — jamais déduite |
| `sans_paiement` | rien : une session abandonnée n'est pas une carte rejetée |
| `introuvable` | ouvre un écart si une session avait été ouverte, rien sinon |
| `indisponible` | **rien du tout** — une absence de réponse n'est pas un refus bancaire |
| `incoherent` | ouvre un écart tout de suite, et n'applique rien |

Aucune de ces issues n'expire quoi que ce soit : l'expiration suit
`aExpirer` et elle seule. Ni Stripe ni FedaPay ne la prononcent.

**FedaPay est branché depuis le 22/09/2026.** Il ne l'était pas : deviner
quels états valent confirmation ou refus déciderait si un candidat est
crédité et si un échec lui est imputé, et la liste manquait. La
documentation publique la donne — `pending`, `approved`, `canceled`,
`refunded`, `declined`, `transferred` — et elle **coïncide** avec
`ETATS_FEDAPAY`, écrite d'après des notifications observées. Deux sources
indépendantes qui concordent, et la table n'est pas recopiée : la
consultation lit **la même**, importée, sans quoi les deux chemins
traduiraient un jour le même mot différemment.

Un état hors table rend toujours `indisponible` : la frontière n'a pas
bougé, seule la table s'est remplie.

### Les secrets de paiement, une seule nomenclature

`.env.example` portait `FEDAPAY_SECRET_KEY`, le code demandait
`FEDAPAY_API_KEY`, et personne ne lisait la première. Un exploitant qui
remplissait le fichier obtenait une installation déclarée non configurée,
sans rien pour lui dire laquelle des deux graphies valait.

`<FOURNISSEUR>_<USAGE>`, et l'usage dit le **sens** de l'appel :

| Suffixe | Sens | Ce que c'est |
|---|---|---|
| `_API_KEY` | sortant | la clé serveur avec laquelle nous appelons le fournisseur : création, consultation, remboursement |
| `_WEBHOOK_SECRET` | entrant | le secret avec lequel il signe ce qu'il nous envoie, et dont la vérification fait foi (RG-05.1) |
| `_ENVIRONMENT` | ni l'un ni l'autre | l'espace visé, `sandbox` ou `live`. Pas un secret |

`_SECRET_KEY` disait « secret » sans dire dans quel sens, alors que le
secret de webhook en est un aussi ; les deux ne se révoquent pas au même
endroit. `src/server/paiement/secrets.ts` les nomme, et lui seul.

Ce que chaque usage consomme aujourd'hui :

| Usage | Module | Variables | Branché ? |
|---|---|---|---|
| Création de paiement | `paiement/ouvreurs.ts` | `*_API_KEY` | **oui**, les deux rails — FedaPay conforme à sa documentation depuis le 22/09/2026, toujours non éprouvé contre un serveur |
| Webhooks | `paiement/signature.ts` | `*_WEBHOOK_SECRET` | **oui** |
| Consultation fournisseur | `paiement/consultation.ts` | `*_API_KEY` | **oui**, les deux rails — la table d'états FedaPay est confirmée par sa documentation |
| Remboursement sortant | `paiement/remboursement.ts` | `*_API_KEY` | Stripe **oui** ; FedaPay **n'expose aucune API de remboursement** — geste manuel au tableau de bord, MTN Mobile Money seulement |
| Espace FedaPay | `paiement/fedapay.ts` | `FEDAPAY_ENVIRONMENT` | **oui** — `baseDe` choisit le bac à sable ou la production |

Ce tableau avait dérivé : il annonçait « non » sur trois lignes que les
lots suivants avaient branchées. Une ligne fausse dans le sens rassurant
se remarque ; dans l'autre sens, elle fait refaire un travail déjà fait.
Les deux se corrigent en le relisant à chaque lot qui branche quelque
chose.

Les anciens noms sont repliés sur les nouveaux par
`environnementNormalise`, **seul** endroit qui les connaisse, avec un
avertissement au journal qui porte le nom et la date de retrait — jamais
la valeur. Le retrait est daté au 2026-12-31 et un test échoue quand la
date est passée : une compatibilité sans échéance devient une seconde
convention.

Trois vérifications tiennent l'ensemble : toute variable exigée par une
dépendance figure dans `.env.example` ; vider une variable bloquante
change ce que `/api/health` observe, ce qui prouve qu'elle a un lecteur
réel ; et aucun appel à `console` n'interpole la lecture d'un secret.

### Le courrier part, et le journal se tait

`SMTP_URL` lue et valide, les codes de vérification, les
réinitialisations, les reçus, les confirmations d'entretien et de
remboursement sont remis à un serveur SMTP (`courrier/smtp.ts`, sur
`nodemailer`). Absente, la dégradation ne change pas : rien ne part,
l'appelant l'apprend, et la messagerie reste bloquante pour l'ouverture
au public.

**Ni l'objet ni le corps n'atteignent le journal.** Pour la moitié des
courriers, l'objet **est** le secret — `481920 — ton code de
vérification ImmiPro` — et le transport de repli le recopiait à chaque
envoi, mettant le code d'ouverture de chaque compte dans un agrégateur
conservé des semaines. La trace porte le genre du courrier, le domaine
du destinataire et l'issue : de quoi exploiter un incident sans nommer
personne. Le genre est donné par l'appelant, jamais déduit du texte.

**`expedier` rend une issue** parmi cinq (`Envoi`, domaine) : envoyé,
journalisé, non configuré, refusé, injoignable. Seule la coupure est
renvoyable — on ne sait pas si le message est passé, et un second code
vaut mieux qu'aucun. Deux routes taisent délibérément l'issue, la
demande de réinitialisation et la création de compte : elles répondent
la même chose avec ou sans compte existant, et remonter l'échec dirait
« cette adresse est cliente ».

**La sonde ne conclut que sur un fait** — un envoi réel, ou un
`verify()` réel, qui ouvre la connexion et raccroche sans rien remettre.
Le worker l'appelle au démarrage. `/api/health` ne parle à aucun serveur
SMTP : cette adresse ne déclenche rien (décision du 21/09), et une
`SMTP_URL` qui s'analyse ne prouve rien.

### Rembourser, sans qu'une réponse 200 solde une dette

Trois faits, et un seul écrit le versement : `refundDueAt` dit qu'on
doit (K.C), `refundRequestedAt` dit que le fournisseur a **accepté la
demande**, `refundedAt` et `REMBOURSEE` disent que l'argent est reparti
— et ceux-là ne s'écrivent que dans `appliquerLaNotification`, sur
notification signée (INV-7, M.B).

La frontière ne risquait rien tant que rien ne partait. Elle commence à
risquer quelque chose le jour où un appel rend 200, parce qu'une réponse
200 ressemble à de l'argent rendu. L'adaptateur ne sait donc rendre
qu'« il a pris la demande » : `succeeded` chez Stripe arrive ici comme
`pending`, ce qui est la seule lecture qui reste vraie le jour où il
annule un remboursement `succeeded`.

**Cinq issues** (`IssueDeDemande`, domaine), parce qu'elles n'appellent
pas la même suite : acceptée, refus définitif, erreur passagère, réponse
illisible, rail non configuré. Le refus définitif et la réponse
illisible ouvrent un écart — relancer n'y changerait rien ; la panne
n'en ouvre pas, sans quoi la file se noierait sous des coupures réseau.
Aucune ne solde la dette.

**Deux reprises concurrentes ne produisent qu'une demande.** La clé
d'idempotence protège le fournisseur, pas le grand livre, et elle
suppose qu'il l'honore. La tentative est donc réservée avant tout appel,
par une mise à jour conditionnée à la valeur lue — l'arbitrage de la
base, comme pour la tenue d'un créneau. Le retrait des droits non
consommés, lui, est porté par un **index unique partiel** :
`analysiscredit_un_seul_retrait_par_remboursement`.

**L'identifiant est vérifié avant l'appel** (`defautDIdentifiant`) :
absent, aucune session n'a jamais été ouverte ; portant l'autre préfixe,
la demande viserait un paiement étranger. Côté Stripe s'ajoute la
relecture de `metadata[reference]` sur la session, parce que notre
`providerTxId` désigne une session — que Stripe ne rembourse pas — et
qu'il faut de toute façon aller chercher son intention de paiement.

**FedaPay n'est pas branché, et son adaptateur le dit.** Le format de
remboursement n'a pas pu être vérifié ; le deviner enverrait de l'argent
d'une manière non éprouvée, ou — pire, parce que silencieux — compterait
une demande acceptée et sortirait une dette de la file sans que personne
n'ait rien rendu. Tant que les deux rails n'y sont pas, la capacité
d'exploitation se lit non branchée.

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

**Le résolveur reçoit l'environnement observé**, et non `process.env`
(correctif du 22/09/2026). Il était appelé sans argument, si bien que les
trois mesures d'une même observation ne portaient pas sur la même chose :
`configuree` et la sonde lisaient l'environnement passé, normalisé, et le
résolveur lisait celui du processus, brut. Tant qu'aucun résolveur ne lisait
l'environnement, cela ne se voyait pas. Le balayeur branché l'a rendu
visible — une `ANTIVIRUS_URL` valide se lisait « aucun adaptateur ».

Sept capacités, et il en faut trois pour atteindre `OPERATIONNELLE` :

| Capacité | Ce qu'elle dit |
|---|---|
| `IMPLEMENTATION_ABSENTE` | aucun adaptateur — quelles que soient les variables |
| `NON_CONFIGUREE` | adaptateur présent, configuration absente |
| `CONFIGUREE_NON_VERIFIEE` | configuré, une sonde existe, elle n'a pas conclu |
| `NON_VERIFIABLE` | configuré, et aucune sonde sûre **ne peut** exister |
| `OPERATIONNELLE` | adaptateur, configuration, sonde — les trois |
| `DEGRADEE` | facultative indisponible, le repli fonctionne |
| `EN_PANNE` | attendue et injoignable |

Les sondes sont locales et sans effet de bord : aucun courrier, aucun appel
de fournisseur, aucun jeton d'IA, aucune écriture. Celles qui concluent
aujourd'hui lisent un **fait déjà établi** — une signature vérifiée, un
courrier réellement parti, EICAR réellement signalé —, jamais la forme d'une
variable.

#### Le fait doit franchir la frontière des processus

Il ne la franchissait pas. Deux sondes concluent sur un fait établi par le
**worker**, qui est un service séparé (`docker-compose.prod.yml`), et lu par
`/api/health`, qui vit dans le processus web. Le fait tenait dans une
variable de module : l'adresse lisait « aucune sonde n'a tourné »
indéfiniment, pour la messagerie et pour le balayage — deux bloquantes. Le
503 qu'on venait de rendre extinguible ne s'éteignait toujours pas, pour une
autre raison, invisible.

Le constat passe donc par la base (`ServiceProbe`), qui est le seul état
partagé. Il est écrit par qui sonde — le worker au démarrage et à chaque
passe horaire, le processus web à chaque courrier réellement expédié — et lu
en une requête par `/api/health`, qui le passe aux sondes. Celles-ci restent
pures : aucune ne va chercher quoi que ce soit.

**Un constat a une durée de validité**, ce qui manquait aussi :
`DernierFait` portait sa date et personne ne la lisait, si bien qu'un envoi
réussi trois semaines plus tôt aurait déclaré la messagerie opérationnelle
devant un serveur éteint depuis. Trois heures, soit le triple de la cadence
de resonde — un retard ne fait pas clignoter l'état, une panne installée se
voit. Au-delà, le constat redevient « aucune nouvelle » : ni succès, ni
échec, parce que le service n'a pas été pris en défaut.

**Et la sonde commande enfin quelque chose.** Un moteur qui a déclaré sain le
fichier d'essai répond sans détecter ; le dépôt d'une pièce le lit et refuse.
Auparavant il ne consultait que la configuration : les fichiers continuaient
d'être acceptés et promus par un moteur qui ne lit rien, pendant que l'état
de service le disait à qui voulait l'entendre. Une sonde dont rien ne dépend
est un affichage. L'ignorance, elle, ne ferme rien — une pièce déposée sans
constat reste en quarantaine, et n'est promue que sur un verdict « saine ».

#### Le 503 qui ne pouvait pas s'éteindre

Une bloquante n'est acquittée que par `OPERATIONNELLE`, et c'est la bonne
règle : « configurée » était l'état que produisait une variable factice.
Mais `ouverture_paiement` est bloquante et **ne peut pas** être sondée sans
effet de bord — ouvrir une session chez le fournisseur est un appel facturé
au temps. Elle plafonnait donc par construction, comptait parmi les
bloquantes, et rendait l'instance `INAPTE` quelle que soit la configuration,
pour toujours. `/api/health` répondait 503 en permanence.

Une adresse d'état qui ne peut pas être verte n'est pas une mesure : ou bien
l'instance n'entre jamais en service, ou bien on cesse de la lire, et c'est
la panne suivante qu'on ne verra pas. Deux choses étaient confondues, elles
sont séparées :

- une **bloquante** est un défaut d'installation : elle se répare, et elle
  inapte l'instance ;
- une **réserve** est une bloquante `NON_VERIFIABLE` : rien dans le
  déploiement ne la lèvera, elle est dite, comptée à part, et elle
  n'empêche pas de servir.

Une réserve n'acquitte pas pour autant : tant qu'il en reste une, l'aptitude
plafonne à `PILOTE`, et `/api/health` la nomme. Et ce n'est pas une
échappatoire — `sansSondeSure` exige sa raison, et un test la plafonne à
deux, sur le modèle de `copy-exceptions.json`. Le plafond est bas exprès :
une sonde sûre est presque toujours écrivable, et le balayage vient de le
montrer — on la croyait impossible, EICAR la rend triviale.

## Un dossier dérive trois choses de sa règle, et la migration n'en refaisait que deux

L'ouverture d'un dossier construit sa checklist **et** son échéancier depuis
le même payload, au même instant, « pour que les trois soient cohérents entre
eux ». La phrase est dans `ouvrirDossier`, et c'est la bonne. La migration
d'une divergence, elle, ajoutait les pièces de la nouvelle version et gardait
l'échéancier de l'ancienne.

Le dossier se retrouvait donc rattaché à une règle annonçant 150 jours
d'instruction, avec des dates calculées sur 90 — et le candidat venait
précisément d'accepter cette règle. Il déposerait deux mois trop tard, sur le
geste par lequel il croyait se mettre à jour.

En amont, rien ne l'avait prévenu : `comparerLesVersions` ne regardait pas
`delai_traitement_jours`, pour une raison qui se tenait — un délai ne rend
personne inéligible — et la propagation sort sans rien faire dès que le diff
est vide. RG-09.3 demande pourtant les deux : « un recalcul intégral de
l'échéancier **et** une notification explicite ».

Trois choses en découlent :

- le délai entre au diff, l'impact est `MAJEUR`, jamais `CRITIQUE` — mettre un
  dossier en pause parce que l'autorité annonce deux mois de plus retirerait
  au candidat la seule chose qui lui reste, le temps de s'organiser ;
- il n'entre pas dans `bloquantesTouchees` : ce n'est pas une condition, et
  WF-14 §4 ne le vise pas. Exiger deux paires d'yeux pour une fourchette de
  jours banaliserait le contrôle qui compte ;
- le remplacement de l'échéancier descend dans `dossiers/echeancier.ts`, appelé
  par la migration **et** par la replanification de WF-09, dans la transaction
  de chacune. Une implémentation, pas deux — et la replanification n'était
  éprouvée par rien, ce qui aurait fait de l'extraction un déplacement du
  défaut plutôt qu'une correction.

`doneAt` traverse le recalcul, `remindedAt` non : la date a bougé, le rappel
qui portait l'ancienne ne vaut plus, et le garder ferait taire le seul rappel
qui compte.

## Une décision éprouvée par une fumée, et que personne n'appelait

`arbitrerLaDivergence` était branchée sur sa route, éprouvée sur une base
réelle, et **aucun écran ne l'appelait**. Le bouton « Appliquer mon choix »
de T-02 fermait la feuille ; l'écran annonçait « Ta checklist sera mise à
jour » au futur, sous une phrase qui promettait « Nous ne modifions rien sans
ton accord ». La promesse n'était tenue que parce que rien n'était jamais
modifié.

C'est le revers de la méthode qui a servi tout le reste : descendre une
décision d'une route vers un module serveur la rend éprouvable, et une fumée
verte peut alors décrire un chemin que personne n'emprunte. La fumée dit que
la décision est juste ; elle ne dit pas qu'elle est atteignable.

Le garde-fou est du côté de l'écran, et il porte sur **l'appel réseau** et non
sur le source : `@/lib/api` est remplacé dans les essais, et l'essai lit
l'URL et le corps partis. Relire le source ne suffit pas — on peut débrancher
une fonction d'un bouton en la laissant intacte plus bas dans le fichier, et
tout essai qui l'inspecte passe encore. C'est la leçon de S.1, appliquée ici
à un bouton qui, lui, n'était branché à rien du tout.

L'écriture suit le patron de la clôture C-11 : `appeler`, `envoi`, `echec`,
`BlocEchec`, `router.refresh()`. Et la feuille ne se ferme **qu'une fois
écrit** — fermer d'abord ferait disparaître le seul endroit où l'échec peut
se lire, sur une décision qui remplace un échéancier entier.

## Une horloge que la plateforme remettait à zéro

RG-04.2 — « un dossier `BROUILLON` inactif depuis 90 jours déclenche une
relance, puis passe en `ABANDONNE` à 12 mois » — n'existait nulle part.
`ABANDONNE` vivait dans l'enum Prisma, dans `EtatStocke`, et l'écran savait
l'afficher : `versStatut("ABANDONNE")` rend « CLOTURE ». Aucune écriture ne le
produisait. Un brouillon de vingt et un mois restait `BROUILLON`, sans la
moindre relance. Même forme que le `readyAt` de S.47 et que l'`EXPIREE` de la
péremption : un état que le produit décrit et que personne n'écrit.

Le piège n'était pas là. Il était dans **l'horloge**.

Mesurer l'inactivité sur `Application.updatedAt` est le réflexe, et il est
faux : `@updatedAt` se déplace à **toute** écriture, y compris celles de la
plateforme. Le job de rappels d'échéance réveille aussi les brouillons
(`ETATS_RAPPELABLES`) et pose `lastReminderAt` — il aurait remis l'horloge à
zéro chaque semaine, et les douze mois ne seraient jamais arrivés. Un dossier
mort serait resté vivant parce que la plateforme lui écrivait. La mutation le
montre : avec `updatedAt`, le dossier de treize mois n'est pas clos, il est
relancé.

L'horloge est donc ce que **le candidat** a produit : l'ouverture du dossier
et le dernier dépôt de pièce. Aucune passe de nuit n'écrit de
`DocumentVersion` — l'analyse note un verdict, la péremption déclasse, la
purge efface un contenu, aucune n'en crée.

Trois conséquences tiennent ensemble :

- **La relance ne touche pas le dossier.** Elle écrit une `Notification` de
  genre `INACTIVITE` et rien d'autre : poser un champ sur `Application`
  déplacerait `updatedAt`, et le brouillon passerait pour actif.
- **Le marquage suit le courrier.** Marqué d'abord, un candidat dont la boîte
  refuse ne serait plus jamais relancé — et serait clos neuf mois plus tard
  sans avoir rien reçu. C'est la règle des rappels et des divergences, et elle
  vaut ici plus qu'ailleurs.
- **L'abandon programme la purge.** `ABANDONNE` est terminal —
  `exigerModifiable` le refuse, plus rien ne vient derrière. Clore sans poser
  `purgeDueAt` aurait laissé des pièces d'identité dans le stockage pour
  toujours, un trou d'INV-5 ouvert à l'endroit même où l'on ferme un dossier.

Une dernière chose, que seule une base a montrée : la passe décide sur une
horloge injectée et marquait sur celle du serveur. Les deux coïncident en
production et divergent dès qu'une passe est rejouée en retard. La
notification porte donc `createdAt: maintenant`.

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
