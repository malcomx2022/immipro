# Revue fonctionnelle ImmiPro — 9 octobre 2026

**Statut : revue de code ; lot documentaire RF-0 autorisé, correctifs métier à réaliser.**

Base : main, commit 3f089c298e679a0f54be91e0a0a76181bda1eec0, S.125 à S.141 intégrés. La copie de travail fournie s'arrêtait à 0be5ea6/S.138 ; les 64 chemins modifiés, ajoutés ou supprimés depuis ont été réconciliés dans une copie isolée avec le connecteur GitHub. Le checkout d'origine est conservé.

Actualisation RF-0 : base main dd2b58f7fadf63e0917b6483199132898191bec1/S.144. Claude Code a fusionné [S.142 / PR #241](https://github.com/malcomx2022/immipro/pull/241), [S.143 / PR #242](https://github.com/malcomx2022/immipro/pull/242) et [S.144 / PR #243](https://github.com/malcomx2022/immipro/pull/243) : Stripe-Version, dépendances SMTP, ESLint plat et Next 16. Leurs diffs ont été rapprochés du chantier. Les sources des constats restent épinglées à la base de la revue ; les fichiers porteurs de FON-01 à FON-04 et E5 ne sont pas modifiés par ces trois lots. Une fusion ne démontre pas un déploiement.

## 1. Conclusion fonctionnelle

La V1 possède ses parcours principaux. Le chantier doit fiabiliser les transitions et obtenir les preuves de lancement, en conservant la logique de Claude Code : invariants INV-1 à INV-8, règles DOC-11, décisions du registre, domaine pur, monolithe modulaire, une correction et une preuve par lot.

**Un pilote fermé et une ouverture commerciale sont deux jalons distincts.** La présence du code et des tests ne démontre ni que les textes juridiques ont été publiés, ni que l'exploitation du VPS est prête, ni que les paiements réels peuvent être ouverts. La certification fiscale reste explicitement non branchée.

Aucun nouveau conseil juridique, classement des chances de visa, OAuth Google, SMS, passage Essentiel vers Pro, correction autonome du dépôt ou activation des partenaires n'est ajouté au périmètre V1.

## 2. Parcours examinés

| Parcours DOC-11 | Éléments examinés | Conclusion et chantier |
|---|---|---|
| WF-01 à WF-03 : simulateur, inscription, recommandations | Lectures réglementaires, filtres, composants publics, sessions et tests | Fonctionnalités présentes. Conserver les restrictions V1 et vérifier le parcours mobile complet en recette. |
| WF-04 : ouverture et tableau de bord | Domaine dossier, lecteur, formulaire C-05, API d'ouverture | Incohérence du plafond de dossiers ; établissement saisi puis perdu. |
| WF-05 : achat, recharge, montée | Adaptateurs, contreparties, grand livre, rapprochement, factures | Corrections S.128–S.140 présentes. Encaissement réel fermé tant que M.C n'est pas levé. Conserver S.142 fusionné. |
| WF-06 : pièces, balayage et extraction | Dépôt, versions, worker, quota, reprise et revue humaine | Ancienne version susceptible d'écraser l'état courant ; reprise gratuite bloquée à solde nul ; E5 interruption non fermé. |
| WF-07 : complétude | Calcul pur, conditions, recalcul et lecteurs | Présent. Sa fiabilité dépend de la bonne version de pièce et du respect de l'état du dossier. |
| WF-08 : rédaction | Versions, quota d'analyses, contrôle des textes, exports | Présent. Reprendre le diagnostic des productions antérieures M7 et les scénarios d'interruption dans la recette. |
| WF-09 : échéancier et rappels | Date cible, échéancier, fuseaux et jobs | Présent. Recette courrier et rappels à l'heure locale à conserver. |
| WF-10 : dépôt, clôture, purge et droits sur les données | États figés, conservation, portabilité, purge, restauration | Présent. L'arbitrage réglementaire peut réactiver un dossier soumis ; objets orphelins et restauration restent à traiter. |
| WF-11 et WF-14 : divergence et veille | Publication, règle figée, arbitrage et propagation | Corrections S.125 et S.137 présentes. Fermer l'arbitrage sur dossier figé et diagnostiquer l'historique. |
| WF-12 : consultants | Habilitations, créneaux et fumées existantes | Présent sous ses conditions. Ne pas annoncer une offre sans praticiens effectivement vérifiés. |
| WF-13 : partenaires | Registre des habilitations et filtre de requête | Désactivation attendue sans PartnerActivation. Ce choix de conformité n'est pas un défaut à contourner. |
| WF-15 : back-office | Revue, remboursements, comptes, journal | Présent. Formulaires à terminer ; recrédit commercial toujours à arbitrer. |
| WF-16 : coûts IA | Quota, jetons, tarifs, supervision et audit | INV-6 aligné en S.141 sur les analyses. Étalonnage sur dossiers réels et réglage des plafonds restent à décider. |

Cette matrice est une revue du code, des contrats et des tests. Elle ne vaut pas une recette navigateur de chacun des écrans ni une vérification de données en production.

## 3. Constats vérifiés

Les cinq reproductions supplémentaires exécutent les fonctions actuelles avec base, stockage et appels IA simulés. Leurs assertions confirment le comportement incorrect observé ; leur succès ne signifie pas que le défaut a été corrigé. Les courses et interruptions devront aussi être éprouvées sur PostgreSQL.

### FON-01 — Le plafond des dossiers diverge entre interface et serveur

**Priorité : élevée avant pilote.** Après trois dossiers clôturés, le tableau de bord retire encore « Ouvrir un nouveau dossier » et invite à clôturer un dossier. Le domaine compte toute la liste, tandis que le lecteur renvoie l'historique entier. Le serveur compte BROUILLON, ACTIF et PRET ; il omet SUSPENDU, alors que EN_PAUSE compte parmi les dossiers qui attendent une suite.

**Preuve exécutée :** trois objets de statut CLOTURE donnent false à peutOuvrirUnDossier. L'exclusion de SUSPENDU et la séparation count/create sont constatées dans le code ; la course de création reste à reproduire sur base réelle.

**Règle :** C-01, plafond de trois dossiers en parallèle ; cohérence avec ATTEND_UNE_SUITE et WF-04.

**Correction proposée :** compter les états réellement ouverts dans une règle partagée ; inclure les dossiers en pause ; ignorer les dossiers déposés et terminés selon cette règle ; sérialiser count + création par candidat dans une transaction. Ne pas supprimer l'historique pour libérer une place.

**Migration :** pas de nouvelle colonne nécessaire a priori. Diagnostiquer les comptes déjà au-delà du plafond avant d'appliquer une restriction ; aucun archivage automatique.

**Tests :** trois clôturés autorisent ; deux actifs et un en pause refusent ; avec deux ouverts, deux créations simultanées n'en ouvrent qu'une.

Sources : [domaine, L174](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/domain/dossiers/dossier.ts#L174), [lecteur, L59](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/server/lecture/dossiers.ts#L59), [serveur, L105](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/server/acces/dossiers.ts#L105).

### FON-02 — Un résultat ancien peut réécrire la pièce courante

**Priorité : élevée avant pilote.** Une v1 reste en traitement ; le candidat dépose une v2 ; la v1 termine après. analyserUnePiece vérifie l'existence de son verdict, mais pas que sa version est encore la version courante. Il écrit Document.status et Document.extracted par identifiant de pièce. Le verdict de v1 peut donc devenir celui affiché avec le fichier v2 et influencer la complétude.

**Preuve exécutée :** l'analyse v1 écrit les champs « ancienne » sur Document ; aucune vérification de version plus récente n'est appelée. La revue humaine présente un chemin similaire à L132, confirmé par lecture mais non reproduit séparément.

**Règles :** WF-06, traçabilité des versions, RG-06.2, WF-07 ; une conformité doit porter sur le fichier courant.

**Correction proposée :** protéger atomiquement la publication du résultat courant par le rang ou l'identifiant de version, avec le même verrou que le remplacement. Contrôler aussi l'état modifiable du dossier au moment d'écrire. Appliquer cette règle à analyse, balayage et décision humaine. Garder l'historique du résultat ancien sans lui permettre de modifier la pièce actuelle ; éviter une notification qui décrit à tort la nouvelle version.

**Décision :** définir ce que coûte un traitement devenu obsolète en cours d'appel : recommandation, ne pas faire payer au candidat deux résultats pour son remplacement. Ce choix doit rester distinct de la mesure des jetons réellement dépensés.

**Migration :** à décider lors de la conception : verrou/rang avec modèle existant, ou pointeur explicite de version courante. Ne pas ajouter une colonne sans démontrer son utilité.

**Tests :** v1 lente et v2 rapide ; remplacement pendant l'appel ; revue humaine de v1 après analyse de v2 ; clôture pendant l'appel. État, champs, complétude, notification et quota doivent tous correspondre à la décision retenue.

Sources : [analyse, L463](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/server/jobs/analyse.ts#L463), [revue humaine, L132](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/server/revue/decision.ts#L132).

### FON-03 — Une reprise gratuite demande encore un solde positif

**Priorité : élevée avant pilote.** Le domaine et le worker rendent gratuite la reprise après ILLISIBLE. Mais suiteApresPromotion ne lance une analyse que si solde > 0, sans consulter le verdict précédent.

**Scénario :** une pièce est illisible, son analyse est rendue ; le candidat utilise ses analyses sur d'autres pièces ; il redépose une meilleure photo avec un solde nul. La reprise gratuite est conservée sans analyse.

**Preuve exécutée :** consommeUneAnalyse(ILLISIBLE) vaut false ; balayerUnePiece avec une version saine en attente et solde nul rend CONSERVEE et remet la pièce à ATTENDUE.

**Règles :** WF-06, cas scan illisible et reprise ; INV-6 ; RG-06.5.

**Correction proposée :** une règle commune décide si cette version exige un débit. Le dépôt annonce la même chose que le balayage et le worker ; une reprise gratuite passe avec un solde nul, une première lecture payante reste refusée. Un retrait de consentement bloque toujours.

**Migration :** aucune attendue. **Tests :** ILLISIBLE puis solde nul ; première lecture à solde nul ; nouvelle version après HORS_SUJET ; retrait d'autorisation.

Source : [balayage, L229](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/server/jobs/balayage.ts#L229), [analyse, L261](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/server/jobs/analyse.ts#L261).

### FON-04 — Un arbitrage peut rouvrir un dossier déjà déposé

**Priorité : élevée avant pilote.** La route vérifie l'appartenance et appelle arbitrerLaDivergence sans exiger un dossier modifiable. La branche MIGRER pose ACTIF et change visaRuleId indépendamment de l'état actuel.

**Scénario :** une divergence majeure a été notifiée pendant la préparation ; le candidat dépose son dossier avant de répondre ; un ancien lien ou un appel à l'API permet ensuite de migrer.

**Preuve exécutée :** une Application SOUMIS passée au service reçoit une écriture ACTIF avec une nouvelle règle.

**Règles :** machines à états DOC-11 §2.1, WF-10, INV-3 ; dossier déposé ou clôturé figé.

**Correction proposée :** refuser la migration des dossiers SOUMIS, ISSUE_DECLAREE, ABANDONNE et ARCHIVE, à la route et dans le service réutilisable. Relire cet état sous verrou dans la transaction pour tenir contre un dépôt simultané. Le refus indique que le dépôt garde sa règle et son historique.

**Décision :** recommandation, garder l'alerte consultable sans offrir une migration du dossier figé ; préciser si une décision CONSERVER peut être enregistrée à titre historique ou si tout arbitrage est fermé.

**Migration :** aucune attendue. **Tests :** chaque état figé, ACTIF/PRET/SUSPENDU, dépôt concurrent à MIGRER, nouvelle règle retirée.

Sources : [service, L130](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/server/dossiers/migration.ts#L130), [route, L18](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/app/api/dossiers/%5Bid%5D/migrations/%5BmigrationId%5D/route.ts#L18).

### E5 restant — Interruption entre débit et verdict

**Priorité : élevée avant pilote ; point déjà ouvert par Claude Code.** L'unicité du verdict et le remboursement du concurrent perdant tiennent après S.125, mais une interruption avant l'écriture du verdict laisse un débit sans analysisId. Le rejeu ne le retrouve pas et débite de nouveau.

**Preuve exécutée :** extraction interrompue après le débit, puis rejeu réussi : deux appels à debiterUneAnalyse, aucun rendu sur l'interruption.

**Correction proposée :** rattacher durablement la réservation à une opération/version avant l'appel, avec unicité et transitions de réservation. Le rejeu réutilise ou solde l'opération ; un rendu est idempotent. Le coût d'un nouvel appel éventuel reste enregistré, même si le candidat ne paie pas un second débit. Un arrêt du processus ne permet pas de garantir un unique appel externe ; il doit permettre de garantir un quota cohérent.

**Migration :** probable, lien d'opération/version et contrainte d'unicité. Ne pas transformer rétroactivement un débit ambigu en analyse gratuite : diagnostic et traitement explicite.

**Tests/fumée :** interruption après réservation, après appel, pendant mesure des jetons, avant verdict et avant acquittement ; reprises concurrentes ; quota final, octroi d'origine, rendu, notification.

Sources : [débit avant extraction, L274](https://github.com/malcomx2022/immipro/blob/3f089c298e679a0f54be91e0a0a76181bda1eec0/src/server/jobs/analyse.ts#L274), plan du 07/10 §7, ligne E5.

### FON-05 / M11 restant — Établissement demandé puis perdu

**Priorité : moyenne, correction courte avant recette.** Le candidat renseigne « Établissement visé », lit qu'il pourra le renseigner plus tard, mais le corps de création n'envoie pas la valeur et l'API ne la reçoit pas. Le registre de Claude Code identifie déjà cet écart.

**Recommandation V1 :** retirer ce champ et adapter « Deux informations suffisent ». Si le métier veut le conserver, ajouter une donnée persistée, son édition et son usage dans la rédaction ; ce second choix est une extension à estimer et valider.

**Migration :** aucune si retrait ; additive si conservation. **Test :** tout champ encore présenté est envoyé, conservé et relu, ou explicitement décrit comme local et temporaire.

Source : OuvertureDossier.tsx L99, L118 et L164 ; plan historique §7/M11.

### DOC-01 — Des formulations de DOC-11 précèdent encore les arbitrages

**Priorité : moyenne, traitement documentaire initial.** Le cas remboursement à L258 parle encore de proratisation sur les tokens, alors que S.124/S.128 utilisent les analyses vendues figées. WF-05 L236 nomme une route /api/payments/status inexistante au lieu de /api/paiements/statut. WF-06 L275 impose Claude alors que S.94 autorise un fournisseur choisi ; RG-06.2 L283 parle de débit de tokens.

**Correction proposée :** aligner ces formulations sur les règles déjà décidées, sans modifier INV-6, la politique de fournisseur ni le contrat commercial. Ne pas déclarer une action « livrée » uniquement parce qu'une proposition ou une PR existe.

## 4. Blocages de lancement et travail restant

| Sujet | Nature du manque | Référence Claude Code | Condition de levée |
|---|---|---|---|
| Mentions légales, données personnelles, conditions, contact | Validation humaine et publication à vérifier | Q.A, pages-publiques.ts, textes-juridiques | Quatre pages validées et réellement consultables ; contact traité par une personne ; preuve conservée. |
| Facturation normalisée | Fonction non branchée dans le code | M.C, certification.ts L62–65 | Spécification et accès officiels, adaptateur testé, mentions de l'émetteur et TVA validées, facture et avoir effectivement certifiés. |
| Exercice comptable | Hypothèse appliquée par défaut | D-14, S.140 | Confirmation M.C. La date de prestation reste quelle que soit l'option. |
| Paiements | Preuves fournisseur | D-7, E3, S.142 fusionné | Bac à sable complet ; montant des remboursements FedaPay clarifié ; métadonnées de Charge Stripe vérifiées si rail activé ; version du webhook conforme. |
| Données historiques | Diagnostic et reprise | C1, E4, E7, M1, M4, M7 | Inventaire sans donnée sensible exportée ; résolution attribuée ; aucune réécriture silencieuse d'historique figé. |
| Supervision | Compteur manquant et recette d'alertes | E6, M9, M10 | Analyses en retard identifiables, alertes observées, worker et accès de supervision éprouvés. |
| Restauration et purge | Commande de purge dans l'image et essai opérationnel | E10, INV-5 | Restauration isolée, purge des pièces échues avant remise en service, preuve de disparition des octets, alerte sauvegarde reçue. |
| VPS et stockage public | Vérification du déploiement réel | E1, E9, M15, M16, F1 | nginx/certificats, six services healthy, sauvegarde, contrôles de débit, aperçu et retour de paiement réellement éprouvés. |
| Recrédit commercial et plafonds IA | Décisions produit | S.121, S.122 | Règles de montant, autorisation, imputation et seuils décidées avant ajout d'actions. |
| Maintenance | Dette maîtrisée | M19, M20, F10 | S.142 traité avec Claude Code ; S.143/S.144 fusionnés ; autres majeures et refactorings en lots séparés. |

Les textes, l'identité de l'entreprise, les credentials fiscaux, les verdicts de conformité et les preuves d'exploitation ne sont pas déductibles du dépôt. La revue ne les invente pas.

## 5. Contrôles de cette revue

Le détail final des commandes et leurs résultats est dans [validation-2026-10-09.md](validation-2026-10-09.md). Les cinq reproductions ont été exécutées dans la copie isolée ; leurs scénarios et observations sont décrits dans les constats. Leurs assertions de comportement incorrect ne sont pas ajoutées à la suite du projet. Leur limite est explicite : dépendances simulées, aucune base de production ni appel payant.

La recette restante doit exécuter les fumées existantes sur PostgreSQL jetable, le worker dans son image et les scénarios navigateur avant toute déclaration d'ouverture.

## 6. Documents et intégration

Le [chantier proposé](chantier-fonctionnel-2026-10-09.md) reprend ces constats et les restes du registre. La mise à jour de CLAUDE.md conserve intégralement les huit invariants, dont INV-6 corrigé en S.141. RF-0 ajoute des renvois au plan historique et au registre, puis corrige les formulations obsolètes de DOC-11.

**RF-0 est autorisé et préparé dans une PR documentaire.** Aucun correctif applicatif, migration ou déploiement n'est réalisé par ce lot. Les choix A-1 à A-3 et les lots suivants restent à valider ; les fusions Claude Code citées plus haut sont des travaux antérieurs conservés.

