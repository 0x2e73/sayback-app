# Îlot : sélecteur d'écran, aperçu et texte en direct

Statut : proposition d'Emilien, 2026-10-15, retenue par Harvey. Prolonge `2026-10-14-notch-island-design.md` (lot 2 « Aperçu », lot 4 « Texte ») et `2026-10-15-start-recording-design.md` (« Îlot prêt »), dont elle remplace la ligne « Changer fait défiler les écrans ».

Contexte : outil utilisé en pleine réunion, souvent sans focus (Zoom le garde). Tout ce qui ralentit ou masque la réunion est un défaut.

## 1. L'îlot ne grandit pas

La coque reste à 560 × 240 pt dans tous les états (prêt, prêt + sélecteur, enregistrement, enregistrement + sélecteur). Le sélecteur **remplace** une zone de contenu :

- en prêt, il remplace la zone pastilles + ligne écran (76 pt) ;
- en enregistrement, il remplace la scène (aperçu + texte, 86 pt).

Raisons : la fenêtre (600 × 280) et le rectangle de survol sont calculés pour 560 × 240 ; un îlot qui descend recouvre davantage la réunion ; les budgets tiennent. Aucune animation de hauteur : opacité et transform seulement.

## 2. Budgets (panneau 202 pt)

Prêt (padding 8 / 16) : en-tête 32, gap 12, **zone milieu 76**, gap 12, actions 40.
Enregistrement (padding 12 / 16) : en-tête 24, gap 12, **scène 86**, gap 12, actions 40. Si la scène sort sous 86 pt avec les vrais boutons, réduire l'aperçu, pas le texte.

Tokens (styles.css, section île) :

| Token                     | Valeur |
| ------------------------- | ------ |
| `--island-picker-height`  | 76px   |
| `--island-tile-width`     | 88px   |
| `--island-tile-thumb`     | 55px   |
| `--island-preview-width`  | 138px  |
| `--island-preview-height` | 86px   |

## 3. Sélecteur (`ScreenPicker`, même composant dans les deux modes)

Schéma (largeur utile 512) : bouton retour `‹` 32 × 32 (ghost, `ChevronLeft` 16, `aria-label="Retour"`, centré sur la vignette), puis tuiles à partir de 40 pt.

Tuile : bouton de 88 pt, vignette 88 × 55 (`object-fit: cover`, rayon `--radius-sm`, bordure 1 px `--color-border`, fond `--color-surface`), libellé 12 px dessous (gap 4, une ligne, ellipse). Écran courant : anneau intérieur 2 px `--color-action` (pseudo-élément inset) **et** pastille ✓ 16 pt en haut à droite (fond `--color-action`, coche `--color-on-action`), libellé plein graisse 600. Pas d'accent pour la sélection. Survol sous `@media (hover: hover) and (pointer: fine)` : bordure `--color-border-strong`. Appui `scale(var(--motion-press-soft))`. Désactivé pendant un démarrage.

2 à 5 écrans tiennent ; 6 et plus : défilement horizontal, barre masquée, fondu de 16 pt à droite, tuile courante amenée en vue.

Un seul écran : aucun contrôle de changement. Audio seul : absent.

Emplacement du contrôle :

- prêt : la ligne écran garde sa place, bouton ghost 32 pt **« Changer d'écran »** à droite (désactivé si la pastille Écran est éteinte ou pendant un démarrage) ;
- enregistrement : ghost 32 pt, icône `Monitor` 14 + **« Changer d'écran »**, à **gauche** de la rangée d'actions (Pause et Terminer à droite). `aria-pressed` suit l'état ouvert.

Comportement :

| Événement               | Rendu                                                                        |
| ----------------------- | ---------------------------------------------------------------------------- |
| Ouvrir                  | Tuiles immédiates avec leur nom ; vignettes chargées à l'ouverture seulement |
| Choisir                 | La coche passe sur la tuile, le sélecteur reste 180 ms puis se referme       |
| Choisir l'écran courant | Ferme                                                                        |
| Fermer sans choisir     | `‹`, re-clic sur « Changer d'écran », Échap (prêt)                           |
| Repli de l'îlot         | Sélecteur réinitialisé fermé                                                 |
| Démarrage lancé (prêt)  | Sélecteur fermé                                                              |

Vignette en chargement : `--color-surface` + `skeleton-pulse`, tuile cliquable tout de suite. Vignette en erreur : icône `Monitor` 20 centrée. Aucun écran : pas de sélecteur, ligne d'erreur existante « Aucun écran détecté. » + « Réessayer » (rafraîchit la liste).

