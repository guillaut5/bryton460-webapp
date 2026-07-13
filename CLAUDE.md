# Contexte projet — bryton460-webapp

Outil HTML autonome pour générer les fichiers natifs du GPS **Bryton 460** depuis un GPX.
L'utilisateur est sur PC/Nokia, sans l'appli Bryton officielle.

---

## Formats binaires confirmés (reverse-engineering sur fichiers officiels 100K)

### `.track` — 16 octets par point
| Octets | Type | Contenu |
|--------|------|---------|
| 0–3 | int32 LE | lat × 1 000 000 |
| 4–7 | int32 LE | lon × 1 000 000 |
| 8–9 | uint16 LE | élévation (m) |
| 10 | int8 | pente locale (%, signé) — moyenne glissante 200m |
| 11–15 | — | zéros |

### `.smy` — 68 octets
| Offset | Type | Contenu |
|--------|------|---------|
| 0 | uint16 | version = 1 |
| 2 | uint16 | nb points |
| 4 | int32 | lat_max × 1e6 |
| 8 | int32 | lat_min × 1e6 |
| 12 | int32 | lon_max × 1e6 |
| 16 | int32 | lon_min × 1e6 |
| 20 | int32 | distance (m) |
| 24 | int32 | **inconnu** (= 1 638 732 sur 100K officiel) |
| 60 | int32 | D+ (m) |
| 64 | int32 | D− = **toujours 0** dans l'officiel |

### `.tinfo` — deux formats selon l'origine de la route

