# Îlot live sous l'encoche, version directe

Statut : décidé le 2026-10-14, conçu par Marc. Addendum à `2026-10-13-menubar-live-panel-design.md` : pour cette phase, il remplace les sections « Capture host window » et « Tray and panel ». La segmentation, le moteur et les règles du live de cette spec restent valables sauf mention contraire.

Demande du propriétaire : quand un enregistrement démarre, une pastille apparaît sous l'encoche ; au survol elle s'agrandit et montre l'aperçu de l'écran capturé, la transcription en direct « Toi » / « Les autres », Pause et Terminer. Comme l'app Boring Notch.

Légende : [V] vérifié dans le code ou sur la machine, [S] supposé sur Electron ou whisper.cpp.

## Principes

1. **Version directe** : la capture reste dans le renderer de la fenêtre principale (`CaptureSession`). Le live se branche dessus. Le déménagement dans une fenêtre de capture invisible reste la cible ; rien ici ne le rend plus difficile.
2. Le live est local, éphémère (rien gardé après l'arrêt), n'appelle jamais un fournisseur distant, et aucune panne du live n'arrête ni ne retarde l'enregistrement (testé).
3. La version définitive reste produite à l'arrêt par le pipeline existant.
4. L'îlot ne parle qu'au main.

## Faits qui cadrent

- [V] Les deux flux (écran avec son système, micro) sont séparés avant le mixage à 48 kHz ; un `AnalyserNode` existe.
- [V] `RecordingView` garde son propre `paused` local : une pause venue de l'îlot laisserait le libellé faux.
- [V] `capture-session.ts` est à 237 lignes utiles sur 250 : extraire avant d'ajouter.
- [V] `recording:state` = `{ recording:false } | { recording:true, elapsed, paused }`. Dettes : pas d'état « en cours d'arrêt », horloge `Date.now`, pas de remise à zéro sur `render-process-gone`.
- [V] `createIpcRegistrar` n'accepte qu'une fenêtre ; les permissions de capture ne sont accordées qu'à la fenêtre principale (voulu).
- [V] Electron 44 n'expose ni zone sûre ni encoche.
- [V] `whisper-server` : `--request-path` existe ; langue par défaut `en` (passer `-l auto`) ; port par défaut 8080.
- [V] `whisperModelPath` est vide et `findWhisperModel` prend le premier fichier trié : le live tournera sur `ggml-base.bin` ; P3 dira s'il faut préférer turbo-q5.
- [V] L'essai a prouvé la position à `y = 0` (barre de 39 pt). Ni survol, ni clic, ni plein écran.

## 1. Architecture

### 1.1 Prise audio

- `LiveAudioTap`, classe sans React : son propre `AudioContext({ sampleRate: 16000 })`, un AudioWorklet par piste (« Toi » = micro, « Les autres » = son système), blocs Int16 de 200 ms envoyés au main par `ipcRenderer.send`.
- Les pistes arrivent par un rappel `CaptureOptions.onAudioTracks({ microphone?, system? })`, appelé à l'ouverture et après `replaceDisplay`.
- En pause, rien n'est envoyé ; l'horloge du live est le nombre d'échantillons reçus.
- Tout dans un `try/catch` : un échec du worklet ne touche ni le mixage ni l'enregistrement (testé).
- Fenêtre principale réduite ou masquée : permissions inchangées. Le main appelle `webContents.setBackgroundThrottling(false)` pendant l'enregistrement et lance `powerSaveBlocker.start('prevent-app-suspension')`, puis rétablit à l'arrêt.
- Écarté : prise dans un hook React ; second `MediaRecorder` ; `backgroundThrottling: false` permanent.

### 1.2 Segmentation et moteur

Gardés de la spec : découpe par énoncé pure (20 ms, ouverture après 60 ms de parole avec 200 ms avant, fermeture après 600 ms de silence, plafond 15 s coupé au creux d'énergie des 3 dernières secondes, rejet sous 300 ms) ; redécodage de l'énoncé ouvert toutes les 2 s ; un `whisper-server` gardé chaud pour les deux pistes (127.0.0.1, port libre, `--request-path /<jeton>`, `-l auto`), WAV en mémoire, file (définitifs d'abord, un partiel en attente par piste), deux redémarrages par session puis « indisponible », fichier PID pour l'orphelin, SIGTERM puis SIGKILL après 1 s. Modèle : `whisperModelPath`, sinon `findWhisperModel`.

Simplifié : dédoublonnage d'écho reporté (P3) ; pas de « Réessayer » sur l'îlot ; VAD intégrée de whisper écartée (modèle Silero absent).

Cycle de vie : démarrage → serveur lancé ; pause → énoncé clos, serveur chaud ; arrêt demandé → serveur tué tout de suite (libère la machine pour une transcription finale locale) ; quit → tué.

### 1.3 Fenêtre de l'îlot

- `island-window.ts`, macOS seulement, créée au passage à « enregistrement », détruite à l'arrêt.
- Options : `frame:false`, `transparent:true`, `hasShadow:false`, `type:'panel'`, `focusable:false`, `acceptFirstMouse:true`, non redimensionnable / déplaçable / réductible / agrandissable / plein écran, `skipTaskbar`, `hiddenInMissionControl`, `enableLargerThanScreen`, `show:false` ; `webPreferences` sandbox, contextIsolation, pas de Node, `backgroundThrottling:false`, preload `island.cjs` ; puis `setAlwaysOnTop(true,'screen-saver')`, `setVisibleOnAllWorkspaces(true,{ visibleOnFullScreen:true, skipTransformProcessType:true })`, `setContentProtection(true)` (texte absent des partages et de la vidéo stockée [S]) ; affichage par `showInactive()` quand l'îlot signale qu'il est prêt.
- Taille fixe à celle de l'îlot ouvert (≈ 600×280 pt) ; seule la coque CSS grandit.
- Position, fonction pure `island-geometry.ts` : écran interne s'il a une encoche, sinon écran principal ; recalcul sur `display-added`, `display-removed`, `display-metrics-changed`.
- Détection de l'encoche : `notch-probe.ts` lance `osascript -l JavaScript` (AppKit) et lit `NSScreen.screens` (`auxiliaryTopLeftArea`, `auxiliaryTopRightArea`, `safeAreaInsets.top`, `frame`), sortie validée par Zod, en cache, relue au changement d'écran.
- Dispositions : encoche connue → forme compacte en haut à `y = bounds.y` (voir la question de forme) ; sans encoche → pastille centrée en haut à la hauteur de la barre ; sonde en échec sur un écran interne à barre ≥ 32 pt → pastille sous la barre (`y = workArea.y`).
- Souris : le main lit `screen.getCursorScreenPoint()` toutes les 50 ms pendant que l'îlot est visible ; `island-hover.ts` ouvre après 120 ms dans le rectangle compact et referme après 300 ms hors du rectangle ouvert ; `setIgnoreMouseEvents(false)` ouvert, `true` fermé ; envoie `island:expanded`. Hors de la pastille, tout est traversant. Repli : survol par événements DOM avec `forward:true`.
- Animation : la coque anime `width`, `height`, `border-radius` ; le contenu est posé à sa taille finale et révélé par le débordement masqué puis un fondu. Mouvement réduit : fondu seul. Sortie : décidée par la passe de motion.
- Un seul îlot ; aucun îlot hors macOS (l'icône de barre de menus suffit).

### 1.4 Données et commandes

- `recording:state` gagne `stopping: boolean`. `recording-state-hub.ts` (main) garde le dernier état et son heure de réception en horloge monotone (`performance.now()`), le diffuse à la barre de menus, à l'îlot, au live et au réglage d'énergie, et repasse à l'arrêt sur `render-process-gone` ou `destroyed` de la fenêtre principale. `elapsedAt(state, receivedAt, now)` pur et partagé ; l'îlot fait avancer son chrono seul.
- Niveau : `RecordingFeed` (renderer, sans React) lit l'analyseur existant toutes les 100 ms et envoie `live:level` ; barres de l'îlot en `scaleY` par refs.
- Aperçu : extraire la capture d'image de `snapshot()` dans `frame-grabber.ts`, ajouter `CaptureSession.previewFrame(400)` ; `RecordingFeed` envoie un JPEG de 400 px, qualité 0,6, une fois par seconde (`live:preview`) ; le main garde la dernière image et ne relaie que si l'îlot est ouvert.
- Texte : segments `{ id: "<piste>-<n>", track, text, start, end, final, revision }` ; le main garde les 30 derniers définitifs pour un rechargement de l'îlot, vidés à l'arrêt ; `live-turns.ts` (pur) regroupe en tours.
- Commandes : l'îlot envoie `island:request` (`pause | resume | stop | open`) ; `open` réutilise l'action « Ouvrir SayBack » ; `pause`, `resume`, `stop` passent par `recording:request` main → renderer, qui remplace `menu-bar:stop-recording` (idempotent côté renderer) ; `RecordingView` s'abonne à `onPauseChange`.

### 1.5 IPC, preload, page, sécurité

- `window-roles.ts` associe `main` et `island` à leurs `webContents`. `handle(channel, action, roles = ['main'])` pour `invoke` ; nouveau `listen(channel, action, roles)` pour `send`, même contrôle d'expéditeur, entrée invalide jetée sans erreur.

| Sens             | Canal                                                                                                | Type   | Charge validée                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| principal → main | `recording:state`                                                                                    | invoke | existant + `stopping`                                                                                           |
| principal → main | `live:level`                                                                                         | send   | nombre fini 0 à 1                                                                                               |
| principal → main | `live:preview`                                                                                       | send   | `Uint8Array` ≤ 256 Ko, en-tête `FF D8 FF`, ≤ 2/s                                                                |
| principal → main | `live:pcm`                                                                                           | send   | `{ track: 'microphone' \| 'system', samples: Int16Array 1 à 16 000 }`, rejet au-delà de 2× le temps réel cumulé |
| main → principal | `recording:request`                                                                                  | event  | `'pause' \| 'resume' \| 'stop'`, vérifié à la main dans le preload                                              |
| îlot → main      | `island:ready`                                                                                       | invoke | renvoie l'instantané (état, disponibilité du live, derniers segments, disposition)                              |
| îlot → main      | `island:request`                                                                                     | invoke | `pause \| resume \| stop \| open`                                                                               |
| main → îlot      | `island:state`, `island:expanded`, `island:level`, `island:preview`, `island:live`, `island:segment` | event  | contrôle léger dans le preload                                                                                  |

- L'îlot ne peut appeler que `island:ready` et `island:request` ; la fenêtre principale ne peut pas appeler `island:*`.
- Preload `src/preload/island.ts` → `out/preload/island.cjs`, imports d'`electron` et de types seulement.
- electron-vite : preload `input { index, island }`, `entryFileNames: '[name].cjs'` ; renderer `input { index: index.html, island: island.html }` ; URL de dev ignorée une fois empaqueté.
- Page React (réutilise `Button`, tokens, `LevelMeter`). `island.css` force `background: transparent` sur `html` et `body`. L'îlot est noir quel que soit le thème (`--color-island`) : exception écrite dans `frontend.md`.
- CSP de l'îlot : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self' ws://localhost:*; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`.
- `will-navigate` bloqué, `setWindowOpenHandler` refuse, aucune permission média. Le worklet est chargé par une URL d'asset séparée, jamais intégré en `data:`.

### 1.6 Sans modèle, sans binaire, plantage

- État du live indépendant : `off | starting | ready | unavailable(no-model | no-binary | engine-failed)`, jamais bloquant pour `recording:state`.
- Le PCM continue d'arriver ; le main le jette si le live est indisponible.
- L'îlot ouvert affiche une ligne ambre « Texte en direct indisponible : aucun modèle local » (ou binaire, ou moteur). Le compact ne change pas.

## 2. Fichiers

| Fichier                                                                                  | Couche         | Rôle                                                                      |
| ---------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| `src/shared/recording-state.ts` (modifié)                                                | shared         | `stopping`, `elapsedAt()`, schéma `RecordingRequest`                      |
| `src/shared/island.ts`                                                                   | shared         | Schémas niveau, aperçu, PCM, segment, disponibilité, demandes, instantané |
| `src/shared/contracts.ts` (modifié)                                                      | shared         | `sendLevel`, `sendPreview`, `sendPcm`, `onRecordingRequest` ; `IslandApi` |
| `src/backend/application/ports.ts` (modifié)                                             | application    | Port `LiveEngine`                                                         |
| `src/backend/application/live-segmenter.ts`                                              | application    | Découpe par énoncé, pure                                                  |
| `src/backend/application/live-decode-queue.ts`                                           | application    | File : définitifs d'abord, un partiel par piste                           |
| `src/backend/application/live-transcription.ts`                                          | application    | Service live                                                              |
| `src/backend/infrastructure/whisper-server.ts`                                           | infrastructure | Lancement, port, jeton, santé, arrêt, redémarrages, PID                   |
| `src/backend/infrastructure/whisper-server-client.ts`                                    | infrastructure | WAV en mémoire, POST, réponse validée                                     |
| `src/main/window-roles.ts`                                                               | main           | Rôles par `webContents`                                                   |
| `src/main/ipc.ts` (modifié)                                                              | main           | `handle` par rôle, `listen`                                               |
| `src/main/recording-state-hub.ts`                                                        | main           | Dernier état, horloge monotone, abonnés, remise à zéro                    |
| `src/main/recording-power.ts`                                                            | main           | Freinage et `powerSaveBlocker`                                            |
| `src/main/island-geometry.ts`                                                            | main           | Écran et rectangles, pur                                                  |
| `src/main/notch-probe.ts`                                                                | main           | Encoche par JXA, validée, en cache                                        |
| `src/main/island-hover.ts`                                                               | main           | Curseur et machine à états d'ouverture                                    |
| `src/main/island-window.ts`                                                              | main           | Création, options, affichage, destruction, repositionnement               |
| `src/main/island-handlers.ts`                                                            | main           | Canaux `island:*` et `live:*`, relais                                     |
| `src/main/live-services.ts`                                                              | main           | Service live et `whisper-server` au rythme de l'état                      |
| `src/main/menu-bar.ts`, `menu-bar-actions.ts` (modifiés)                                 | main           | Abonnés au concentrateur, `elapsedAt`, `recording:request`                |
| `src/main/index.ts` (modifié)                                                            | main           | Composition                                                               |
| `src/preload/island.ts`, `src/preload/index.ts` (modifié)                                | preload        | Une API par fenêtre                                                       |
| `electron.vite.config.ts` (modifié)                                                      | config         | Deux pages, deux preloads, worklet hors bundle                            |
| `src/renderer/island.html`, `island/*`                                                   | renderer       | Page de l'îlot                                                            |
| `src/renderer/features/live/live-turns.ts`, `LiveTranscript.tsx`, `LiveTurn.tsx`         | renderer       | Tours                                                                     |
| `src/renderer/components/LevelMeter.tsx`                                                 | renderer       | Îlot et `RecordingView`, remplace la forme d'onde actuelle                |
| `src/renderer/styles/island.css`, `styles.css` (modifié)                                 | renderer       | Îlot ; `--color-island` et mouvement de l'îlot                            |
| `features/recording/recording-feed.ts`                                                   | renderer       | Niveau 10 Hz, aperçu 1 image/s                                            |
| `features/recording/live-audio-tap.ts`, `pcm-worklet.ts`                                 | renderer       | Prise 16 kHz par piste                                                    |
| `features/recording/frame-grabber.ts`                                                    | renderer       | Extrait de `snapshot()`                                                   |
| `features/recording/capture-session.ts`, `capture-resources.ts` (modifiés)               | renderer       | `frame-grabber`, `previewFrame()`, `onAudioTracks`                        |
| `features/recording/use-recording.ts`, `RecordingView.tsx`, `use-menu-bar.ts` (modifiés) | renderer       | Flux, `stopping`, demandes de l'îlot, libellé de pause suivi              |
| `.codex/rules/frontend.md`, `docs/security-and-models.md`, `docs/local-setup.md`         | docs           | Exception de l'îlot, serveur local                                        |

`capture-permissions.ts` ne change pas.

## 3. Lots

1. **L'îlot visible** : rôles et registrar, deux entrées de build, concentrateur avec `stopping`, freinage et énergie, sonde d'encoche, géométrie, survol, page compacte et ouverte sans aperçu ni texte, `recording:request`, `RecordingView` qui suit la pause. `check` prouve la matrice des rôles, la géométrie (1800×1169 avec encoche, 2560×1440 externe, barre masquée, sonde en échec), le survol avec fausse horloge, `elapsedAt` figé en pause, `stopping`, la remise à zéro, le niveau à 10 Hz, l'îlot en jsdom, la présence de `island.cjs` et `island.html`. À l'œil : pastille dans l'encoche, chrono, barres qui réagissent à la voix, ouverture au survol, Pause partout, Terminer, clics traversants, plein écran, écran externe, fenêtre réduite.
2. **Aperçu** : `frame-grabber`, `previewFrame`, `live:preview`. À l'œil : aperçu chaque seconde, suit un changement d'écran, absent sans écran.
3. **Moteur live seul** : superviseur, client, PID, disponibilité dans l'îlot. À l'œil : un seul `whisper-server` pendant la session, aucun après ; modèle renommé → « indisponible », l'enregistrement continue.
4. **Texte live** : worklet, prise, `live:pcm`, segmenteur, file, tours. À l'œil : « Toi » en moins de 3 s, une vidéo lue sur le Mac en « Les autres », pause, fichiers stockés identiques.
5. **Finitions** : écho si P3 le montre, docs, règle frontend, publication par le canal de mise à jour.

## 4. Prototypes

| #   | Bloque                            | Ce qu'il tranche                                                                                                                                                                                                                                                                                       | Qui          |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| PC  | Lot 1                             | Le JXA renvoie-t-il les zones auxiliaires et `safeAreaInsets` de l'écran interne, en combien de temps, et comment les relier aux `Display` d'Electron (origine en bas à gauche)                                                                                                                        | Agent        |
| PA  | Lot 1 (freinage), lot 4 (worklet) | Contexte 16 kHz sur une piste 48 kHz (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, `mute-audio`), fidélité ±1 % sur 3 min ; minuterie à 10 Hz fenêtre réduite, masquée, cachée, avec et sans `setBackgroundThrottling(false)` ; `addModule` sous la CSP en dev et empaqueté | Agent, muet  |
| PB  | Lot 3                             | Vrai `whisper-server` : jeton sur `/inference`, `/load`, `/health` ; réponse JSON ; `language` par requête ; deux requêtes ; mémoire base et turbo-q5 ; SIGTERM ; collision de port. Voix par `say -o`, sans lecture                                                                                   | Agent, muet  |
| PD  | Validation lot 1                  | Survol et premier clic sur Pause pendant que Zoom ou Meet a le focus ; plein écran ; îlot absent de la vidéo stockée et d'un partage d'écran ; écran externe, capot fermé                                                                                                                              | Propriétaire |
| P3  | Fin du lot 4                      | Réunion réelle à deux voix : délai, base contre turbo-q5, langues, texte inventé sur le silence, écho                                                                                                                                                                                                  | Propriétaire |

## 5. Risques et sacrifices

Risques : `setContentProtection` ignoré par ScreenCaptureKit [S] (texte live dans les partages) ; premier clic sur un panneau non focusable [S] ; sonde d'encoche dépendante d'`osascript` (repli sous la barre) ; live sur le modèle base ; charge processeur sur 2 h ; écho sans casque ; rééchantillonnage d'une source de flux à 16 kHz [S] ; macOS 27 et Electron 44 plus récents que l'expérience de l'architecte.

Sacrifié par rapport à la spec complète : la vérité de la session reste dans React (un plantage du renderer principal perd la fin de l'enregistrement, comme aujourd'hui) ; fermer la fenêtre principale reste refusé pendant un enregistrement ; pas de démarrage depuis l'îlot ni d'îlot au repos ; pas de garde « Arrêter et quitter » ni de verrou d'instance unique ; pas d'accès clavier ni VoiceOver à l'îlot (les commandes restent dans la fenêtre et le menu) ; pas d'îlot sous Windows et Linux.

## Question au propriétaire

Forme compacte : ailes de part et d'autre de l'encoche (comme Boring Notch, choix par défaut) ou pastille qui pend sous l'encoche. Un seul paramètre dans la géométrie.

## Prototype PC, fait le 2026-10-15

`osascript -l JavaScript` avec `ObjC.import('AppKit')` répond en 0,13 s. Sur la machine du propriétaire :

- « Écran Retina intégré » : `frame` 1800×1169 à (0, 0), `visibleFrame` y 62, `safeAreaInsets.top` 38, `auxiliaryTopLeftArea` (0, 1131, 790×38), `auxiliaryTopRightArea` (1010, 1131, 790×38). Encoche = 1010 − 790 = 220 pt de large, 38 pt de haut, centrée (x 790 à 1010).
- « HP 524pf » : `frame` 1920×1080 à (−61, 1169), `safeAreaInsets.top` 0, zones auxiliaires vides → sans encoche.
- Origine AppKit en bas à gauche : y d'AppKit = hauteur de l'écran principal − (y d'Electron + hauteur). Le script de sonde est dans le dépôt de travail de la session ; l'implémentation le réécrit dans `notch-probe.ts` avec ces valeurs comme cas de test.

Forme retenue (le propriétaire a cité Boring Notch) : ailes de part et d'autre de l'encoche.
