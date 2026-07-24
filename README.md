# bryton460-webapp

Outil HTML pour générer les fichiers natifs du GPS **Bryton 460** à partir d'un fichier GPX.
Conçu pour les utilisateurs PC sans l'appli Bryton officielle (Nokia, PC only, etc.).

**Unofficial tool — not affiliated with Bryton.**
File formats obtained by reverse engineering for interoperability purposes.
Licensed under the [MIT License](LICENSE).

**→ Demo : [dev.agriscope.fr/bryton.html](https://dev.agriscope.fr/bryton.html)**

![Screenshot](proto_html/screenshot.png)

---

## Développement

### Prérequis

- Node.js ≥ 18

### Installer l'environnement

```bash
npm install
```

### Lancer les tests

```bash
npm test
```

40 tests unitaires couvrant les encodeurs binaires et les fonctions géo.

### Builder pour la distribution

```bash
npm run build
```

Produit `dist/index.html` — fichier unique auto-suffisant (CSS + JS inlinés par `vite-plugin-singlefile`).
Il n'y a **que ce fichier** à déployer sur un serveur web statique.

### Développement local avec rechargement automatique

```bash
npm run dev
```

Ouvre `http://localhost:5173` avec hot reload.

---

## Utilisation

1. Ouvrir `dist/index.html` (ou la démo en ligne) dans Chrome ou Edge
2. Glisser un fichier `.gpx`
3. Télécharger le `.zip` → dézipper dans `Tracks\` sur le Bryton (USB mass storage)

---

## Format généré

| Fichier | Contenu |
|---|---|
| `<nom>.smy` | Résumé : bbox, nb points, distance, D+ |
| `<nom>.tinfo` | Marqueurs début/fin de chaque montée |
| `<nom>.track` | Trace : lat, lon, altitude, pente par point |
| `<nom>/dupli.track` | Copie de la trace (requis par le firmware) |
| `<nom>/list.junc` + `list2.junc` | Intersections / virages |
| `<nom>/<nom>.climb` | Données des montées (distance, longueur, D+, %) |
| `<nom>/sort1.path` | Index de segments géographiques |

---

## Release notes

### Non publié (depuis v0.7)

- **Génération du sens inverse** — nouvelle case à cocher qui génère, en plus du fichier
  normal, un second jeu complet (`<nom>_reverse.*`) à partir de la trace retournée. Pente,
  D+/D-, virages OSRM, jonctions et montées sont tous recalculés depuis zéro sur la trace
  inversée (pas un simple flip d'octets). Contournement pratique en cas de demi-tour forcé
  (chemin fermé, etc.) — voir la piste en cours d'investigation sur le suivi du device après
  un demi-tour dans `CLAUDE.md`.

### v0.7 — 2026-07-24

- **Garde-fou sur les virages mal matchés par OSRM** — sur les tronçons hors réseau routable
  (chemins/pistes), OSRM (profil driving) peut renvoyer un match sur la route bitumée la plus
  proche plutôt que sur le vrai chemin — mesuré jusqu'à 926m d'écart sur une trace gravel
  réelle. `matchRoute()` rejette maintenant les virages matchés à plus de 50m du point réel le
  plus proche (le `.track` étant densifié à 30m max, un bon match est forcément tout proche).
  ~1/3 des virages rejetés sur la trace de test — du bruit réel en moins.
- **Version affichée dans l'UI lue depuis `package.json`** — n'est plus écrite en dur dans
  `index.html` (source de désynchronisation trouvée en marge de cette session : la version
  affichée était restée bloquée sur "v0.4" pendant plusieurs mises à jour).

### v0.6 — 2026-07-21

- **Fix "rue fantôme" dans l'échantillonnage OSRM** — `matchRoute()` n'envoyait un point à
  OSRM que tous les 200m ; dans un lotissement (rues courtes et rapprochées), OSRM pouvait
  reconstituer un chemin plausible mais faux à travers une rue voisine (reproduit
  concrètement). Corrigé en ajoutant les points où la trace GPS change vraiment de direction
  comme repères supplémentaires. Overpass (intersections OSM réelles) et une classification
  des virages par géométrie GPS pure ont été explorées comme alternatives et abandonnées
  (service indisponible / peu fiable dans les carrefours denses).

- **Fix trous de points >30m dans le `.track`** — certains GPX exportés depuis un
  planificateur d'itinéraire (Komoot confirmé) ne stockent que les points de forme de la
  route et laissent des trous de plusieurs centaines de mètres sur les lignes droites, même
  sans simplification côté outil. Le device semble comparer la position GPS au point du
  `.track` le plus proche : un trou trop large peut déclencher un faux "hors itinéraire" en
  étant pourtant exactement sur le tracé. Comblé par interpolation linéaire (`densify`,
  écart max 30m), appliquée après une éventuelle simplification RDP/uniforme.

### v0.5 — 2026-07-13

- **Fiabilité récupération élévation SRTM** — L'API publique Open-Elevation échouait
  silencieusement sur certains batchs (rate-limit/timeout), laissant des sections entières
  du profil altimétrique à 0m plat dans le `.track` généré (jusqu'à ~50% d'une trace observée).
  Ajout de retries avec backoff exponentiel + délai entre requêtes ; les points restants sans
  élévation sont comblés avec la dernière altitude connue (constante) plutôt qu'un 0m, avec
  avertissement affiché à l'utilisateur. Hypothèse forte observée sur le terrain : ces trous
  à 0m provoquaient de fausses alertes "hors itinéraire" sur le device (qui semble comparer
  la position GPS en 3D — lat/lon + altitude — aux points du `.track`).

- **Table des codes de direction complète** — Reverse-engineering de `voiceTrip.tinfo`
  (fichier généré par l'appli officielle Bryton) croisé avec les annotations OSRM sur la même trace.
  Table confirmée : `0x02` tout droit · `0x03` léger gauche · `0x04` léger droite ·
  `0x0D` gauche · `0x0E` droite · `0x06` serré gauche (−135°) · `0x05` serré droite (+135°) ·
  `0x07` demi-tour · `0xD2/D3/D4` rond-point sortie 1/2/3+.
  Corrections : `slight right` passait au même code que `slight left` (tous deux 0x03) ;
  `sharp left` passait au même code que `sharp right` (tous deux 0x05).

- **Bifurcation / fin de route** — Les types OSRM `fork` et `end of road` utilisent maintenant
  le modifier de direction (léger droite, gauche, etc.) au lieu d'un code fixe incorrect.

### v0.4 — 2026-07-02

- **Navigation turn-by-turn via OSRM** — Nouvelle option dans l'UI : la trace GPX est
  soumise au service [OSRM](https://project-osrm.org/) (map matching) pour récupérer
  les instructions de virage réelles depuis le réseau routier OSM.
  Génère un `.tinfo` format B avec nom de rue UTF-8, code de direction et distance
  au prochain virage — lisible par le firmware Bryton comme une route planifiée à la main.
  Instructions supportées : départ, arrivée, tout droit, léger virage, droite, gauche,
  virage serré, demi-tour, bifurcation, rond-point (sorties 1/2/3+).
  Les sections hors réseau routier (pistes cyclables, chemins côtiers) sont ignorées
  silencieusement — les autres virages restent valides.
  L'UI affiche la ventilation : `✓ 17 virages — ↻ droite 6  ↺ gauche 2  → tout droit 1`.

- **`.tinfo` format B reverse-engineered** — Analysé sur deux fichiers de référence
  (`voiceTrip`, `test_route`) : structure hybride nav + montées dans le même format 44 octets.
  Le fichier généré respecte l'ordre exact : DÉPART (0x01), INFO rue départ (0xFA),
  virages, INFO distance totale (0xFA), ARRIVÉE (0x21), marqueurs montées (0xBE/0xBF).

- **Refactoring v0.3** — Architecture modules ES (src/), Vite build, Vitest (40 tests),
  `vite-plugin-singlefile` → `dist/index.html` auto-suffisant (~134 KB).

- **`sort1.path` validé** — Segments par tuile OSM zoom 13, chevauchement d'1 point.
  Validé sur 100K : 41 segments, tx ∈ [4182,4185], ty ∈ [2982,2990].

- **`list.junc` via Overpass API** — Intersections OSM réelles (rayon 25m),
  fallback détection par changement d'angle ≥ 25° si Overpass indisponible.

### v0.3 — 2026-06-29

Architecture de développement restructurée en modules ES (src/) avec Vite + Vitest.
(Voir v0.4 pour les features associées livrées dans cette version.)

### v0.2 — 2026-06-25

- **`.track` byte 10 : pente locale** — Chaque point encode maintenant la pente en % (int8 signé),
  calculée sur une fenêtre glissante de 200m. Validé contre les fichiers officiels Bryton : écart ≤ 1%.
- **`.smy` : D- = 0** — L'appli officielle Bryton ne remplit pas le champ D−. Conformité corrigée.
- **Détection des montées** — Remplacement du lissage médian (par nombre de points) par une moyenne
  glissante distance-based (200m). Le médian créait des paliers artificiels qui faisaient rater les
  départs de montée. Nouveaux seuils : longueur ≥ 500m, D+ ≥ 25m, pente ≥ 2.2%, score = grade × D+.

### v0.1 — 2026-06-25

- Version proto initiale : page HTML autonome, conversion GPX → zip Bryton 460
- Génération des 8 fichiers du format natif : `.smy`, `.tinfo`, `.track`, `dupli.track`,
  `list.junc`, `list2.junc`, `.climb`, `sort1.path`
- Simplification RDP / uniforme optionnelle
- Fetch élévation SRTM via Open-Elevation API si le GPX n'a pas d'altitude
- Transfert direct USB via File System Access API (Chrome/Edge)

---

## Format binaire détaillé

Tous les entiers sont **Little Endian** (octet de poids faible en premier).

### `.smy` — 68 octets fixes

Résumé de la route, lu en premier par le Bryton pour afficher la liste des itinéraires.

```
Offset  Taille  Type       Contenu
00      2       uint16     version = 1
02      2       uint16     nb_points
04      4       int32      lat_max × 1 000 000
08      4       int32      lat_min × 1 000 000
12      4       int32      lon_max × 1 000 000
16      4       int32      lon_min × 1 000 000
20      4       int32      distance totale (m)
24      4       int32      inconnu (variable : 1 638 732 sur 100K, 2 490 581 sur une autre
                           trace officielle — pas une constante ; hypothèse ID téléphone/appli
                           vs checksum contenu, pas encore distinguable — voir CLAUDE.md)
28      32      —          zéros
60      4       int32      D+ (m)
64      4       int32      D− = toujours 0 (l'appli officielle ne remplit pas ce champ)
```

Exemple réel (100K officiel) :
```
01 00  54 3C  30 D2 9D 02  54 AD 99 02  11 C9 3B 00  A1 0E 3A 00
       ↑      ↑            ↑            ↑            ↑
    15444   43.775°N     43.626°N     3.885°E      3.806°E

5E 82 01 00  4C 01 19 00  00…(32 zéros)…00  87 04 00 00  00 00 00 00
↑            ↑                               ↑            ↑
98910m      inconnu                        D+=1159m     D-=0
```

---

### `.track` — N × 16 octets

Un enregistrement par point GPS. Fichier principal — toute la trace y est.

```
Offset  Taille  Type    Contenu
00      4       int32   lat × 1 000 000
04      4       int32   lon × 1 000 000
08      2       uint16  altitude (m)
10      1       int8    pente locale (%) — moyenne glissante sur 200m
11      5       —       zéros
```

Exemple réel (points 0 et 4 du 100K) :
```
pt0  54 AD 99 02  9D 95 3B 00  1F 00  FF  00 00 00 00 00
     ↑            ↑            ↑      ↑
  43.626°N     3.906°E       31m    -1%

pt4  96 AD 99 02  98 95 3B 00  1F 00  FF  00 00 00 00 00
     ↑
  43.626°N (+4m Nord vs pt0)
```

`FF` en int8 signé = -1. Pentes : `00`=0%, `0A`=+10%, `F6`=-10%, `7F`=+127% max.

---

### `.tinfo` — N × 88 octets (N paires par montée)

Index des montées. Stocké en paires : un record "début" + un record "fin" par montée.
Chaque record fait 44 octets — seuls les 4 premiers octets comptent, le reste est à zéro.

```
Offset  Taille  Type    Contenu
00      4       uint32  (0x00BE << 16) | ptIdx  → début de montée
                        (0x00BF << 16) | ptIdx  → fin de montée
04      40      —       zéros
```

Exemple réel (5 montées du 100K) :
```
rec0  DE 04 BE 00  → 0x00BE04DE → flag=0xBE (début), ptIdx=0x04DE=1246
rec1  93 05 BF 00  → 0x00BF0593 → flag=0xBF (fin),   ptIdx=0x0593=1427
rec2  26 0A BE 00  →                                  ptIdx=2598
rec3  BE 10 BF 00  →                                  ptIdx=4286
...   (5 paires = 10 records = 440 octets)
```

---

### `.tinfo` format B — N × 44 octets (navigation virage par virage)

Généré uniquement si l'option OSRM est cochée. Remplace le format A ci-dessus (pas de mélange
des deux) — mêmes 44 octets par record, mais tous utilisés cette fois. Voir aussi la section
"Fiabilité navigation OSRM" du CLAUDE.md pour la provenance et les limites du code/nom.

```
Offset  Taille  Type    Contenu
00      2       uint16  ptIdx dans le .track
02      1       uint8   code instruction (0x01 DÉPART, 0x02 tout droit, 0x0D gauche,
                        0x0E droite, 0xD2-D4 rond-point sortie 1/2/3+, 0x21 ARRIVÉE,
                        0xFA info rue départ/distance totale, 0xBE/0xBF montées — cf.
                        table complète des codes dans CLAUDE.md)
03      1       —       zéro
04      4       uint32  distance jusqu'au prochain virage (m)
08      4       uint32  même distance × 200 (unité inconnue, ratio confirmé)
12      32      UTF-8   nom de rue, null-paddé (souvent vide, ~50% des virages hors ville)
```

Exemple réel (trace gravel, virage à gauche sur une impasse) :
```
06 00  0D  00  0F 00 00 00  B8 0B 00 00  49 6D 70 61 73 73 65 20 64 65 20 6C 27 41 62…00
↑      ↑       ↑            ↑            ↑
ptIdx=6 GAUCHE  15m          3000=15×200  "Impasse de l'Abattoir" (UTF-8, reste = zéros)
```

Structure du fichier complet : DÉPART (0x01) → INFO rue départ (0xFA) → virages dans l'ordre
du parcours → INFO distance totale (0xFA) → ARRIVÉE (0x21) → marqueurs de montées (0xBE/0xBF),
mêmes flags que le format A ci-dessus.

---

### `list.junc` / `list2.junc` — N × 12 octets + sentinel

Intersections OSM que la route traverse. Les deux fichiers sont identiques.
Le dernier record est un sentinel `FF×12`.

```
Offset  Taille  Type    Contenu
00      4       int32   lat × 1 000 000
04      4       int32   lon × 1 000 000
08      2       uint16  ptIdx (point de trace le plus proche)
10      1       uint8   flag : 0x01 = virage, 0x00 = tout droit
11      1       uint8   bearing × (256/360)  — 0=Nord, 64=Est, 128=Sud, 192=Ouest
```

Exemple réel (début du 100K) :
```
junc0  D0 AD 99 02  45 95 3B 00  00 00  01  34
       ↑            ↑            ↑      ↑   ↑
    43.626°N     3.906°E       pt=0  virage  0x34=52 → 73° (NE)

junc4  F8 AE 99 02  79 8A 3B 00  26 00  01  30
junc5  F8 AE 99 02  79 8A 3B 00  26 00  01  5A
       ↑ même carrefour, deux routes qui partent → deux records
```

Sentinel : `FF FF FF FF FF FF FF FF FF FF FF FF`

---

### `sort1.path` — N × 16 octets

Index spatial : découpe la trace par tuile OSM zoom 13.
Permet au Bryton de ne charger que les ~500 points de la tuile courante plutôt que les 15 000 de la trace entière.

```
Offset  Taille  Type    Contenu
00      4       uint32  start_ptIdx
04      4       uint32  end_ptIdx
08      4       uint32  tile_id = (tile_y_z13 << 16) | tile_x_z13
12      4       uint32  0
```

Les segments se **chevauchent d'un point** : `end` du segment N = `start` du segment N+1 − 1.

Formule tuile OSM zoom 13 :
```
tx = floor((lon + 180) / 360 × 8192)
ty = floor((1 − ln(tan(lat_rad) + 1/cos(lat_rad)) / π) / 2 × 8192)
```

Exemple réel (100K — 41 segments, tx ∈ [4182,4185], ty ∈ [2982,2990]) :
```
seg0   00 00 00 00  F9 01 00 00  58 10 AE 0B  00 00 00 00
       ↑            ↑            ↑
     start=0      end=505     tile=(tx=4184, ty=2990)

seg1   F8 01 00 00  0F 04 00 00  58 10 AD 0B  00 00 00 00
       ↑
     start=504  ← overlap d'1 point avec seg0
```

---

### `dupli.track`

Copie octet-à-octet du `.track` racine. Rôle exact inconnu — le firmware plante sans lui.

---

## Philosophie du format — tout est pré-calculé

Le Bryton 460 embarque un processeur ARM bas de gamme (quelques dizaines de MHz, ~1 Mo de RAM).
Pas de trigonométrie, pas de parsing, pas d'allocation mémoire dynamique en temps réel.
Tout le travail lourd est fait **côté PC à la conversion** — le device ne fait que lire et afficher.

| Valeur | Calculée où | Stockée comment |
|---|---|---|
| Pente locale | PC — fenêtre glissante 200m | `int8` signé dans byte 10 du `.track` |
| Bearing aux intersections | PC — formule haversine | `uint8` 0–255 dans `list.junc` (pas de degrés, pas de radians) |
| Bounding box / distance / D+ | PC | `.smy` — 68 octets fixes |
| Index des montées | PC — détection par profil | `.tinfo` — paires ptIdx début/fin |
| Index spatial par tuile | PC — calcul Mercator z=13 | `sort1.path` |

### Détection "sur le trajet" en deux étapes

Le Bryton ne compare pas la position GPS aux 15 000 points de la trace à chaque seconde.
Il utilise `sort1.path` comme filtre grossier :

```
Étape 1 — filtre rapide (sort1.path)
  GPS → tuile OSM z=13 courante
  → charge uniquement les ~500 points du segment correspondant
  → élimine les 14 500 autres points

Étape 2 — comparaison fine (.track)
  Pour chaque point du segment :
    distance(GPS, point) < seuil → sur le trajet
                                 → off route
```

Sans `sort1.path` correct (tuile_id = 0 au lieu de la vraie tuile), le Bryton déclare
immédiatement "off route" sans même regarder les coordonnées du `.track`.

### Pas de cosinus sur le device

Le bearing est stocké en **0–255** (pas en degrés) :
```
0   → Nord   64  → Est   128 → Sud   192 → Ouest
```
Le device fait un simple lookup de flèche sur un octet. C'est nous qui calculons
`atan2` + la conversion `× 256/360` à la génération des fichiers.

---

## Données de référence

```
data_references/
  100k/
    100K.gpx                    ← sortie Strava, ~100km, région Montpellier
    output_brytonofficial/      ← fichiers générés par l'appli Bryton officielle (ground truth)
    output_mytool/              ← fichiers générés par cet outil (pour comparaison)
  bales/
    bales.gpx                   ← sortie Strava, Pyrénées, départ ~1200m
```

---

## Ce qui est confirmé vs approximé

Validé par comparaison octet-à-octet avec les fichiers générés par l'appli officielle Bryton
sur une trace réelle de 100 km / 15 444 points.

| Fichier | Statut | Détail |
|---|---|---|
| `.track` lat/lon/ele | ✅ Correct | Encodage int32/uint16 LE validé |
| `.track` byte 10 pente | ✅ Correct | Écart ≤ 1% vs officiel (fenêtre 200m) |
| `.smy` | 🔶 Approché | bbox, distance ok — D- = 0 comme l'officiel ; **D+ surestimé** (calcul non lissé, ~33% de plus que l'officiel mesuré sur une trace réelle avec la même donnée d'altitude source) |
| `.tinfo` format A | ✅ Correct | Flags 0xBE/0xBF + ptIdx sur 16 bits |
| `.tinfo` format B nav | 🔶 Approché | Structure 44B + codes direction confirmés via voiceTrip ; échantillonnage OSRM ancré sur les vrais virages GPS + garde-fou contre les matchs à plus de 50m du tracé réel (rejetés) ; un éventuel décalage ptIdx/code entre intersections n'est pas encore tranché ; un code `0x64` (POI/waypoint GPX) a été repéré dans un fichier officiel mais n'est pas encore décodé/implémenté |
| `.tinfo` nom de rue | 🔶 Approché | Vient de `step.name` OSRM (tag OSM `name` de la route matchée) — même fiabilité que le code de direction, aucune source séparée. Souvent vide sur route non taggée : 45-54% des virages sans nom mesuré sur deux traces gravel réelles |
| `.climb` structure | ✅ Correct | 4 × float32 : start_m, longueur_m, D+_m, grade |
| `sort1.path` | ✅ Correct | Segments par tuile OSM z=13 — format validé, structure identique à l'officiel vérifiée sur plusieurs traces |
| `.climb` détection | 🔶 Approché | 1re montée exacte, autres ≈ ±2 km vs officiel sur la trace 100K ; a raté la totalité des montées détectées par l'officiel sur une autre trace testée |
| `.track` densité de points | ✅ Corrigé | Écart max garanti de 30m entre points consécutifs (`densify`) — certains GPX (export planificateur type Komoot) ont des trous natifs de 500m+, y compris dans les fichiers générés par l'appli officielle elle-même |
| `list.junc` | 🔶 Approché | Détection par changement d'angle GPS (Overpass jamais branché en prod, et service actuellement injoignable) — environ la moitié des intersections détectées par l'officiel sur une trace de comparaison |