**Format A — import GPX** (ce qu'on génère) : n × 2 × 44 octets
- Chaque record : uint32 au début, reste = zéros
- `0x00BE????` = début montée, `0x00BF????` = fin montée
- Bits 0–15 = ptIdx dans le .track

**Format B — route planifiée à la main dans l'appli Bryton** (`voiceTrip`) : n × 44 octets
| Offset | Type | Contenu |
|--------|------|---------|
| 0–1 | uint16 LE | ptIdx dans le .track |
| 2 | uint8 | code instruction (0x01=départ, 0x02=tout droit, 0x0D=gauche, 0x0E=droite, 0xD2-D4=rond-point…) |
| 3 | uint8 | zéro |
| 4–7 | uint32 | distance jusqu'au prochain virage (m ?) |
| 8–11 | uint32 | même distance dans une autre unité (≈ ×200) |
| 12–43 | UTF-8 | nom de rue null-paddé sur 32 octets |

Ce format permet la **navigation vocale avec annonce des noms de rue**.
Nécessiterait un service de routage (OSRM/Valhalla) + geocoding (Nominatim) pour être généré depuis un GPX — hors scope actuel.

### `.climb` — n × 16 octets (float32 × 4)
`[start_dist_m, longueur_m, D+_m, grade_fraction]`

### `list.junc` / `list2.junc` — n × 12 octets (fichiers identiques)
| Octets | Type | Contenu |
|--------|------|---------|
| 0–3 | int32 LE | lat × 1e6 |
| 4–7 | int32 LE | lon × 1e6 |
| 8–9 | uint16 LE | ptIdx |
| 10 | uint8 | flag (0x00 ou 0x01) |
| 11 | uint8 | bearing × (256/360) |

Pas de sentinel. Source = intersections OSM (noeuds référencés par 2+ ways highway).

### `sort1.path` — N × 16 octets
| Octets | Type | Contenu |
|--------|------|---------|
| 0–3 | uint32 | start_ptIdx |
| 4–7 | uint32 | end_ptIdx |
| 8–11 | uint32 | tile_id = (tile_y_z13 << 16) \| tile_x_z13 |
| 12–15 | uint32 | 0 |

41 segments pour le 100K (15 444 points). Segments consécutifs se chevauchent d'1 point.

---

## État des fichiers générés (vs officiel Bryton)

| Fichier | Statut | Notes |
|---------|--------|-------|
| `.track` lat/lon/ele | ✅ Correct | |
| `.track` byte 10 pente | ✅ Correct | diff ≤ 1% vs officiel |
| `.smy` | ✅ Correct | D-=0 corrigé, [24] laissé à 0 |
| `.tinfo` format A (montées) | ✅ Correct | structure confirmée |
| `.tinfo` format B (nav OSRM) | ✅ Correct | codes direction confirmés via voiceTrip + tests appareil |
| `.climb` | ✅ Correct | structure confirmée |
| Climb detection | 🔶 Partiel | 1re montée exacte, autres ≈ ±2km |
| `list.junc` | 🔶 Partiel | OSM Overpass branché, rayon 25m → 162 intersections (officiel : 733) |
| `sort1.path` | ✅ Correct | N×16B avec tiles z=13, validé sur 100K (41 segments) |

---

## Données de référence

```
data_references/
  100k/
    100K.gpx                     ← trace Strava ~100km Montpellier
    output_brytonofficial/       ← ground truth (fichiers générés par l'appli officielle)
    output_mytool/               ← sortie de l'outil (pour diff)
  bales/
    bales.gpx                    ← trace Strava Pyrénées ~1200m alt départ
    output_brytonofficial/
  foret_clapiers/
    foret_clapliers.gpx          ← trace courte, région Montpellier
    output_brytonofficial/
  official-route-by-hand/
    voiceTrip.*                  ← route planifiée à la main dans l'appli Bryton
                                   → .tinfo format B (voice navigation + noms de rue)
                                   → 402 points, 4 tuiles z=13
```

---

## Codes de direction `.tinfo` format B (confirmés)

| Code | Signification | Certitude |
|------|--------------|-----------|
| 0x01 | DÉPART | ✅ |
| 0x02 | Tout droit (0°) | ✅ |
| 0x03 | Léger gauche (−45°) | ✅ confirmé voiceTrip |
| 0x04 | Léger droite (+45°) | ✅ confirmé voiceTrip off=0 + nom rue |
| 0x05 | Serré droite (+135°) | ✅ logique symétrique + observé écran |
| 0x06 | Serré gauche (−135°) | ✅ logique symétrique + observé écran |
| 0x07 | Demi-tour (180°) | 🔶 voiceTrip −86°/−156° |
| 0x0D | Gauche (−90°) | ✅ test appareil |
| 0x0E | Droite (+90°) | ✅ test appareil + voiceTrip off=0 |
| 0x21 | ARRIVÉE | ✅ |
| 0xD2 | Rond-point sortie 1 | ✅ |
| 0xD3 | Rond-point sortie 2 | ✅ |
| 0xD4 | Rond-point sortie 3+ | ✅ |

---

## Fiabilité élévation SRTM et hypothèse "hors itinéraire"

L'API publique Open-Elevation (`open-elevation.com`) échoue silencieusement sur certains
batchs de 512 points (rate-limit/timeout côté serveur, aucune garantie de service). Avant
correction, les points concernés tombaient à **0m d'altitude plat** dans le `.track` généré
(observé : ~50% d'une trace de 78km sur deux traces terrain distinctes).

**Corrigé** : `fetchElevations` retry chaque batch (3 tentatives, backoff exponentiel) +
délai de 300ms entre batchs. S'il reste des trous après retries, l'app comble avec la
dernière altitude connue tenue constante et affiche un avertissement (`app.js`, handler
`fetchEleBtn`).

**Hypothèse forte (non confirmée à 100%, mais observation terrain cohérente sur 2 traces)** :
le device compare probablement la position GPS en **3D** (lat/lon + altitude) aux points du
`.track` pour la détection "sur le trajet" — pas seulement lat/lon comme supposé. Sur les deux
traces générées par l'outil avant le fix, le message "hors itinéraire" apparaissait
précisément aux endroits où l'altitude était à 0m (trou SRTM), et le device retrouvait la
trace dès que l'altitude réelle était présente. Zone à retester après le fix élévation
(v0.5) pour confirmer/infirmer.

---

## Prochains chantiers

1. **`list.junc`** : augmenter le rayon Overpass (25m → 50m) pour aller vers ~700 intersections
2. **Climb detection** : algo grade-based prometteur mais pas convergé
3. **D- UI** : l'affichage montre encore D- calculé — à masquer (mettre 0 comme l'officiel)
4. **Vérifier sur device** que le fix élévation (v0.5) fait disparaître les faux "hors itinéraire"

---

## Versioning

- Fichier de travail v0.5 : `src/` (modules ES) + `index.html` → `npm run build` → `dist/index.html`
- Archive proto : `proto_html/bryton.html` (v0.2), `proto_html/bryton_v0.1.html` (ne pas modifier)
- Tags git : `v0.1`, `v0.2`, `v0.4`, `v0.5`
