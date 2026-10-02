# Textes juridiques — statut et règles

**Statut : brouillons de travail, non validés, non publiés.** Rédigés le 01/10/2026 (S.97) pour servir de base à la direction et au conseil juridique, conformément à l'arbitrage Q.A (`src/domain/exploitation/pages-publiques.ts`). Depuis le 02/10/2026 (S.101), ils vivent comme **modèles à variables** dans `src/domain/juridique/modeles.ts`, et se publient depuis le back-office, écran **Textes juridiques** (`/textes-juridiques`).

| Fichier de travail | Page | Responsable (Q.A) | Porte |
|---|---|---|---|
| `mentions-legales.brouillon.md` | `/mentions-legales` | Direction et conseil juridique | Bloquante avant l'ouverture au public |
| `conditions.brouillon.md` | `/conditions` | Direction et conseil juridique | Bloquante avant l'ouverture au public |
| `donnees-personnelles.brouillon.md` | `/donnees-personnelles` | Responsable conformité et conseil juridique | Bloquante avant l'ouverture au public |
| — (modèle seulement) | `/contact` | Direction et opérations | Bloquante avant l'ouverture au public |

`/contact` ne porte que des coordonnées : adresse électronique, téléphone facultatif, horaires, adresse postale et délai de réponse. Il ne se publie que si cette voie est réellement tenue. `/donnees-personnelles` ne peut être validée qu'une fois le responsable de traitement désigné.

## Ce que ces brouillons sont, et ce qu'ils ne sont pas

- **Ils décrivent le produit tel qu'il est codé.** Prix, remboursements, conservation, sous-traitants et cookies viennent du code. Chaque brouillon se termine par un tableau des sources, pour que la relecture vérifie le texte contre le produit et non contre une mémoire.
- **Ils n'inventent rien de ce que le code ne connaît pas.** Identité de l'entité, immatriculation, droit applicable, droit de rétractation, âge minimum, délai de réponse : tout cela est marqué `[À COMPLÉTER]`. Les questions qui demandent un avis sont marquées `[À TRANCHER]`.
- **Ils ne valent pas validation.** Un texte juridique faux est pire qu'une page absente (Q.A). Une page répond 404 tant qu'aucune version n'est validée au back-office.

## Pour publier une page

Plus aucune route ni aucun drapeau n'est à poser à la main : les quatre routes existent et répondent 404 tant qu'aucune version n'est validée.

1. **Renseigner les variables** dans `/textes-juridiques` : identité de l'éditeur, hébergement, coordonnées, données personnelles, clauses des conditions. Chaque champ est vérifié à la saisie (format, longueur, vocabulaire interdit au rendu). La grille des prix et l'annulation d'une consultation viennent du produit et ne se saisissent pas.
2. **Faire relire l'aperçu** par le conseil juridique. L'aperçu est le texte exact qui sera servi.
3. **Valider et publier** : l'administrateur nomme le relecteur, la date de la relecture, un motif, et atteste que le texte relu est celui de l'aperçu. La validation est refusée tant qu'une variable obligatoire est vide ou qu'une formulation interdite subsiste. Elle crée une version numérotée, immuable, journalisée (`juridique.validation`).
4. **Modifier une variable ensuite** republie aussitôt chaque texte déjà validé qui l'emploie, en nouvelle version qui reprend le relecteur et nomme les variables changées (`juridique.publication`). Un texte jamais validé n'est pas publié par une variable.
5. **Modifier le texte d'un modèle** (dans le code, en revue) change son empreinte : la page passe « à revalider », continue de servir sa dernière version, et n'est plus republiée par les variables tant qu'une nouvelle validation nommée n'est pas faite.

Le lien au pied de page, le plan du site, la réserve près des cases d'acceptation et la version des conditions enregistrée au consentement `CGU` (par exemple `conditions v3 · donnees-personnelles v2`) suivent d'eux-mêmes les versions publiées.

**Ce que l'outil ne fait pas.** Il ne remplace pas la relecture : il la trace. Les valeurs saisies restent sous la responsabilité de la direction ; aucune n'est proposée par défaut.

## Écarts relevés en rédigeant, à trancher avant publication

| Sujet | Ce que dit la documentation | Ce que fait le code | À trancher par |
|---|---|---|---|
| Remboursement d'un pack entamé | DOC-11 : « règle de proratisation selon les tokens déjà consommés » | Aucun prorata : une consommation partielle part en revue manuelle (`remboursement.ts`) | Direction, puis produit |
| Opérateurs Mobile Money | DOC-11 nomme MTN MoMo et Moov | Le produit n'en nomme aucun : « l'opérateur de ton numéro, quel qu'il soit » (`rail.ts`) | Produit |
| Remboursement FedaPay | — | Possible par MTN Mobile Money seulement (S.91) ; rien n'est prévu pour un paiement fait par un autre opérateur | Direction et opérations |
| Consentements sans effet | `pieces_financieres` et `mesure_audience` sont proposés au candidat | Ils ne commandent rien ; aucune mesure d'audience n'existe | Produit, puis conformité |
| Registre de langue | L'interface tutoie le candidat | Les brouillons vouvoient, comme un texte contractuel | Direction |
