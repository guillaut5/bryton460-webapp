# bryton460-webapp

Outil HTML pour générer les fichiers natifs du GPS **Bryton 460** à partir d'un fichier GPX.
Conçu pour les utilisateurs PC sans l'appli Bryton officielle (Nokia, PC only, etc.).

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

| Fichier | Statut |
|---|---|
| `.track` lat/lon/ele/pente | ✅ Confirmé sur données officielles |
| `.smy` bbox/dist/D+ | ✅ Confirmé (D- = 0 corrigé) |
| `.tinfo` structure | ✅ Confirmé (flags 0xBE/0xBF + ptIdx) |
| `.climb` structure | ✅ Confirmé (4×float32) |
| `.climb` détection des montées | 🔶 Approché — 1re montée exacte, autres ≈ ±2km |
| `list.junc` | 🔶 Heuristique angles — devrait venir d'OSM Overpass |
| `sort1.path` | 🔴 Format connu (tuiles OSM z=13) mais non implémenté |