Échec du changement en enregistrement : le sélecteur se ferme, la capture continue sur l'ancien écran ; le bouton est remplacé 4 s par « ⚠ Changement impossible » (12 px, `--color-danger`, `aria-live="polite"`). L'aperçu ne montre jamais un autre écran que celui capturé.

Données :

1. L'état prêt expose `screens: { id, name }[]` au lieu d'un compte.
2. `cycle-screen` devient `select-screen { screenId }`.
3. Canal de vignettes à l'ouverture du sélecteur, 176 × 110 px, JPEG qualité 0,6, transmis en octets et affiché via URL `blob:` (la CSP `img-src 'self' blob:` bloque `data:` ; ne pas l'élargir). La liste d'ouverture simple reste sans vignettes.
4. En enregistrement, le choix passe par le chemin existant `switchSource` / `replaceDisplay` dans la page principale ; le main amorce l'activation (`executeJavaScript('void 0', true)`) comme le relais de démarrage, car `getDisplayMedia` peut l'exiger dans une page cachée. `useRecordingSource` suit un changement fait depuis l'îlot.

## 4. Scène d'enregistrement (aperçu + texte en direct)

```
│ ● Enregistrement                              12:03  │
│ ┌──────────────┐  Toi                                │
│ │   aperçu     │  On valide le budget jeudi, puis    │
│ │  138 × 86    │  Les autres                         │
│ └──────────────┘  Ça me va. Je prépare le doc…       │
│ [🖥 Changer d'écran]          ( Pause )  [ Terminer ]│
```

- Grille `grid-template-columns: var(--island-preview-width) minmax(0, 1fr)`, gap `--space-4`.
- Aperçu : 138 × 86, rayon `--radius-sm`, bordure 1 px, `object-fit: contain` sur fond noir.
- Texte : 13 px, interligne 20 (4 lignes), tours récents ancrés en bas, anciens effacés par un masque de 20 pt en haut ; libellé de piste « Toi » / « Les autres » 12 px, muet, 600.

| État                                               | Rendu                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Première image (< 1 s) ou après changement d'écran | `--color-surface` + `skeleton-pulse`, ancienne image retirée                                                                 |
| Pause                                              | Image figée à 50 % d'opacité, texte inchangé                                                                                 |
| Pas d'image                                        | Icône `Monitor` 20 centrée                                                                                                   |
| Audio seul                                         | Pas de colonne d'aperçu, le texte prend 512 pt                                                                               |
| Texte vide                                         | « En attente de parole… » (`--color-text-subtle`, 13 px)                                                                     |
| Texte désactivé (`islandLiveText` faux)            | Pas de texte ; l'aperçu prend la place disponible ou reste seul                                                              |
| Indisponible                                       | Ligne ambre « Texte en direct indisponible : aucun modèle local » ; `port-conflict` : « Texte en direct coupé par sécurité » |

Image d'aperçu à environ 1 image/s, sans fondu : `decode()` de la nouvelle image avant de remplacer la source, puis révocation de l'ancienne URL `blob:`.

## 5. Mouvement

| Élément          | Entrée                                                                                                | Sortie                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Couche sélecteur | opacity 0→1 + `translateY(var(--motion-rise))`, `--duration-base`, `--ease-out`                       | opacity, `--duration-exit`                          |
| Couche remplacée | —                                                                                                     | opacity 1→0 + `translateY(-4px)`, `--duration-exit` |
| Mise en place    | Les deux couches dans la même cellule (`grid-area: 1 / 1`), la couche masquée `inert` + `aria-hidden` |                                                     |
| Tuiles           | décalage `--delay-1..3` (3 niveaux max), opacity + rise, `--duration-base`                            | —                                                   |
| Coche            | opacity + `scale(var(--motion-scale-in))`, `--duration-fast`                                          | —                                                   |

Entrées par `@starting-style`, sorties par `[data-state='closing']`. Clavier : instantané. Mouvement réduit : les tokens `--motion-*` et `--delay-*` tombent à zéro, il reste un fondu.

## 6. Accessibilité

- Enregistrement : jamais focalisé, clics souris seulement.
- Prêt (focalisable) : `role="radiogroup"` `aria-label="Écran à enregistrer"`, tuiles `role="radio"` + `aria-checked`, flèches gauche/droite, Entrée/Espace valide. **Échap ferme d'abord le sélecteur** (`stopPropagation`), un second Échap ferme l'îlot.
- `aria-live="polite"` sur la ligne écran : « Écran HP 524pf sélectionné ».

## 7. Absent volontairement

Pas de coque qui grandit, pas de fenêtres d'application dans l'îlot (écrans seulement), pas de rafraîchissement des vignettes pendant l'ouverture, pas de fondu entre images d'aperçu, pas de sélecteur au clavier en enregistrement, pas d'accent pour la sélection.
