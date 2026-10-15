# Démarrer un enregistrement : dialogue « Nouvelle réunion » et îlot « prêt »

Statut : décidé le 2026-10-15, conçu par Emilien. Retours du propriétaire : le dialogue actuel est « vraiment naze » ; cliquer sur le fantôme doit démarrer depuis l'îlot, sans ouvrir l'app (« c'est tout le but »). Lève, pour l'îlot, le sacrifice « pas de démarrage depuis l'îlot » de `2026-10-14-notch-island-design.md`.

Arbitrages : libellé « Son du système » partout (nom du panneau macOS) ; la limite de 2 heures sera rappelée sur l'écran d'enregistrement (lot 7), pas dans le dialogue.

Légende : [vu] lu dans le code, [S] supposé.

## 0. Écarts constatés

| #   | Constat                                                                                                                                  | Conséquence                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | `NewMeetingDialog` garde le code d'avant la refonte : cases natives, `.auto-analysis-option`, bouton dans le corps [vu]                  | On finit la refonte du dialogue                                          |
| 2   | `Switch`, `Skeleton`, `SearchField` n'existent pas dans `components/` [vu]                                                               | À créer ; squelettes et recherche s'extraient de la liste (second usage) |
| 3   | `--duration-exit`, `--delay-*`, `--motion-*` n'existent pas (lot motion non livré) [vu]                                                  | Tokens existants maintenant, ceux du lot motion à son arrivée            |
| 4   | Seul `--control-xs` (24 px) existe [vu]                                                                                                  | Ajouter `--control-sm` (32 px)                                           |
| 5   | `.dialog` défile en entier, `padding: 26px` en dur [vu]                                                                                  | `Dialog` restructuré : en-tête et pied fixes, seul le corps défile       |
| 6   | `.island` redéfinit `--color-accent` mais `--color-accent-tint` / `-soft` sont des `color-mix` de `:root` qui ne se recalculent pas [vu] | Les redéclarer dans `.island`                                            |

## 1. Le dialogue en une seconde

But : lancer une réunion micro + son du système en un geste, sans rien décider.

| Décision         | Proposition                                                                          | Raison                                                                      |
| ---------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Visible d'emblée | Titre, 3 pastilles, une ligne « Écran 1 » avec « Changer », l'interrupteur d'analyse | Tout ce qu'il faut, ≈ 360 px, sans défilement                               |
| Replié           | Liste des écrans et fenêtres, derrière « Changer »                                   | Utile seulement si on ne partage pas l'écran par défaut                     |
| Supprimé         | Phrase d'accroche, « Choisir ce qui sera visible », légendes sur les fichiers locaux | N'aident à aucune décision                                                  |
| Mémorisé         | Les trois pastilles, l'analyse, le dernier écran s'il existe encore                  | Un habitué ne change rien                                                   |
| Jamais mémorisé  | Titre, fenêtre choisie, erreurs                                                      | Une fenêtre change d'identifiant : la rejouer capturerait la mauvaise chose |
| Où               | Dans le main, store `capture-prefs` validé par Zod, lu par IPC                       | Partagé avec l'îlot (autre fenêtre)                                         |
| Écriture         | Au démarrage réussi seulement                                                        | Fermer sans démarrer ne change pas les habitudes                            |

Forme : `{ microphone, systemAudio, screen, autoAnalyze, screenId? }`. Défauts : tout activé, analyse activée, écran principal.

Module pur partagé `src/shared/capture-selection.ts` : `defaultMeetingTitle(date)`, `normalizeSelection()` (invariants de la section 3), choix de l'écran par défaut (mémorisé s'il existe, sinon principal ; le code actuel prend le premier de la liste).

## 2. Schémas

### 2a. État par défaut (540 px de large, ≈ 360 px de haut)

```
┌──────────────────────────────────────────────────────┐
│ Nouvelle réunion                                  ×  │ en-tête fixe
├──────────────────────────────────────────────────────┤
│ Titre                                                │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Réunion du 15 octobre, 11 h 00                   │ │ texte sélectionné
│ └──────────────────────────────────────────────────┘ │
│ Sources                                              │
│ ( 🎙 Microphone ) ( 🔊 Son du système ) ( 🖥 Écran )  │ pastilles 32 px
│ ┌──────────────────────────────────────────────────┐ │
│ │ ┌─────┐ Écran 1                         Changer ▾│ │ ligne 56 px
│ │ └─────┘ Illustre vos notes                       │ │
│ └──────────────────────────────────────────────────┘ │
│ [●━] Lancer l'analyse à l'arrêt                      │ Switch
│      Toute l'analyse reste sur cet ordinateur.       │
├──────────────────────────────────────────────────────┤
│                 Annuler   [ Démarrer l'enregistrement ]│ pied fixe
└──────────────────────────────────────────────────────┘
```

