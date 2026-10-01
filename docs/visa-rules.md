# Vague 1 — traçabilité et enseignements

**Relevé effectué le 11 septembre 2026.**

## 1. Niveau de confiance par fiche

| Fiche | Source | Niveau | Statut | Prochaine relecture |
|---|---|---|---|---|
| NL — études | ind.nl (autorité d'immigration) | **OFFICIEL** | PUBLISHED | 01/12/2026 |
| NL — kennismigrant | ind.nl | **OFFICIEL** | PUBLISHED | 01/12/2026 |
| CH — études | vd.ch (canton de Vaud) + EPFL + art. 21 al. 3 LEI | **INSTITUTIONNEL** | PUBLISHED | 15/11/2026 |
| AE — études | icp.gov.ae, gdrfad.gov.ae, u.ae (repris le 01/10/2026, S.95) | **OFFICIEL** | **DRAFT**, publication en B-02 après relecture | 01/01/2027 |

La fiche Émirats est restée en `DRAFT` jusqu'au 01/10/2026 : le garde-fou `peutEtrePubliee()` la bloquait, et c'était le comportement attendu. Elle est reprise sur sources officielles (S.95) et reste en `DRAFT` jusqu'à sa relecture et sa publication par un opérateur en B-02.

## 2. Données confirmées

**Pays-Bas** (montants IND 2026, valables du 1er janvier au 31 décembre 2026)
- Preuve de fonds études supérieures : **1 130,77 €/mois**, soit 13 569,24 €/an, hors frais de scolarité. Enseignement secondaire/professionnel : 928,58 €/mois.
- Travail étudiant : 16 h/semaine en période de cours, temps plein en juin, juillet et août. **Un permis TWV doit être obtenu par l'employeur auprès de l'UWV** — point systématiquement oublié par les candidats.
- Zoekjaar : 12 mois, dépôt dans les 3 ans suivant le diplôme, travail sans restriction ni TWV.
- Seuils kennismigrant 2026 : 4 357 €/mois brut avant 30 ans, 5 942 € à partir de 30 ans, **3 122 € au critère réduit** (pendant le zoekjaar ou dans les 3 ans suivant le diplôme). Carte bleue UE : 5 942 €, ou 4 754 € pour un diplômé récent.
- L'employeur doit être référent reconnu (*erkend referent*) auprès de l'IND.

**Suisse**
- Travail : 15 h/semaine, mais **aucune activité pendant les 6 premiers mois** pour les ressortissants d'États tiers. Temps plein pendant les vacances.
- Après diplôme : autorisation de courte durée de **6 mois maximum, non renouvelable** (art. 21 al. 3 LEI), activité accessoire de 15 h/semaine tolérée, ressources et logement à justifier.
- Les permis délivrés aux diplômés d'États tiers restent **soumis aux quotas fédéraux annuels**.
- La procédure est cantonale, pas fédérale.

## 3. Corrections apportées au benchmark VisaBridge

| Donnée VisaBridge | Réalité 2026 |
|---|---|
| Pays-Bas, preuve de fonds « ~1 200 €/mois » | **1 130,77 €/mois** (montant IND officiel) |
| Pays-Bas, « Highly Skilled Migrant ~3 672 €/mois (<30 ans) » | **4 357 €/mois** — écart de 685 € |
| Pays-Bas, « ~5 670 €/mois (>30 ans) » | **5 942 €/mois** |
| Pays-Bas, travail étudiant « 16 h/semaine » | Exact, mais le TWV employeur était omis |
| Suisse, « travail après 6 mois, 15 h/semaine » | Exact |
| Suisse, « 6 mois pour chercher un emploi » | Exact, mais non renouvelable et sous quota — omis |
| Émirats, « salaire minimum ~4 000 AED/mois » | Ce chiffre est le **seuil de parrainage familial**, pas un salaire minimum. Confusion à ne pas reproduire |

Trois erreurs sur sept points vérifiés, dont deux sur des seuils salariaux avec un écart supérieur à 15 %. C'est la justification empirique de la règle « aucune fiche en base sans vérification à la source ».

## 4. Ce que la vague 1 a appris sur le schéma

**Ce qui fonctionne.** La grille d'attributs constante tient sur trois régimes très différents (procédure centralisée aux Pays-Bas, cantonale en Suisse, parrainée aux Émirats). Le champ `conditions[]` avec `bloquant: true/false` alimente directement les deux étages du moteur : filtrage strict puis pondération.

**Trois ajouts imposés par les données réelles :**

1. `delai_carence_mois` — la règle suisse des 6 mois sans travail n'entrait dans aucun champ prévu. Ce n'est pas un cas isolé : plusieurs pays imposent un délai avant l'ouverture du droit au travail.
2. `permis_employeur_requis` — le TWV néerlandais, le permis MOHRE émirien et la demande accessoire suisse sont trois formes de la même contrainte : **le droit au travail n'appartient pas à l'étudiant mais à l'employeur**. C'est une des principales sources de désillusion des candidats, et ça mérite d'être affiché explicitement.
3. `reserves[]` — ce que la plateforme n'affirme pas. Alimente un disclaimer contextuel par fiche, au lieu d'un disclaimer générique en pied de page. C'est la traduction produit de la contrainte juridique déjà documentée.

**Un ajout sur la traçabilité :** `sourceTier` + `nextReviewAt`. Ces deux champs transforment la veille réglementaire d'une intention en **file de travail requêtable** :

```sql
SELECT country_code, visa_type, source_tier, next_review_at
FROM "VisaRule"
WHERE status IN ('PUBLISHED','DRAFT') AND next_review_at <= CURRENT_DATE + 30
ORDER BY next_review_at;
```

C'est le cœur opérationnel du projet. Une fiche non relue à l'échéance doit repasser en `DRAFT` automatiquement plutôt que de rester affichée comme fiable.

## 5. Reste à faire

1. ~~**Émirats** : reprendre la fiche sur icp.gov.ae, gdrfa.ae et u.ae avant publication.~~ Fait le 01/10/2026 (S.95). Reste : relecture et publication en B-02, et la légalisation des diplômes béninois, qu'aucune source relevée ne décrit.
2. **Suisse** : les montants de preuve de fonds varient d'un canton à l'autre. Décider si on modélise par canton ou si on affiche une fourchette assortie d'une réserve.
3. **Frais de scolarité** : les fourchettes saisies sont indicatives, jamais vérifiées établissement par établissement. À marquer comme tel dans l'interface.
4. **Job cron** : basculer automatiquement en `DRAFT` toute fiche dont `nextReviewAt` est dépassée.
5. **Rattachement** : relier `Application.visaRuleId` pour figer la version au moment de la création du dossier.
