# Lisibilité obligatoire

- Respecter les conventions TypeScript et React du dépôt : types explicites aux frontières, noms descriptifs, fonctions courtes et modules à responsabilité unique.
- Préférer les fonctions pures et les dépendances injectées pour la logique réutilisable. Extraire un helper ou un composant partagé lorsqu'un besoin réel se répète ; éviter les abstractions spéculatives et les duplications divergentes.
- Toute entrée externe (IPC, fichiers, réponses fournisseur) est validée avant usage. Les erreurs destinées à l'utilisateur sont précises et n'exposent ni secret ni donnée sensible.
- Ne pas ajouter de dépendance ou de couche d'architecture sans expliquer le besoin concret qu'elle résout.
- Écrire le code directement formaté. Aucun JSX, objet métier ou gestionnaire compressé sur une seule ligne.
- Un module a une responsabilité explicite. Les pages composent des composants ; elles ne contiennent ni export de fichiers, ni orchestration réseau, ni traitement des médias.
- Un composant React est déclaré au niveau du module, jamais à l’intérieur d’un autre composant.
- Sortir les opérations asynchrones dans des hooks de fonctionnalité. Les composants de présentation reçoivent des données et des callbacks typés.
- Garder les états au plus près de leur propriétaire. Ne pas dupliquer un état calculable à partir des props.
- Utiliser des retours anticipés et des composants nommés. Aucun ternaire imbriqué.
- Séparer fonctions pures de transformation, effets navigateur et appels API.
- Nommer les types de props non triviaux. Ne pas mettre des opérations asynchrones complètes dans les attributs JSX.
- Limites de garde-fou : 250 lignes utiles par fichier, 80 par fonction, complexité cyclomatique 12. Les tests sont exemptés des limites de taille des fonctions, pas de la lisibilité.
- Une limite dépassée exige un découpage par responsabilité ; ne pas compacter le code, désactiver la règle ou inventer une abstraction pour contourner le contrôle.
- Les commentaires ne compensent pas des noms flous ou une fonction trop longue. Expliquer uniquement les contraintes non évidentes.
- Avant livraison : formatage, lint, types, tests, build et lecture critique des fichiers modifiés. Un test vert ne prouve pas la qualité de l’architecture.
- Pour une contribution, décrire le comportement modifié, les vérifications exécutées et les limites non testées. Refuser les changements qui masquent un échec par un cast, un `eslint-disable` ou un test sans assertion utile.
