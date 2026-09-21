# Installer Ollama pour SayBack sur macOS

Ollama fait tourner sur votre Mac le modèle qui rédige le **compte rendu** : résumé, décisions, actions et repères dans la réunion. Avec Ollama, la transcription et les captures d’écran ne quittent pas l’ordinateur pour cette étape. Aucun compte Ollama n’est nécessaire.

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

SayBack envoie au modèle la transcription **et des captures d’écran**. Le modèle doit donc savoir lire les images. Le choix proposé est `gemma3:4b` (environ 3,3 Go) :

```bash
ollama pull gemma3:4b
ollama list
```

`gemma3:4b` doit apparaître dans la liste. Le téléchargement n’a lieu qu’une fois ; les modèles sont rangés dans `~/.ollama`.

N’utilisez pas `gemma3:1b` ni `gemma3:270m` : ces variantes ne lisent pas les images. Les modèles dont le nom finit par `:cloud` tournent sur les serveurs d’Ollama ; SayBack les refuse pour garder l’analyse sur votre Mac.

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

## En cas de problème

| Message ou symptôme                        | Que faire                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| La liste des modèles est vide dans SayBack | Ouvrez Ollama (icône dans la barre des menus) ou lancez `brew services start ollama`, puis vérifiez `ollama list`.                             |
| « Ollama est inaccessible »                | `curl http://127.0.0.1:11434/api/version` doit répondre. SayBack contacte uniquement cette adresse locale, sur le port par défaut 11434.       |
| « Ce modèle Ollama utilise le cloud »      | Choisissez un modèle sans le suffixe `:cloud`, par exemple `gemma3:4b`.                                                                        |
| « Modèle Ollama introuvable »              | Téléchargez-le avec `ollama pull gemma3:4b`, puis réessayez.                                                                                   |
| « Ce modèle Ollama ne lit pas les images » | Choisissez un modèle avec vision, comme `gemma3:4b`.                                                                                           |
| « Réponse Ollama incomplète »              | Relancez l’analyse. Si l’erreur revient, le modèle n’a pas produit de notes exploitables : essayez un modèle plus gros si votre Mac le permet. |
| L’analyse est très lente ou le Mac rame    | Fermez les applications gourmandes pendant l’analyse. Sur 8 Go de mémoire, préférez des réunions courtes pour commencer.                       |

Les journaux d’Ollama se trouvent dans `~/.ollama/logs/server.log`.

## Libérer de la place

```bash
ollama rm gemma3:4b
```

Pour désinstaller complètement Ollama, suivez [la procédure officielle](https://docs.ollama.com/macos#uninstall).

Sources : [Ollama sur macOS](https://docs.ollama.com/macos), [variantes de Gemma 3](https://ollama.com/library/gemma3/tags).
