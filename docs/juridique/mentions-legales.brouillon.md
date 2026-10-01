# Mentions légales — BROUILLON

> **Brouillon non validé, à ne pas publier en l'état.** Rédigé le 01/10/2026 (S.97) pour la direction et le conseil juridique. Les crochets `[À COMPLÉTER]` marquent ce que le produit ignore et qu'il ne faut pas inventer. Les crochets `[À TRANCHER]` marquent ce qui demande un avis. Voir `docs/juridique/README.md`.

*Dernière mise à jour : [À COMPLÉTER — date de publication]*

---

## 1. Éditeur de la plateforme

La plateforme ImmiPro, accessible à l'adresse [À COMPLÉTER — nom de domaine], est éditée par :

- **Dénomination sociale :** [À COMPLÉTER — le reçu de paiement affiche aujourd'hui « ImmiPro SAS ». À confirmer, ainsi que la forme sociale.]
- **Forme juridique :** [À COMPLÉTER — par exemple société par actions simplifiée de droit OHADA.]
- **Capital social :** [À COMPLÉTER]
- **Siège social :** [À COMPLÉTER — adresse complète, Cotonou, Bénin ?]
- **Immatriculation :** RCCM [À COMPLÉTER — numéro. Le reçu porte « RCCM Cotonou » sans numéro.]
- **Identifiant fiscal (IFU) :** [À COMPLÉTER]
- **Adresse électronique :** [À COMPLÉTER — le reçu affiche aujourd'hui service@immipro.bj. À confirmer comme adresse réellement relevée.]
- **Téléphone :** [À COMPLÉTER]

**Directeur de la publication :** [À COMPLÉTER — nom et qualité.]

## 2. Hébergement

La plateforme et ses données sont hébergées sur un serveur privé virtuel loué à :

- **Hébergeur :** Infomaniak Network SA [À VÉRIFIER — raison sociale exacte, adresse et pays selon le contrat d'hébergement souscrit, et localisation du centre de données.]

Les pièces déposées par les candidats sont stockées sur ce même serveur, dans un espace de stockage privé qui n'est jamais accessible directement depuis Internet. Le serveur porte aussi le moteur antivirus qui contrôle chaque fichier déposé.

## 3. Objet de la plateforme

ImmiPro informe sur les conditions de séjour de destinations d'études et d'emploi, et aide les candidats à préparer leur dossier : liste des pièces, vérification de leur conformité, complétude du dossier, rédaction assistée des pièces écrites, échéancier.

ImmiPro n'est ni un cabinet d'avocats, ni un conseil en immigration. La plateforme ne délivre aucun conseil juridique. Elle ne dépose aucune demande à la place du candidat et ne se prononce pas sur la décision de l'administration. Elle n'est affiliée à aucune administration, ambassade ou autorité d'immigration.

Chaque information réglementaire affichée porte sa source officielle et la date de sa dernière vérification.

## 4. Propriété intellectuelle

La structure de la plateforme, ses textes, ses fiches et guides, ses éléments graphiques, son logotype et son signe sont la propriété de l'éditeur ou font l'objet d'une autorisation d'usage [À COMPLÉTER — dépôt de la marque ImmiPro : effectué ou non, auprès de quel office (OAPI ?)]. Toute reproduction, représentation ou réutilisation, totale ou partielle, sans autorisation écrite est interdite.

Les documents déposés et les textes rédigés par un candidat restent les siens. Voir les conditions d'utilisation et de vente.

## 5. Données personnelles

Le traitement des données personnelles est décrit dans la page « Données personnelles » [À COMPLÉTER — page encore absente, qui dépend de la désignation du responsable de traitement]. Elle précise les finalités, les bases légales, les destinataires et sous-traitants, les durées de conservation et la façon d'exercer vos droits.

[À TRANCHER — autorité de contrôle compétente (APDP au Bénin ?) et formalités préalables : déclaration ou autorisation du traitement, notamment pour les pièces d'identité.]

## 6. Cookies

La plateforme dépose un seul cookie, strictement nécessaire à son fonctionnement :

| Nom | Finalité | Durée |
|---|---|---|
| `immipro_session` | Maintenir votre connexion à votre espace | 30 jours au plus. La session se ferme après 7 jours sans activité. |

Ce cookie n'est lisible que par la plateforme (attributs `HttpOnly`, `SameSite=Lax`, et `Secure` en production). Aucun outil de mesure d'audience, de publicité ou de suivi n'est utilisé.

## 7. Contact

Pour toute question sur la plateforme ou ces mentions : [À COMPLÉTER — adresse électronique réellement relevée et délai de réponse annoncé. Voir la page « Contact », arbitrage Q.A.]

---

## Sources dans le code, pour la relecture

| Affirmation | Source |
|---|---|
| Émetteur actuel du reçu : « ImmiPro SAS · RCCM Cotonou · service@immipro.bj » | `src/domain/paiement/recu.ts` (`EMETTEUR`) |
| Hébergement sur un VPS Infomaniak | `INSTALLATION-GITHUB.md`, `README.md` (pile technique) |
| Stockage privé, sans accès direct depuis le client, URL présignées de 5 minutes | `CLAUDE.md` (règle d'architecture 4), `docker-compose.prod.yml` |
| Antivirus sur le même serveur | `docker-compose.prod.yml` (services `clamav`, `antivirus`), S.96 |
| Pas de conseil juridique, pas de dépôt à la place du candidat, pas de promesse | `CLAUDE.md` (INV-1, INV-2), DOC-11 RG-08.2 |
| Source et date sur chaque information réglementaire | `CLAUDE.md` (INV-8) |
| Un seul cookie : nom, attributs, durées | `src/server/securite/session.ts` (`COOKIE_SESSION`, `DUREE_JOURS`, `INACTIVITE_JOURS`) |
| Aucun outil de mesure d'audience | Aucun script de mesure dans le code ; consentement `MESURE_AUDIENCE` sans effet (`src/domain/comptes/consentements.ts`) |
| Pages légales absentes et bloquantes | `src/domain/exploitation/pages-publiques.ts` (Q.A) |
