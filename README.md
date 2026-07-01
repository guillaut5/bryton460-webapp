# bryton460-webapp

Outil HTML pour générer les fichiers natifs du GPS **Bryton 460** à partir d'un fichier GPX.
Conçu pour les utilisateurs PC sans l'appli Bryton officielle (Nokia, PC only, etc.).

**Unofficial tool — not affiliated with Bryton.**
File formats obtained by reverse engineering for interoperability purposes.
Licensed under the [MIT License](LICENSE).

**→ Demo : [dev.agriscope.fr/bryton.html](https://dev.agriscope.fr/bryton.html)**

![Screenshot](proto_html/screenshot.png)

---

## Utilisation

1. Ouvrir `proto_html/bryton.html` dans Chrome ou Edge
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
24      4       int32      inconnu (= 1 638 732 dans tous les fichiers officiels)
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
| `.smy` | ✅ Correct | bbox, distance, D+ ok — D- = 0 comme l'officiel |
| `.tinfo` | ✅ Correct | Flags 0xBE/0xBF + ptIdx sur 16 bits |
| `.climb` structure | ✅ Correct | 4 × float32 : start_m, longueur_m, D+_m, grade |
| `sort1.path` | ✅ Correct | Segments par tuile OSM z=13 — format validé |
| `.climb` détection | 🔶 Approché | 1re montée exacte, autres ≈ ±2 km vs officiel |
| `list.junc` | 🔶 Approché | Détection par angle de virage — pas les vraies intersections OSM |