### 2b. « Changer » déplié

La liste vient sous la ligne ; seul le corps défile. Écrans en tuiles 16:10 (min 140 px) avec coche ; « Fenêtres » en lignes de 40 px (vignette 48×30, nom sur une ligne avec ellipse), région plafonnée à 240 px qui défile seule ; champ « Rechercher une fenêtre » dès 8 fenêtres.

### 2c. Variantes

- Écran désactivé : « Son du système » s'éteint aussi ; la ligne source devient « Sans écran, les notes n'auront pas d'image. »
- Aucune source audio : « Démarrer » grisé, avertissement ambre « Activez le microphone ou le son du système. »
- Autorisation d'écran refusée : `Notice` « SayBack n'a pas l'autorisation d'enregistrer l'écran. » avec « Ouvrir les réglages macOS » et « Continuer sans écran ».

## 3. Sources

Trois `Chip` à bascule (`aria-pressed`) dans un `role="group"` « Sources ».

| État           | Rendu                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Actif          | Fond `--color-accent-tint`, bordure `--color-accent-soft`, icône `--color-accent`, texte `--color-text`             |
| Inactif        | Transparent, bordure `--color-border`, texte `--color-text-muted`, icône barrée (`MicOff`, `VolumeX`, `MonitorOff`) |
| Survol / appui | `background-color` `--duration-fast` ; appui `scale(.97)`                                                           |
| Taille         | `--control-sm` (32 px), padding `--space-3`, icône 16 px, rayon pilule                                              |

Règle écran ↔ son système [vu `capture-resources.ts`, `capture-permissions.ts`] : le son système n'existe qu'attaché à la capture d'écran.

| Geste                                   | Résultat                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Désactiver « Écran »                    | « Son du système » s'éteint, ligne source remplacée par « Sans écran, les notes n'auront pas d'image. » |
| Activer « Son du système » écran éteint | « Écran » se rallume                                                                                    |
| Aucun audio                             | « Démarrer » grisé, « Activez le microphone ou le son du système. »                                     |

Permissions : IPC `capture:permission` → `'granted' | 'denied' | 'not-determined'` via `systemPreferences.getMediaAccessStatus('screen' | 'microphone')`, lu à l'ouverture (remplace le test fragile `form.error.includes('Réglages Système')`). Écran refusé : `Notice` danger avec « Ouvrir les réglages macOS » (réutilise `openScreenRecordingSettings`) et « Continuer sans écran ». Micro refusé : pastille éteinte, `Notice` ambre « Le microphone est bloqué dans les réglages macOS. » + « Ouvrir les réglages ». Refus au démarrage : `Notice` en haut du corps, le formulaire redevient actif.

## 4. Choix de ce qui est capturé

`SourcePicker` unique, repris par `RecordingSourceDialog` (déplié en permanence). La fenêtre de SayBack (principale et îlot) est absente de la liste, filtrée dans le main par `getMediaSourceId()` [S]. Après le choix, la ligne de résumé prend vignette et nom et la liste se replie. Filtrage instantané, « Aucune fenêtre pour « … » ».

Clavier : Tab entre sur la source sélectionnée ; flèches déplacent (radios natifs `capture-source`) ; Début / Fin ; Entrée, Espace ou clic valident et replient (focus sur « Changer ») ; Échap replie d'abord, un second ferme.

## 5. Titre

Pré-rempli « Réunion du 15 octobre, 11 h 00 », texte sélectionné au focus (focus initial). Plus obligatoire : vidé → le titre par défaut est réutilisé. Format `defaultMeetingTitle(date)` : jour numérique, mois en lettres, heure sans zéro de tête, `h`, minutes sur 2 chiffres (« Réunion du 5 mars, 9 h 05 »). Calculé à l'ouverture. `maxLength={160}`.

## 6. Analyse à l'arrêt

Configurée : `Switch` « Lancer l'analyse à l'arrêt », légende d'une ligne `analysisDestination(settings)`. Non configurée : pas d'interrupteur, légende « Analyse non configurée. L'enregistrement reste local. » et lien « Configurer » (ferme le dialogue, ouvre les réglages). `analysisCostNote` sort du dialogue.

