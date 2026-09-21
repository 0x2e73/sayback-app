# Configurer SayBack en mode local sur macOS

Ce guide configure **la transcription** avec Whisper et **le compte rendu** avec Ollama. Ce sont deux modèles distincts. SayBack garde les réunions sur l’ordinateur et, avec ces deux fournisseurs locaux, n’envoie pas leur contenu à une API distante. Aucun compte ni clé API n’est nécessaire.

Ce parcours est documenté et pris en charge ici sur **macOS**. Il demande [Homebrew](https://brew.sh/) et plusieurs gigaoctets libres. Les modèles et les outils ne sont pas inclus dans l’application.

## 1. Installer les outils de transcription

Dans Terminal :

```bash
brew install whisper-cpp ffmpeg
command -v whisper-cli
command -v ffmpeg
```

Les deux dernières commandes doivent afficher un chemin. Si elles ne renvoient rien, vérifiez l’installation de Homebrew avant de continuer. SayBack utilise `ffmpeg` pour préparer l’audio et `whisper-cli` pour le transcrire.

## 2. Télécharger un modèle Whisper multilingue

Le modèle `base` est un premier choix léger pour essayer le français (environ 142 Mio). Le modèle `small` est plus gros (environ 466 Mio) ; comparez les résultats sur vos réunions avant de choisir. **N’utilisez pas `base.en` ou `small.en` pour une réunion en français** : le suffixe `.en` indique un modèle anglais.

Téléchargez `ggml-base.bin` depuis la [collection officielle des modèles whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/tree/main) et gardez-le dans un dossier permanent, par exemple `~/Models/SayBack/`. Dans Finder, utilisez **⌥⌘C** sur le fichier pour copier son chemin complet. Vous le collerez dans SayBack à l’étape 4.

Si vous préférez Terminal :

```bash
mkdir -p "$HOME/Models/SayBack"
curl -fL 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' -o "$HOME/Models/SayBack/ggml-base.bin"
ls -lh "$HOME/Models/SayBack/ggml-base.bin"
```

Le fichier téléchargé doit mesurer environ 142 Mio. Ne placez pas le modèle dans `out/`, `dist/` ou un dossier temporaire : SayBack doit pouvoir retrouver le même fichier au prochain démarrage.

## 3. Installer le modèle de compte rendu

Installez Ollama et ouvrez-le ; le [tutoriel Ollama](ollama.md) détaille chaque étape et les erreurs fréquentes. Dans Terminal :

```bash
ollama pull gemma3:4b
ollama list
```

`gemma3:4b` doit apparaître dans la liste. Ce modèle accepte le texte **et les images**, nécessaires au contexte visuel du compte rendu. Son téléchargement représente environ 3,3 Go ; la vitesse d’analyse dépend de la mémoire et du processeur de votre Mac. Les variantes `gemma3:1b` et `gemma3:270m` sont textuelles et ne conviennent pas à ce parcours avec images.

## 4. Régler SayBack

Sur une nouvelle installation, SayBack démarre déjà en mode local : Whisper pour la transcription, Ollama et `gemma3:4b` pour le compte rendu. Au premier lancement, il cherche un modèle Whisper multilingue dans `~/Models/SayBack/` et `~/.whisper-models/`. La dernière étape de présentation, et la section **Mode local** des paramètres, indiquent ce qui manque et ouvrent le bon guide.

Si vous utilisiez déjà SayBack avec une API, ou si le modèle n’a pas été trouvé, ouvrez **Paramètres → Intelligence artificielle** :

1. Sous **Transcription de l’audio**, choisissez **Local · whisper.cpp**.
2. Dans **Modèle Whisper local (.bin)**, collez le chemin complet de `ggml-base.bin`. Si vous avez suivi les commandes ci-dessus, il ressemble à `/Users/votre-nom/Models/SayBack/ggml-base.bin`. Le caractère `~` ne remplace pas `/Users/votre-nom` dans ce champ.
3. Sous **Compte rendu**, choisissez **Ollama · local**.
4. Sous **Modèle pour les notes**, choisissez **gemma3:4b** dans la liste, puis enregistrez les paramètres.

Si la liste des modèles est vide, vérifiez qu’Ollama est ouvert et que `ollama list` affiche bien `gemma3:4b`.

## 5. Faire un essai court

Créez une réunion d’une minute, enregistrez votre voix et un écran, puis arrêtez l’enregistrement. Lancez l’analyse si elle ne démarre pas automatiquement pour cette réunion. Vérifiez que **Transcription** contient vos paroles et que **Compte rendu** affiche des notes. Testez d’abord avec du contenu non sensible.

Si SayBack indique que `whisper-cli` ou `ffmpeg` est absent alors que Terminal les trouve, quittez complètement l’application avec **⌘Q** et relancez-la. Si le modèle Whisper est introuvable, vérifiez le chemin complet et que le fichier `.bin` n’a pas été déplacé. Si Ollama est inaccessible, ouvrez-le de nouveau et contrôlez `ollama list`.

SayBack ne garantit pas encore le même temps de traitement ni la même qualité sur tous les Mac. Pour une réunion longue, faites d’abord un essai représentatif sur votre machine.

Sources : [modèles et tailles de whisper.cpp](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md), [formule Homebrew whisper-cpp](https://formulae.brew.sh/formula/whisper-cpp), [Gemma 3 et ses variantes avec vision](https://ollama.com/library/gemma3/tags).
