# S.177 — Complément L5 : campagne Vertex et plafond global

Autorisation du responsable, 12/10/2026 : **Vertex uniquement**, projet
`projetanatt`, région `europe-west1`, Gemini 3.8 Flash demandé, compte
`immipro-vertex-ai`, **5 000 XOF sur toute la durée des essais**. Pas d'autre
fournisseur pour ces essais ; secret ajouté par le responsable, jamais lu
ou copié depuis le coffre de production. Le contexte béninois motive l'unité
F CFA/XOF annoncée avant préparation. Aucun changement de production implicite.

Base `5ada263` : #286/S.176 fusionné, aucun écart de code avec la branche
validée ; Claude, DOC-11/12, registre et banc S.176 relus avant code.
Aucune PR concurrente au départ ; S.177 libre. D1, origine L1, mesure L2,
avis L3, réservation L4, Prisma 7 et pg-boss 12 conservés.

## Écart et plan présentés avant modification

Le manifeste S.176 décrivait un budget du compte et un maximum d'invocations,
mais n'arrêtait pas le réseau selon une enveloppe monétaire durable. Une
nouvelle passe pouvait repartager le même budget sans journal commun.
Plan : destination nominative, borne de coût vérifiée, réserve globale
avant réseau, verrou, arrêt sur inconnu/interruption et aucun reset implicite.
La console de facturation et un coût estimé après réponse ne garantissent
pas, à eux seuls, le plafond du prochain appel.

## Correction proposée

La campagne impose projet/région/modèle/compte et la forme PDF ; v1/v1beta1
régional acceptés, API Developer/autre région/projet/modèle refusés. Modèle
réel et accès restent à vérifier ; aucun autre Gemini essayé automatiquement.
Manifeste et campagne indiquent la même région/source tarifaire, et le tarif
configuré ne dépasse pas le majorant dans sa devise.

L'exemple de campagne est **bloquant** : disponibilité, limites, tarifs,
change et frais non vérifiés ; aucune valeur financière inventée. Une borne
vérifiée doit couvrir tous les éléments réellement facturables. Deux échanges
maximaux sont réservés par invocation pour la reprise OAuth S.99 ; calcul en
entiers BigInt et arrondi supérieur. Une hypothèse déclarée n'est pas une
preuve de facture : impossibilité de borner → aucun appel payant.

Journal privé `.qualification-vertex` à la racine Git, même fichier pour
l'ensemble des passes/reprises ; verrou exclusif et écriture fsync/renommage
atomique avant réseau. Réserve globale au plus 5 000 000 000 micro-XOF, aucune
restitution automatique, même après vrai zéro ou absence d'appel. Plafond
insuffisant : arrêt avant OAuth/modèle. Usage inconnue/partielle/invalide ou
limite dépassée : arrêt, traces conservées, rapprochement et reprise refusée.
Crash : invocation en cours et verrou conservés ; corruption/changement de
borne : refus sans remise à zéro. Pas de transfert de checkout sans journal.
La réserve prudente n'est ni coût consommé ni facture ; le rapport ne lève
aucun préalable automatiquement. Pas d'effet sur un pack/grand livre candidat.

## Validation locale

- **191 fichiers / 3 879 tests**, dont **32 nouveaux**, passent.
- Contrôles de destination, bornes incomplètes, plafond modifié, calcul au
  supérieur avec change/frais/deux échanges ; aucune clé réelle ni prix réel.
- Vrai système de fichiers : cinq passes réservées puis sixième refusée
  avant HTTP, journal relu, ouvertures concurrentes, vraie sortie de
  sous-processus après réserve, reprise et corruption/changement de borne.
- Vrais CLI et adaptateurs compatibles/OAuth avec transport **synthétique** :
  les cinq passes gardent le budget ; la sixième ne demande même pas OAuth.
  Usage absente : arrêt ; reprise avant OAuth/modèle également refusée.
  Racine budgétaire temporaire propre aux tests, jamais le journal réel.
- Régressions S.176/L1–L4 intactes. Types/lint/vocabulaire, build et audit
  suivis dans [les preuves](preuves-l5-vertex-2026-10-12.json).

Les tests SDK utilisent une clé RSA générée, pas une clé du projet ; ils
ne contactent pas Google. Le garde-fou lint a imposé de renommer une variable
de test, sans assouplissement de sa règle. Les tests nouveaux rejoignent
check/porte commune CI-déploiement. Aucun test d'écran ajouté, aucun écran
modifié. WF-06/08/16, INV-1/2/6 et D1 inchangés.

## État de la qualification réelle

Au contrôle courant, configuration observée à jour sans secret/variable IA
ni identité sortante. API Vertex, OAuth et documents officiels hors hôtes
autorisés. Aucun appel commercial, aucune dépense du plafond ; modèle,
prix/limites/change/frais encore non vérifiés. La clé de production signalée
par le responsable n'a pas été consultée. L'autorisation fournisseur/budget
est acquise, ne pas la redemander ; les accès sont ajoutés par le responsable.

[Configuration, campagne, commandes et reprises](../exploitation/qualification-vertex-l5.md),
[exemple bloquant](../exploitation/campagne-vertex-l5.exemple.json).
Après accès et borne vérifiés : prédiagnostic limité puis 30 pièces, 10
rédactions/critique et 10 références dans le restant de la même enveloppe.
Deux grilles humaines indépendantes sur ce seul fournisseur ; pas d'appel
à un second prestataire pour utiliser le mélange multi-fournisseur.
Rapprochement des appels du banc distinct du trafic de production ; DPA,
résidence/conservation, incidents réels, conclusions séparées extraction/
rédaction et configuration déployée restent à attester. Aucun coût inconnu
transformé en zéro, aucune facture estimée présentée comme rapprochée.

Proposition pour revue avant intégration ; aucune fusion/déploiement par ce
complément. **L5 reste ouvert**, qualification réelle et Q.A/M.C non levés.