## 7. États

| État                   | Rendu                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Chargement des sources | Squelette dans la ligne source ; « Démarrer » grisé tant que `sourceId` est vide                |
| Aucune source          | « Aucun écran ni fenêtre détectés. » + « Actualiser » ; « Continuer sans écran » reste possible |
| Erreur de liste        | `Notice` danger + « Réessayer »                                                                 |
| Démarrage en cours     | `Button busy`, `<fieldset disabled>` sur le formulaire, fermeture bloquée                       |

## 8. Motion et clavier

Entrée du dialogue : `state-enter` existant. Dépliage de « Changer » : contenu `opacity` + `translateY(4px)`, `--duration-base`, chevron `rotate(180deg)` `--duration-fast`, instantané au clavier ; repli instantané. Sélection d'une vignette : couleurs `--duration-fast`. Mouvement réduit : fondus.

Entrée dans le titre démarre (`<button form="new-meeting">` dans le pied) ; Cmd+Entrée démarre partout ; Échap replie puis ferme (bloqué pendant le démarrage) ; Tab : titre → pastilles → ligne source → interrupteur → Annuler → Démarrer.

## 9. Tokens et composants

Tokens ajoutés : `--control-sm` 32 px, `--source-tile-min` 140 px, `--source-row-height` 40 px, `--source-thumb-width` 48 px, `--source-list-max` 240 px.

| Composant                                                                              | Statut                                                                           |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Chip`                                                                                 | Étendu : `size="md"` 32 px, icône en enfant, état actif accent-tint              |
| `Dialog`                                                                               | Étendu : corps qui défile, en-tête et pied hors du défilement, padding en tokens |
| `Switch`, `Skeleton`, `SearchField`                                                    | Créés (les deux derniers extraits de la liste)                                   |
| `SourcePicker`                                                                         | Créé, remplace `SourceGroup` et `CaptureSources`                                 |
| `use-capture-prefs.ts` + store main `capture-prefs` (IPC `capture-prefs:get/set`, Zod) | Créés                                                                            |
| `src/shared/capture-selection.ts`                                                      | Créé                                                                             |

## 10. Retiré

Paragraphe d'accroche et placeholder « Ex. Revue produit du vendredi » ; `SourceToggle` et ses cases natives (`.source-toggle(s)`) ; « Choisir ce qui sera visible », `.capture-source-picker`, `.capture-source-heading` ; lignes de 60 px (`.capture-source-row`) ; `.auto-analysis-option` et `analysisCostNote` ; légendes « Pendant la réunion… 2 heures » ; `required` du titre, `title.trim()` de `canStart`, icône `Circle` du bouton ; test `form.error.includes('Réglages Système')` ; `padding: 26px` de `Dialog`.

# Îlot « prêt »

But : clic sur le fantôme → l'îlot descend de l'encoche, ouvert, prêt à démarrer en un clic, sans ouvrir l'app ni prendre le focus. La capture démarre dans le renderer de la fenêtre principale, gardée cachée (créée cachée si elle est fermée) ; la manière exacte dépend de la sonde « capture sans fenêtre visible » (geste utilisateur pour `getDisplayMedia`).

## Schéma (560 × 240 pt)

```
   ┌── barre de 38 pt : vide, l'encoche passe ici ──┐
