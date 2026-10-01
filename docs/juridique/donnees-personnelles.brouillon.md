# Données personnelles — BROUILLON

> **Brouillon non validé, à ne pas publier en l'état.** Rédigé le 01/10/2026 (S.97) pour le responsable conformité et le conseil juridique. Il décrit les traitements tels qu'ils sont codés à cette date. Les crochets `[À COMPLÉTER]` marquent ce que le produit ignore et qu'il ne faut pas inventer. Les crochets `[À TRANCHER]` marquent ce qui demande un avis. Voir `docs/juridique/README.md`.

*Dernière mise à jour : [À COMPLÉTER — date de publication]*

---

## 1. Qui traite vos données

Le responsable du traitement est [À COMPLÉTER — l'entité désignée dans les mentions légales, et la personne ou la fonction chargée de la protection des données, avec son adresse de contact].

[À TRANCHER — autorité de contrôle compétente (Autorité de protection des données personnelles, APDP, au Bénin ?) et formalités préalables, notamment pour le traitement de pièces d'identité et le transfert de données hors du Bénin.]

## 2. Ce que nous collectons, et pourquoi

| Données | Pourquoi | Base légale |
|---|---|---|
| **Compte :** adresse électronique, mot de passe (conservé sous forme d'empreinte, jamais en clair), prénom, nom, téléphone, pays | Créer et sécuriser votre compte, vous écrire | Exécution du contrat [À TRANCHER] |
| **Profil :** objectif, diplôme le plus élevé, domaine d'études, années d'expérience, langues, budget | Situer votre profil par rapport aux conditions des destinations | Exécution du contrat [À TRANCHER] |
| **Dossier :** destination, date de départ visée, état du dossier, échéances, date de dépôt déclarée | Construire votre liste de pièces, votre échéancier et vos rappels | Exécution du contrat [À TRANCHER] |
| **Pièces déposées :** passeport, carte d'identité, acte de naissance, diplômes, relevés bancaires, attestations…, et les informations qui en sont lues (noms, dates, montants) | Vérifier la conformité de chaque pièce et la cohérence du dossier | **Consentement distinct** pour les pièces d'identité, recueilli avant tout dépôt [À TRANCHER pour les autres pièces] |
| **Textes rédigés :** réponses à l'entretien guidé, lettres et leurs versions | Rédaction assistée et relecture | Exécution du contrat [À TRANCHER] |
| **Paiements :** référence, offre, montant, devise, prestataire, statut, remboursements | Encaisser, émettre un reçu, rembourser, tenir la comptabilité | Exécution du contrat ; obligation légale [À TRANCHER] |
| **Consentements :** chaque autorisation donnée ou retirée, avec sa date et la version du texte | Prouver ce que vous avez accepté ou refusé | Obligation légale [À TRANCHER] |
| **Rendez-vous avec un consultant :** créneau, consultant, partage de votre dossier | Organiser la consultation | Exécution du contrat [À TRANCHER] |
| **Sécurité :** sessions de connexion (navigateur utilisé, dates), tentatives de connexion échouées, journal des opérations sensibles | Protéger votre compte et la plateforme | Intérêt légitime [À TRANCHER] |

Nous ne collectons pas de données que le service n'utilise pas.

**Le simulateur ne garde rien de vous.** Tant que vous n'êtes pas connecté, vos réponses restent sur votre appareil, le temps de votre visite. Le serveur les reçoit pour faire le calcul et n'en conserve aucune trace.

**Votre adresse IP** sert seulement à limiter le nombre de requêtes contre les abus. Elle est gardée quelques minutes en mémoire et n'est jamais enregistrée en base.

## 3. Vos autorisations

Aucune autorisation n'est donnée par défaut. Chacune se donne et se retire à tout moment depuis la page « Mes consentements ».

| Autorisation | Ce qu'elle permet | Si vous la refusez ou la retirez |
|---|---|---|
| Analyse de mes pièces d'identité | Déposer et faire lire passeport, carte d'identité, acte de naissance | Aucune pièce ne peut être déposée. Le retrait arrête aussi l'analyse des pièces déjà déposées. |
| Analyse de mes pièces financières | Lecture du montant et de l'ancienneté des relevés et attestations | [À COMPLÉTER — aucun effet dans le produit aujourd'hui] |
| Alertes de changement de règles | Recevoir un courriel quand une exigence de votre destination change | L'alerte reste visible dans votre dossier, mais aucun courriel ne part. |
| Propositions de partenaires | Être mis en relation avec un consultant ou un partenaire | Aucune proposition ne vous est faite. |
| Mesure d'audience anonyme | Statistiques d'usage sans identifiant personnel | [À COMPLÉTER — aucune mesure d'audience n'existe aujourd'hui. Retirer ce choix ou le décrire quand elle existera.] |

## 4. Analyse automatique et intelligence artificielle

- La lecture des pièces et la rédaction assistée font appel à un **prestataire d'intelligence artificielle**, sous-traitant d'ImmiPro. Il reçoit le fichier ou le texte concerné, et rien d'autre : ni votre adresse, ni l'adresse du fichier dans notre stockage.
- Les **pièces d'identité** ne sont confiées qu'au prestataire désigné à cet effet. Un autre prestataire n'en reçoit que sur une autorisation écrite d'ImmiPro.
- La **complétude du dossier** est calculée automatiquement à partir des pièces et des règles de la destination. Elle indique ce qui manque ou doit être corrigé. Elle ne produit aucune décision à votre égard, et ne se prononce pas sur la décision de l'administration.
- [À TRANCHER — préalable L.A : faut-il expliquer davantage la logique de ce calcul ? L'export de vos données en donne les facteurs, sans leur pondération.]
- [À COMPLÉTER — ce que le prestataire d'IA fait des données reçues : conservation, entraînement de modèles, selon le contrat souscrit.]

## 5. Qui reçoit vos données

Vos données ne sont ni vendues ni louées. Elles sont accessibles :

- à l'**équipe d'ImmiPro** habilitée, pour la revue manuelle des pièces, le support et les remboursements. Chaque opération sensible est enregistrée dans un journal ;
- au **consultant** que vous avez choisi, si vous partagez votre dossier avec lui. Ce partage est révocable et prend fin 14 jours après le rendez-vous ;
- aux **sous-traitants** suivants, pour la seule exécution du service :

| Sous-traitant | Rôle | Pays de traitement |
|---|---|---|
| Infomaniak [À VÉRIFIER] | Hébergement du serveur, de la base de données et des pièces | [À COMPLÉTER — Suisse ?] |
| Anthropic [À VÉRIFIER — ou autre prestataire désigné] | Lecture des pièces, rédaction assistée | [À COMPLÉTER — États-Unis ?] |
| FedaPay | Paiements Mobile Money (franc CFA) | [À COMPLÉTER — Bénin ?] |
| Stripe | Paiements par carte (euro) | [À COMPLÉTER] |
| [À COMPLÉTER — fournisseur de messagerie retenu, Brevo envisagé] | Envoi des courriels | [À COMPLÉTER] |

Le contrôle antivirus et le stockage des pièces tournent sur notre propre serveur : aucun tiers ne reçoit vos pièces pour ces deux opérations.

[À TRANCHER — transferts hors du Bénin : encadrement juridique de chaque transfert et formalités auprès de l'autorité de contrôle.]

## 6. Combien de temps nous les gardons

| Données | Durée |
|---|---|
| Pièces d'un dossier clos | Supprimées sous 30 jours |
| Pièces d'un dossier inactif | Rappel à 90 jours ; dossier abandonné à 365 jours, puis pièces supprimées sous 30 jours |
| Pièces d'un dossier déclaré déposé | 12 mois après le dépôt, prolongeables par périodes de 6 mois à votre demande |
| Pièces d'un dossier en pause | 12 mois, avec un avertissement à 11 mois |
| Alertes réglementaires | 6 mois |
| Motif d'un échec de paiement | 90 jours, ou 30 jours après la clôture d'un litige s'il y en a un |
| Historique des consentements, journal des opérations | 5 ans |
| Reçus et écritures de paiement | [À COMPLÉTER — durée légale de conservation comptable] |
| Compte | Jusqu'à sa suppression |

Toute suppression de pièces programmée vous est annoncée au moins 30 jours à l'avance.

## 7. Vos droits

| Droit | Comment l'exercer |
|---|---|
| Accès et portabilité | Page « Mes données » : téléchargement de vos données et de vos pièces |
| Rectification | Votre prénom, votre nom, votre téléphone et votre profil se corrigent depuis votre espace. Pour le reste : [À COMPLÉTER — contact] |
| Retrait d'un consentement | Page « Mes consentements », à tout moment |
| Effacement | Suppression du compte depuis votre espace. Elle est immédiate et définitive : pièces supprimées ; nom, adresse, téléphone, profil, réponses et alertes effacés. Restent, sans votre nom, les reçus, le décompte des analyses et l'historique des consentements, pour les durées ci-dessus. |
| Opposition, limitation, réclamation | [À COMPLÉTER — contact et délai de réponse] |

Vous pouvez aussi saisir l'autorité de contrôle compétente [À TRANCHER — APDP ?].

## 8. Sécurité

- Les pièces déposées sont contrôlées par un antivirus avant d'être acceptées, et gardées à l'écart tant que le contrôle n'a pas conclu.
- Elles sont conservées dans un stockage privé, jamais accessible directement depuis Internet. Chaque téléchargement passe par un lien valable 5 minutes.
- Les mots de passe sont conservés sous forme d'empreinte.
- Les échanges avec la plateforme sont chiffrés (HTTPS).
- [À COMPLÉTER — chiffrement des données au repos, sauvegardes et leur durée de conservation.]

## 9. Cookies et stockage sur votre appareil

| Élément | Finalité | Durée |
|---|---|---|
| Cookie `immipro_session` | Maintenir votre connexion | 30 jours au plus ; fermeture après 7 jours sans activité |
| Stockage de session du navigateur | Garder vos réponses au simulateur pendant votre visite | Jusqu'à la fermeture de l'onglet |

Ces deux éléments sont strictement nécessaires au service. Aucun outil de mesure d'audience, de publicité ou de suivi n'est utilisé.

## 10. Mineurs

[À COMPLÉTER — âge minimum. Le produit n'en fixe aucun aujourd'hui.]

## 11. Modifications

Nous vous informerons de toute modification importante de cette page [À COMPLÉTER — moyen et délai].

---

## Sources dans le code, pour la relecture

| Affirmation | Source |
|---|---|
| Champs du compte, du profil, du dossier, des pièces, des paiements, des sessions | `prisma/schema.prisma` (modèles `User`, `Profile`, `Application`, `Document`, `DocumentVersion`, `Transaction`, `Session`, `AuditLog`) |
| Le simulateur n'écrit rien ; réponses en `sessionStorage` | `src/app/api/simulations/route.ts` (RG-01.1) |
| IP utilisée pour le seul contrôle de débit, en mémoire | `src/server/http/route.ts`, `src/server/http/limites.ts` |
| Autorisations, textes, effet du refus, aucune active par défaut | `src/domain/comptes/consentements.ts` (RG-02.1, RG-02.2) |
| Prestataire d'IA : octets seuls, sans URL ; garde des pièces d'identité | `src/server/dossiers/extracteur.ts`, `src/domain/ia/fournisseurs.ts` (S.94) |
| Complétude calculée, pondération non restituée | `CLAUDE.md` (INV-1), `src/server/lecture/portabilite.ts`, préalable L.A |
| Partage avec le consultant, 14 jours | `src/domain/consultants/access.ts` |
| Journal des opérations, 5 ans | `src/domain/backoffice/audit.ts` |
| Durées de conservation | `src/domain/dossiers/cloture.ts`, `conservation.ts`, `inactivite.ts`, `src/domain/notifications/alerte.ts`, `src/domain/paiement/conservation.ts` |
| Suppression du compte et ce qui reste | `src/domain/comptes/suppression.ts` (RG-10.4) |
| Export « Mes données » | `src/server/lecture/portabilite.ts`, `src/app/(auth)/compte/mes-donnees` ; rectification : `src/app/api/comptes/profil/route.ts` ; page « Mes consentements » : `src/app/(auth)/consentements` |
| Antivirus, quarantaine, stockage privé, liens de 5 minutes | I.D, S.96, `CLAUDE.md` (règle d'architecture 4) |
| Cookie de session | `src/server/securite/session.ts` |
| Sous-traitants | `INSTALLATION-GITHUB.md`, `src/domain/payments/rail.ts`, `docs/IA-fournisseurs.md` |
