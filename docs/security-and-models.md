# SayBack — sécurité et choix des modèles

## Fonctionnement actuel

- L’application est locale. Les réunions, médias et paramètres restent dans le dossier de données Electron.
- L’utilisateur choisit la transcription OpenAI (`whisper-1`), Gemini (`gemini-2.5-flash`) ou locale (`whisper-cli` avec un modèle GGML), et les notes OpenAI, Claude, Gemini, API compatible OpenAI ou Ollama. Ces choix sont figés pour chaque lancement d’analyse.
- Les clés des fournisseurs arrivent au processus principal par un IPC limité à la fenêtre de l’application. Elles sont chiffrées séparément avec `safeStorage`. Le renderer ne reçoit que des indicateurs de présence, jamais les clés sauvegardées. Les anciens fichiers de paramètres avec une clé OpenAI sont migrés à la lecture.
- La liste des modèles vient de l’API du fournisseur choisi ou des modèles Ollama installés. Les modèles Ollama distants sont filtrés et refusés avant d’envoyer des données, y compris si un alias local pointe vers le cloud.
- L’analyse locale requiert `ffmpeg`, `whisper-cli`, un fichier de modèle Whisper et un serveur Ollama actif. Les commandes sont lancées sans shell et ne reçoivent que des chemins et arguments validés. Une nouvelle installation démarre sur ces fournisseurs locaux ; SayBack vérifie leur présence et ouvre un guide sur GitHub s’il en manque un, mais ne télécharge aucun composant.
- L’API personnalisée doit être en HTTPS, sauf sur `localhost`. Une clé est exigée pour un service distant et facultative pour un serveur local. Son URL et son modèle sont choisis par l’utilisateur. Elle doit implémenter `/chat/completions`, accepter les images et produire le JSON des notes ; `/models` est facultatif.

## Travaux avant une distribution publique

1. **Compatibilité des modèles.** Les API listent aussi des modèles qui ne peuvent pas produire des notes ou lire des images. Filtrer ou annoter les capacités avant distribution, notamment pour OpenAI et Claude. Ollama vérifie déjà la vision lorsque la réunion contient des images. Les identifiants avec `:` sont acceptés.
2. **Gestion des secrets.** Garder toute clé fournisseur dans le processus principal. Ne jamais inclure une clé de service SayBack dans l’application distribuée, la landing ou le dépôt. Tester le chiffrement et la lecture après mise à jour d’une version signée.
3. **Données locales.** Documenter les permissions des fichiers, la suppression complète d’une réunion et les sauvegardes. Aujourd’hui, la clé est chiffrée, mais les enregistrements et la base SQLite ne le sont pas. Ne pas promettre un chiffrement intégral.
4. **Consentement et coût.** L’option d’analyse automatique est annoncée avant la capture et peut être désactivée. Le coût de transcription OpenAI affiché reste indicatif ; Claude et les modèles OpenAI de notes peuvent aussi être facturés. Avant distribution, vérifier périodiquement les tarifs, rendre l’estimation des notes plus précise et mesurer les temps réels sur des réunions longues.
5. **Validation réelle.** Les adaptateurs Claude, Gemini, API compatible et Ollama ont des tests avec réponses simulées, mais demandent encore un essai de bout en bout avec les clés et modèles de l’utilisateur. La transcription locale exige une installation réelle de `whisper-cli`, `ffmpeg` et d’un modèle GGML ; ces binaires ne sont pas inclus dans l’application.
6. **Application distribuée.** Signer et notariser la version macOS pour stabiliser l’identité de l’app auprès du Trousseau et des permissions de capture. Tester aussi l’installation et les permissions Windows.

## Si SayBack propose un jour une clé hébergée

Il faudra un service distinct avec authentification, quotas, limitation des appels, suivi des coûts et stockage des secrets côté serveur. Le client Electron ne devra recevoir ni clé maîtresse ni accès direct non borné à ce service. Ce modèle est hors du MVP local actuel.
