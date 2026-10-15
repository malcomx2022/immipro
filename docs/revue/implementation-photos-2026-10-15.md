# S.179 — Implémentation des photographies publiques

**15/10/2026**, base `de85961` / #288 fusionnée, branche `feat/photos-publiques`.
Autorisation du responsable : « oui je valide pour tout et fait l'implémentation
et tout les test ». Charte, code et décisions Claude relus avant modification.

## Livraison

Cinq scènes validées et quinze WebP locaux, composants responsives et catalogue
pays/slug explicite. Accueil avec priorité au simulateur sur mobile et photo
latérale sur bureau ; sept autres familles publiques couvertes. Logo, source,
date, publication, contenu réglementaire, schéma et consentements inchangés.
Aucun contenu éditorial démo créé en production, aucun appel IA ou paiement.

[Spécification et commandes](../photographies.md). Les photographies hors
catalogue se replient vers le texte seul ; les autres espaces conservent leurs
SVG/pictogrammes. Les tests éditoriaux historiques restent inchangés.

## Vérification

- 16 nouveaux tests unitaires/interface : association, pays/sujet inconnu,
  invariants de livraison/poids, alternative textuelle, repli, dates et liens,
  refus d'une base distante avant le lancement destructif du banc.
- `npm run check` : types, lint, formulations et 3 906 tests dans 196 fichiers
  réussis localement ; la porte de qualité répète ces contrôles sur le commit.
- Build de production app/worker et audit exécutés ; aucune nouvelle exception
  d'audit. Les avis préexistants ne sont pas une qualification de sécurité globale.
- Recette locale Chromium : 28 scénarios à 390 et 1440 px sur vraie app,
  vrai worker et PostgreSQL. Fichiers décodés, variantes et dimensions mesurées,
  source/date présentes, pas de débordement ou erreur JS ; réponse du simulateur
  conservée, contenu retiré/brouillon refusé, image absente sans cadre vide.
- La porte commune exécute les 84 scénarios sur les trois navigateurs et les
  deux dimensions. Son verdict et son artefact sont attachés à la PR.
- Mesures initiales de LCP/CLS et transfert, puis relevé après défilement
  conservés avec les captures ; ce sont des diagnostics de laboratoire.

Le jeu de recette est créé dans `immipro_recette_photos` uniquement, les contenus
synthétiques sont marqués comme tels. Les commandes n'utilisent aucune clé IA,
aucun prestataire payant ni aucun coffre de production. Le budget Vertex L5
n'est pas consommé par ce chantier. Les autres fumées de la porte restent exigées.

## Limites pratiques

Les photographies ne certifient ni les lieux représentés ni les personnes.
Pas de portrait réel remplacé par un visage synthétique. Le changement ajoute
uniquement la présentation publique validée ; les modèles éditoriaux demeurent
textuels et leurs gardes ne sont pas assouplis. Une image n'ouvre pas un pays
ou une procédure retirée, même si son fichier existe dans le dépôt.

Les mesures de réseau local/runner ne certifient pas une liaison mobile réelle,
ni le percentile 75 des visiteurs en production ; un lecteur d'écran humain et
les critères L6 restants ne sont pas déclarés validés par ces tests. L5/Vertex,
Q.A et M.C restent ouverts. Aucune fusion ni aucun déploiement automatique.
