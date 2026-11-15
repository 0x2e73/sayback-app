# Installer Ollama pour SayBack sur macOS

Ollama fait tourner sur votre Mac le modèle qui rédige le **compte rendu** : résumé, décisions, actions et repères dans la réunion. Avec Ollama, la transcription ne quitte pas l’ordinateur pour cette étape. Aucun compte Ollama n’est nécessaire.

Ce guide couvre uniquement le compte rendu. Pour la transcription, suivez [le guide du mode local](local-setup.md), étapes 1 et 2.

## Avant de commencer

- macOS Sonoma (14) ou plus récent.
- Un Mac Apple Silicon (M1 ou plus récent) est recommandé. Sur un Mac Intel, Ollama n’utilise que le processeur et l’analyse est nettement plus lente.
- Environ **4 Go libres** pour l’application et le modèle `gemma3:4b`.
- 8 Go de mémoire au minimum ; 16 Go rendent l’analyse plus confortable.

## 1. Installer l’application Ollama

1. Téléchargez Ollama pour macOS sur [ollama.com/download](https://ollama.com/download).
2. Ouvrez le fichier `Ollama.dmg` et faites glisser **Ollama** dans le dossier **Applications**.
3. Ouvrez **Ollama** depuis Applications. Au premier lancement, acceptez la création du lien vers la commande `ollama` : c’est ce qui la rend disponible dans Terminal.
4. Une icône de lama apparaît dans la barre des menus. Tant qu’elle est là, Ollama est prêt à répondre à SayBack.

Vérifiez dans Terminal :

```bash
ollama --version
curl http://127.0.0.1:11434/api/version
```

La première commande affiche un numéro de version. La seconde renvoie une ligne du type `{"version":"…"}`. Si elle échoue avec « Connection refused », Ollama n’est pas ouvert : relancez l’application.

### Variante : installation avec Homebrew

Si vous préférez Homebrew, la formule installe la commande mais **ne démarre pas le serveur** tout seul :

```bash
brew install ollama
brew services start ollama
```

`brew services start` lance Ollama maintenant et à chaque ouverture de session. Sans cette étape, SayBack indiquera qu’Ollama est inaccessible, même si `ollama` existe dans Terminal. Pour un essai ponctuel, `ollama serve` dans une fenêtre Terminal laissée ouverte suffit.

## 2. Télécharger le modèle de compte rendu

Avec Ollama, le compte rendu est fait **à partir du texte seul** : SayBack n’envoie pas les captures d’écran, car sur un petit modèle local à fenêtre de 4096 jetons elles prennent près de la moitié de la place et font inventer des décisions. Les autres fournisseurs les reçoivent toujours. Le choix proposé est `gemma3:4b` (environ 3,3 Go) :

```bash
ollama pull gemma3:4b
ollama list
```

`gemma3:4b` doit apparaître dans la liste. Le téléchargement n’a lieu qu’une fois ; les modèles sont rangés dans `~/.ollama`.

Les modèles dont le nom finit par `:cloud` ou `-cloud` tournent sur les serveurs d’Ollama ; SayBack les refuse pour garder l’analyse sur votre Mac.

Pour un essai rapide hors de SayBack :

```bash
ollama run gemma3:4b "Résume en une phrase : la réunion a validé le budget."
```

La première réponse peut prendre quelques secondes, le temps de charger le modèle en mémoire.

## 3. Choisir Ollama dans SayBack

1. Gardez Ollama ouvert.
2. Dans SayBack, ouvrez **Paramètres → Intelligence artificielle**.
3. Sous **Compte rendu**, choisissez **Ollama · local**.
4. Sous **Modèle pour les notes**, choisissez **gemma3:4b**, puis enregistrez.

Faites un essai d’une minute avec du contenu non sensible, puis vérifiez que l’onglet **Compte rendu** se remplit.

Une longue réunion est lue en plusieurs parties, puis les notes de chaque partie sont fusionnées : l’analyse prend alors plusieurs minutes, mais le modèle n’a jamais besoin de plus de mémoire qu’une réunion courte.

Ce que vous retrouvez dans le compte rendu d’une longue réunion :

- **Décisions et actions** : toutes celles relevées dans chaque partie, dans l’ordre de la réunion, sans reformulation par la fusion. Les doublons sont regroupés et chaque liste est limitée à 30 éléments.
- **Résumé, points clés et questions** : condensés par la fusion (6 points clés et 4 questions au plus), car un petit modèle ne peut pas tenir toute une réunion en mémoire.

## En cas de problème

| Message ou symptôme                                                   | Que faire                                                                                                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La liste des modèles est vide dans SayBack                            | Ouvrez Ollama (icône dans la barre des menus) ou lancez `brew services start ollama`, puis vérifiez `ollama list`.                                                                           |
| « Ollama est inaccessible »                                           | `curl http://127.0.0.1:11434/api/version` doit répondre. SayBack contacte uniquement cette adresse locale, sur le port par défaut 11434.                                                     |
| « Ce modèle Ollama utilise le cloud »                                 | Choisissez un modèle sans le suffixe `:cloud` ni `-cloud`, par exemple `gemma3:4b`.                                                                                                          |
| « Modèle Ollama introuvable »                                         | Téléchargez-le avec `ollama pull gemma3:4b`, puis réessayez.                                                                                                                                 |
| « Ollama a coupé sa réponse » ou « notes illisibles »                 | Relancez l’analyse. Si l’erreur revient, le modèle n’a pas produit de notes exploitables : essayez un modèle plus gros si votre Mac le permet.                                               |
| « Ollama a mis trop de temps à répondre »                             | Une longue réunion est lue en plusieurs parties : fermez les applications gourmandes, puis relancez l’analyse.                                                                               |
| « Ollama a refusé la demande (code …) »                               | Vérifiez que le modèle choisi est bien installé (`ollama list`), puis relancez l’analyse.                                                                                                    |
| « Ollama a renvoyé une réponse vide » ou « illisible »                | Relancez l’analyse. Si l’erreur revient, essayez un autre modèle.                                                                                                                            |
| « Cette partie de la réunion est trop dense »                         | Le texte (beaucoup de chiffres, une autre langue) dépasse la fenêtre de 4096 jetons d’Ollama. Relancer suffit rarement : choisissez un fournisseur à plus grande capacité dans les réglages. |
| « Les notes ne citent aucune source réelle »                          | Le modèle n’a rattaché ses notes à aucun passage : relancez l’analyse.                                                                                                                       |
| « Cette réunion est trop longue pour une analyse locale avec Ollama » | Tous les modèles Ollama ont la même fenêtre de 4096 jetons : choisissez un fournisseur à plus grande capacité dans les réglages.                                                             |
| L’analyse est très lente ou le Mac rame                               | Fermez les applications gourmandes pendant l’analyse. Sur 8 Go de mémoire, préférez des réunions courtes pour commencer.                                                                     |

Les journaux d’Ollama se trouvent dans `~/.ollama/logs/server.log`.

## Libérer de la place

```bash
ollama rm gemma3:4b
```

Pour désinstaller complètement Ollama, suivez [la procédure officielle](https://docs.ollama.com/macos#uninstall).

Sources : [Ollama sur macOS](https://docs.ollama.com/macos), [variantes de Gemma 3](https://ollama.com/library/gemma3/tags).
