![Prairie alpine sous un ciel bleu clair, parcouru d’une onde discrète](docs/assets/readme-hero.png)

<div align="center">

# SayBack

**La réunion passe. Le contexte reste.**

Une mémoire de réunion open source qui tourne sur votre ordinateur.<br>
Audio, écran et notes sur une même chronologie, analysés par des modèles locaux.

[Mode local](docs/local-setup.md) · [Installer Ollama](docs/ollama.md) · [Contribuer](#contribuer) · [Sécurité et modèles](docs/security-and-models.md)

![Licence MIT](https://img.shields.io/badge/licence-MIT-2f6f4f) ![Testé sur macOS](https://img.shields.io/badge/testé%20sur-macOS-555) ![Windows et Linux : testeurs bienvenus](https://img.shields.io/badge/Windows%20%26%20Linux-testeurs%20bienvenus-4a7fb0) ![Statut : en test](https://img.shields.io/badge/statut-en%20test-c28a2c)

</div>

## Pourquoi SayBack

Après une réunion, on se souvient de la décision, rarement de ce qui l’a justifiée. Ce qui compte était souvent à l’écran : un tableau, un schéma, une ligne de code. SayBack enregistre la conversation **et** ce qui était partagé, puis prépare un compte rendu dont chaque point renvoie au passage exact de la réunion.

Tout se passe sur votre machine. Pas de compte, pas de serveur SayBack, pas d’abonnement.

## Ce que fait l’app

- **Capturer** le microphone, une fenêtre ou un écran, et le son du système lorsque la plateforme le permet. Vous choisissez explicitement chaque source.
- **Transcrire** l’audio avec des repères temporels.
- **Résumer** : points importants, décisions, actions et questions ouvertes, en tenant compte des captures d’écran. Chaque élément cite les passages dont il vient ; les notes sans source réelle sont écartées.
- **Revenir au moment clé** : un point du compte rendu ouvre la vidéo au passage concerné.
- **Ranger et chercher** dans des dossiers ou dans toute la bibliothèque.

## Local d’abord

SayBack fonctionne entièrement hors ligne avec deux petits modèles open source. C’est le réglage par défaut d’une nouvelle installation : au premier lancement, l’app vérifie ce qui est installé et ouvre le bon guide s’il manque quelque chose.

| Étape         | En local (recommandé)                                                            | En option, avec votre propre clé                    |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Transcription | [whisper.cpp](https://github.com/ggml-org/whisper.cpp), modèle `base` ou `small` | OpenAI, Gemini                                      |
| Compte rendu  | [Ollama](https://ollama.com), modèle `gemma3:4b`                                 | OpenAI, Claude, Gemini, toute API compatible OpenAI |

En mode local, rien ne quitte l’ordinateur. Si vous choisissez un fournisseur distant, seuls les éléments nécessaires à l’analyse lui sont envoyés, avec votre clé. Les clés sont chiffrées par le système ; les enregistrements et la base locale ne sont pas chiffrés par SayBack aujourd’hui.

Les modèles ne sont pas inclus dans le dépôt. Deux guides pas à pas expliquent comment les installer :

- [Configurer le mode local](docs/local-setup.md) : whisper.cpp, ffmpeg et le réglage dans l’app.
- [Installer Ollama](docs/ollama.md) : le modèle du compte rendu et le dépannage.

## Plateformes

SayBack a été principalement testé sur **macOS** (Apple Silicon). Electron, whisper.cpp et Ollama existent aussi sur **Windows et Linux**, mais la capture d’écran, le son du système et le mode local n’y ont pas encore été vérifiés.

Vous êtes sur Windows ou Linux ? Vous êtes les bienvenus pour tester, signaler ce qui coince et proposer des corrections : c’est l’un des meilleurs moyens d’aider le projet aujourd’hui. Indiquez votre système et sa version dans l’issue.

## Démarrer

Il n’y a pas encore d’installateur publié. Pour lancer SayBack depuis les sources, il faut [Node.js](https://nodejs.org) 22 ou plus récent :

```bash
git clone https://github.com/0x2e73/sayback-app.git
cd sayback-app
npm ci
npm run dev
```

Sur macOS, accordez les autorisations **Microphone** et **Enregistrement de l’écran** quand le système les demande. Suivez la présentation jusqu’à l’étape **Mode local**, installez ce qui manque, puis faites un essai d’une minute avec du contenu non sensible. L’enregistrement fonctionne aussi sans lancer l’analyse.

Pour construire l’application :

```bash
npm run package   # application locale dans dist/
npm run dist      # installateur
```

## Sous le capot

Electron, React et TypeScript. Le processus principal gère SQLite, les fichiers de médias et les fournisseurs d’IA ; l’interface lui parle par un preload et des canaux IPC validés avec Zod.

```
src/
  main/       fenêtre, IPC, permissions de capture
  preload/    pont sécurisé entre l’interface et le processus principal
  renderer/   interface React
  backend/    règles des réunions, SQLite, médias, adaptateurs d’IA
  shared/     contrats et validation communs
```

Les adaptateurs locaux sont dans `src/backend/infrastructure/local-whisper.ts` et `ollama-notes.ts`.

## Feuille de route

Ce qui est prévu, et où l’aide est la bienvenue :

- **Installation des modèles depuis l’app** : télécharger le modèle Whisper et le modèle Ollama en un clic. La détection de ce qui manque existe déjà.
- **Mesures sur de vraies réunions** : qualité et durée d’analyse des petits modèles sur des réunions d’une heure.
- **Alerte d’enregistrement oublié** et découpage du début ou de la fin d’une réunion.
- **Identification des intervenants** dans la transcription.
- **Windows et Linux** : tester la capture et le mode local, puis corriger ce qui bloque. [Voir Plateformes](#plateformes).
- **Version signée** et installateurs dans les Releases.
- Une landing page arrive bientôt.

## Contribuer

SayBack se construit à plusieurs. Les retours issus de vraies réunions sont précieux : ce qui a été capturé, ce qui manque dans la transcription, un passage difficile à retrouver, un modèle local qui marche bien sur votre machine.

- **Bug ou idée** : ouvrez une issue avec les étapes pour reproduire, le résultat attendu, le résultat observé et votre système. **Retirez les clés API, noms, captures et transcriptions sensibles** avant de partager quoi que ce soit.
- **Pull request** : lisez [AGENTS.md](AGENTS.md) et les [règles du projet](.codex/rules/), gardez le changement ciblé, ajoutez un test quand il vérifie un comportement utile, puis lancez :

```bash
npm run check
```

Cette commande vérifie le format, les types, le lint, les tests et le build. Ne commitez jamais de clés, d’enregistrements ni de fichiers générés (`out/`, `dist/`).

## Licence

[MIT](LICENSE). Utilisez, modifiez et redistribuez librement.