┌──┘                                                └──┐
│  Réunion du 15 octobre, 11 h 00                    ×  │ 15/600, non éditable
│  ( 🎙 Microphone ) ( 🔊 Son du système ) ( 🖥 Écran )   │ pastilles 32 px
│  Écran 1                                   Changer    │ « Changer » si ≥ 2 écrans
│  Ouvrir SayBack                      [   Démarrer   ] │
└───────────────────────────────────────────────────────┘
Erreur : la ligne « Écran 1 » est remplacée, même hauteur
│  ⚠ Autorisation d'écran refusée.   Ouvrir les réglages │
│  ⚠ Activez le microphone ou le son du système.         │
│  ⚠ Aucun écran détecté.                       Réessayer │
```

## Décisions

| Sujet                   | Proposition                                                                                              | Raison                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Titre                   | Affiché, non éditable dans l'îlot ; « Ouvrir SayBack » ouvre le dialogue pour le changer                 | L'îlot n'est pas focalisable : taper volerait le focus à Zoom ou Meet |
| Écran                   | Mémorisé sinon principal ; « Changer » fait défiler les écrans (pas les fenêtres)                        | L'îlot est petit                                                      |
| Analyse                 | Valeur mémorisée, pas de contrôle                                                                        | —                                                                     |
| Libellés                | Mêmes sources que le dialogue ; « Démarrer » dans l'îlot, « Démarrer l'enregistrement » dans le dialogue | Cohérence                                                             |
| Pastilles               | Même `Chip`, même `normalizeSelection()` ; tints d'accent redéclarés dans `.island`                      | Une seule règle                                                       |
| « Ouvrir SayBack »      | Bouton fantôme, ouvre le dialogue avec les mêmes valeurs                                                 | Titre éditable et fenêtres                                            |
| Déclencheur             | Clic simple sur l'icône ; le menu passe au clic droit (« Nouvelle réunion… » ouvre le dialogue)          | `setContextMenu` consomme aujourd'hui le clic [vu]                    |
| Enregistrement en cours | Le clic ouvre l'îlot d'enregistrement existant                                                           | Un seul îlot                                                          |

## Ouverture, fermeture

| Événement            | Comportement                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ouverture            | Fenêtre à la demande, `showInactive()`, coque compacte puis `data-expanded` à l'image suivante (`width`, `height`, `border-radius`, `--duration-island`, `--ease-island`), contenu en fondu |
| Fermer               | `×`, ou second clic sur le fantôme                                                                                                                                                          |
| Souris sortie        | Fermeture 3 s après la sortie du rectangle ouvert (valeur paramétrable dans `island-hover`)                                                                                                 |
| Curseur jamais entré | Fermeture après 15 s                                                                                                                                                                        |
| Erreur affichée      | Pas de fermeture automatique avant 30 s                                                                                                                                                     |
| Échap, clic ailleurs | Non disponibles (fenêtre non focalisable)                                                                                                                                                   |
| Fermeture            | Contenu en fondu, coque qui se replie, fenêtre masquée au `transitionend` (filet 400 ms) ; mouvement réduit : fondu                                                                         |
| Réouverture          | État neuf : titre recalculé, pastilles relues de la mémoire                                                                                                                                 |

## Du « prêt » à l'enregistrement

| Étape        | Rendu                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Démarrer » | Bouton `busy`, pastilles désactivées, minuteur de fermeture suspendu ; `island:request` de type `start` validé par Zod (titre ≤ 160, `screenId` `screen:…`) |
| Transmission | Le main relaie au renderer principal, qui exécute le même démarrage que le dialogue ; la fenêtre principale existe (cachée au besoin) et n'est pas montrée  |
| Succès       | `recording:state` → enregistrement ; fondu croisé du contenu vers l'état d'enregistrement existant ; repli en ailes quand le curseur s'éloigne              |
| Échec        | `island:start-result` ; erreur dans la ligne ; l'îlot reste « prêt »                                                                                        |

Erreurs : « Autorisation d'écran refusée. » (+ « Ouvrir les réglages »), « Activez le microphone ou le son du système. », « Aucun écran détecté. » (+ « Réessayer »).

Clavier et accessibilité : l'état « prêt » n'est pas focalisable en v1 ; le chemin clavier complet reste « Nouvelle réunion… » (dialogue). Rendre la fenêtre focalisable seulement en « prêt » est une piste à tester avec le propriétaire (Zoom perdrait sa fenêtre clé).

## Travail côté main

1. Îlot créé à la demande avec `mode: 'ready' | 'recording'` dans l'instantané de `island:ready`.
2. `island:request` : `start`, `close`, `open-privacy-settings`, `cycle-screen` ; événement `island:start-result`.
3. Store `capture-prefs` et IPC `capture-prefs:get/set` (partagé avec le dialogue).
4. IPC `capture:permission`.
5. Filtrage des fenêtres de SayBack dans `capture:sources`.
6. `tray.on('click')` et menu au clic droit.
7. Fenêtre principale existante (cachée) pour porter la capture.

## Lots

1. **Dialogue** : `capture-selection`, store et IPC `capture-prefs`, `capture:permission`, filtrage des fenêtres de SayBack, `Dialog` restructuré, `Chip` étendu, `Switch`, `Skeleton`, `SearchField`, `SourcePicker`, `NewMeetingDialog` et `RecordingSourceDialog` refaits, `--control-sm` et tokens de liste.
2. **Îlot « prêt »** : après la sonde « capture sans fenêtre visible » ; réutilise tout le lot 1.
