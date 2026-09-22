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
| Messagerie | `courrier.ts`, `leTransport` / `brancherTransport` | Les courriers sont journalisés, l'absence de configuration est signalée une fois |
| Antivirus | `securite/antivirus.ts`, `leBalayeur` | Le dépôt est refusé et le message dit que le contrôle manque (I.D). Avec un moteur, une indisponibilité laisse la pièce en quarantaine et ouvre un incident — jamais une promotion |
| Extraction IA | `jobs/analyse.ts`, `lExtracteur` | La pièce part en revue manuelle et l'analyse est recréditée — jamais déclarée conforme sans lecture |
| Rédaction IA | `redaction/service.ts`, `leRedacteur` / `laCritique` | L'écran dit ce qui manque ; la réécriture par le candidat, elle, n'attend rien |
| Remboursement | `paiement/remboursement.ts`, `leRembourseur` | La dette reste ouverte et visible en B-04, la tentative est comptée |
| Interrogation des fournisseurs | `jobs/reconciliation.ts`, `Interrogation` | Le retard est marqué, un écart s'ouvre au-delà de 24 h, rien n'est accusé sur un silence |

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
