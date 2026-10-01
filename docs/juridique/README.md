# Brouillons juridiques — statut et règles

**Statut : brouillons de travail, non validés, non publiés.** Rédigés le 01/10/2026 (S.97) pour servir de base à la direction et au conseil juridique, conformément à l'arbitrage Q.A (`src/domain/exploitation/pages-publiques.ts`).

| Fichier | Page cible | Responsable (Q.A) | Porte |
|---|---|---|---|
| `mentions-legales.brouillon.md` | `/mentions-legales` | Direction et conseil juridique | Bloquante avant l'ouverture au public |
| `conditions.brouillon.md` | `/conditions` | Direction et conseil juridique | Bloquante avant l'ouverture au public |

`/donnees-personnelles` et `/contact` ne sont pas rédigés ici : ils dépendent de la désignation du responsable de traitement et d'une voie de recours réellement tenue.

## Ce que ces brouillons sont, et ce qu'ils ne sont pas

- **Ils décrivent le produit tel qu'il est codé.** Prix, remboursements, conservation, sous-traitants et cookies viennent du code. Chaque brouillon se termine par un tableau des sources, pour que la relecture vérifie le texte contre le produit et non contre une mémoire.
- **Ils n'inventent rien de ce que le code ne connaît pas.** Identité de l'entité, immatriculation, droit applicable, droit de rétractation, âge minimum, délai de réponse : tout cela est marqué `[À COMPLÉTER]`. Les questions qui demandent un avis sont marquées `[À TRANCHER]`.
- **Ils ne valent pas validation.** Un texte juridique faux est pire qu'une page absente (Q.A). Aucune route n'est créée tant que le texte n'est pas validé.

## Pour publier une page, une fois le texte validé

1. Créer la route sous `src/app/(public)/`, à partir du texte validé, et non du brouillon.
2. Marquer la page servie dans `PAGES_PUBLIQUES` (`servie: { le, source }`), sans effacer son responsable ni ce qui manquait. Les tests `arbitrages-ouverts` et `acceptation-sans-texte` le vérifient. Pour `/conditions`, la réserve affichée près des cases d'acceptation (inscription, récapitulatif de paiement) disparaît alors d'elle-même.
3. Remettre le lien au pied de page et au plan du site.
4. Mettre à jour la version des conditions acceptées (consentement `CGU`).
5. Faire passer `npm run check:copy`. Les pages publiées sont dans l'interface candidat : le vocabulaire interdit de `CLAUDE.md` s'y applique entièrement.

## Écarts relevés en rédigeant, à trancher avant publication

| Sujet | Ce que dit la documentation | Ce que fait le code | À trancher par |
|---|---|---|---|
| Remboursement d'un pack entamé | DOC-11 : « règle de proratisation selon les tokens déjà consommés » | Aucun prorata : une consommation partielle part en revue manuelle (`remboursement.ts`) | Direction, puis produit |
| Opérateurs Mobile Money | DOC-11 nomme MTN MoMo et Moov | Le produit n'en nomme aucun : « l'opérateur de ton numéro, quel qu'il soit » (`rail.ts`) | Produit |
| Remboursement FedaPay | — | Possible par MTN Mobile Money seulement (S.91) ; rien n'est prévu pour un paiement fait par un autre opérateur | Direction et opérations |
| Registre de langue | L'interface tutoie le candidat | Les brouillons vouvoient, comme un texte contractuel | Direction |
