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

### `.tinfo` — n × 2 × 44 octets
- Chaque record : uint32 au début, reste = zéros
- `0x00BE????` = début montée, `0x00BF????` = fin montée
- Bits 0–15 = ptIdx dans le .track

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
**Non encore implémenté** — actuellement 16 octets hardcodés.

---

## État des fichiers générés (vs officiel Bryton)

| Fichier | Statut | Notes |
|---------|--------|-------|
| `.track` lat/lon/ele | ✅ Correct | |
| `.track` byte 10 pente | ✅ Correct | diff ≤ 1% vs officiel |
| `.smy` | ✅ Correct | D-=0 corrigé, [24] laissé à 0 |
| `.tinfo` | ✅ Correct | structure confirmée |
| `.climb` | ✅ Correct | structure confirmée |
| Climb detection | 🔶 Partiel | 1re montée exacte, autres ≈ ±2km |
| `list.junc` | 🔶 Partiel | OSM Overpass branché, rayon 25m → 162 intersections (officiel : 733) |
| `sort1.path` | 🔴 Faux | 16B hardcodés au lieu de N×16B avec tiles z=13 |

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
```

---

## Prochains chantiers

1. **`list.junc`** : augmenter le rayon Overpass (25m → 50m) pour aller vers ~700 intersections
2. **`sort1.path`** : implémenter l'index de segments tile OSM z=13
3. **Climb detection** : algo grade-based prometteur mais pas convergé
4. **D- UI** : l'affichage montre encore D- calculé — à masquer (mettre 0 comme l'officiel)

---

## Versioning

- Fichier de travail : `proto_html/bryton.html`
- Référence figée : `proto_html/bryton_v0.1.html` (ne pas modifier)
- Tags git : `v0.1`
