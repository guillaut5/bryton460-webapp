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
| 24 | int32 | **inconnu** — variable par route, pas une constante : 1 638 732 sur 100K officiel, 2 490 581 sur `ceceles` officiel (2026-07-24). Pas de corrélation trouvée avec nb_points/distance/D+ |
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
| 12–43 | UTF-8 | nom de rue null-paddé sur 32 octets (souvent vide, voir "Navigation OSRM") |

Ce format permet la **navigation vocale avec annonce des noms de rue**. Généré depuis un GPX
via OSRM `/match` (map matching) — voir section "Navigation OSRM" plus bas.

⚠️ Champ offset 4-7 encore incertain ("m ?" dans le tableau) : on suppose que `code[i]` et
`val4[i]` (distance) décrivent tous les deux le virage à `ptIdx[i]`, mais un décalage d'un cran
(le device afficherait à l'intersection N le code de l'intersection N+1) est une hypothèse
soulevée par l'utilisateur (2026-07-21), non confirmée ni infirmée — testée une fois sur
`voiceTrip` par comparaison géométrique, résultat non concluant (zone trop dense pour la
méthode, voir section OSRM). À rouvrir si un exemple de terrain précis est rapporté.

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
| `.smy` | 🔶 Partiel | D-=0 corrigé, [24] laissé à 0 (champ variable, pas déchiffré) ; **D+ surestimé** — calcul non lissé vs officiel (567m calculé vs 425m officiel sur `ceceles`, même donnée d'altitude source ; connu, pas priorisé au 2026-07-24) |
| `.tinfo` format A (montées) | ✅ Correct | structure confirmée |
| `.tinfo` format B (nav OSRM) | 🔶 Partiel | codes direction confirmés via voiceTrip + tests appareil ; échantillonnage OSRM ancré sur les vrais virages GPS (fix rue fantôme, 2026-07-21) + garde-fou matchs >50m (2026-07-24) ; décalage ptIdx/code éventuel non tranché ; code `0x64` (POI GPX) observé mais pas implémenté |
| `.climb` | ✅ Correct | structure confirmée |
| Climb detection | 🔶 Partiel | 1re montée exacte, autres ≈ ±2km sur 100K ; **a raté 4/4 montées** détectées par l'officiel sur `ceceles` (connu, pas priorisé au 2026-07-24) |
| `list.junc` | 🔶 Partiel | fallback détection GPS (`detectTurnIdxs`) toujours utilisé en pratique — Overpass jamais branché en prod (code présent, jamais appelé), et injoignable au test du 2026-07-21 ; ~54% de couverture vs officiel mesuré sur `ceceles` (255 vs 475 intersections) |
| `sort1.path` | ✅ Correct | N×16B avec tiles z=13, validé sur 100K (41 segments) |
| `.track` densité de points | ✅ Corrigé | `densify()` garantit un écart max de 30m entre points consécutifs (2026-07-21) — certains GPX (export planificateur type Komoot) laissent des trous de 500m+ sur les lignes droites |

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

**Autre code `.tinfo` observé (2026-07-24, non implémenté) :** `0x64` = marqueur de POI/waypoint
GPX. Découvert sur `fd.tinfo` (fichier officiel généré depuis un GPX Komoot avec des `<wpt>`) :
12 records `0x64` correspondant exactement aux 12 balises `<wpt>` du GPX source (même ordre,
mêmes positions approximatives). Notre outil ignore actuellement les `<wpt>` du GPX à l'import
(seuls `<trk>/<trkseg>/<trkpt>` sont parsés) — fonctionnalité potentielle à ajouter (afficher
les POI sur le device) mais pas creusée davantage (structure du reste du record 0x64 —
distance/nom — pas encore décodée).

---

## Causes "hors itinéraire" identifiées (plusieurs bugs indépendants, même symptôme)

Symptôme récurrent rapporté par l'utilisateur sur le terrain (device Bryton en vraie sortie).
Pas une cause unique — plusieurs bugs distincts produisent le même message. Historique :

**Cause 1 — altitude à 0m par trous SRTM (corrigé, v0.5).** L'API publique Open-Elevation
(`open-elevation.com`) échoue silencieusement sur certains batchs de 512 points (rate-limit/
timeout, aucune garantie de service). Avant correction, les points concernés tombaient à
**0m d'altitude plat** dans le `.track` (observé : ~50% d'une trace de 78km, deux traces
terrain distinctes). Corrigé : `fetchElevations` (src/api/elevation.js) retry chaque batch
(3 tentatives, backoff exponentiel) + délai 300ms entre batchs ; s'il reste des trous, l'app
comble avec la dernière altitude connue tenue constante + avertissement utilisateur
(`app.js`, handler `fetchEleBtn`).
Hypothèse forte (non confirmée à 100%, mais cohérente sur 2 traces terrain) : le device
compare la position GPS en **3D** (lat/lon + altitude) pour la détection "sur le trajet" —
le message apparaissait précisément aux endroits à 0m d'altitude, et disparaissait dès que
l'altitude réelle était présente.

**Cause 2 — trous >100m entre points consécutifs du `.track` (corrigé, 2026-07-21).** Les
GPX exportés depuis un planificateur d'itinéraire (Komoot confirmé, `creator="komoot.de"`)
ne stockent que les points de forme de la route — denses dans les virages, très espacés sur
les lignes droites (595m de trou observé, présent même avec simplification="Aucune" côté
outil : le trou vient du GPX source lui-même). Le device semble comparer la position GPS au
point du `.track` le plus proche (pas à la ligne interpolée) → au milieu d'un grand trou,
même exactement sur le tracé, aucun point n'est assez proche → faux "hors itinéraire".
Corrigé par `densify()` (src/geo.js) : interpole des points intermédiaires (lat/lon/ele
linéaire) pour garantir un écart max de **30m**, appliqué après simplification (jamais avant
— RDP supprimerait aussitôt les points ajoutés, déviation nulle par rapport à la ligne dont
ils viennent). Reproduit et corrigé sur deux traces gravel fournies par l'utilisateur.

**Hypothèse non confirmée — segments `sort1.path` trop courts.** Repérée sur une trace
avec aller-retour (un segment de tuile de seulement 6 points). Le deuxième cas terrain
rapporté n'était pas un aller-retour et s'explique entièrement par la cause 2 — donc ne pas
prioriser cette piste tant que la cause 2 n'a pas été validée sur device et exclue.

**Cas non résolu (2026-07-24) — demi-tour = perte totale du suivi.** Sur une trace avec fix
rue fantôme + densify déjà appliqués, tout fonctionnait bien jusqu'à un point où le chemin
était interdit (payant l'été, Lac de Cécélès) → demi-tour de l'utilisateur. En repartant en
sens inverse sur exactement la même trace enregistrée : "hors itinéraire" immédiat, plus
d'affichage de la trace. Reset de l'itinéraire : même problème. Tentative de rejoindre la
suite du parcours plus loin (en sautant la portion interdite) : toujours "hors itinéraire",
alors qu'à nouveau exactement sur la trace enregistrée. Vérifié et écarté : `.track`/
`sort1.path`/`.tinfo` sont tous propres à cet endroit précis (aucune anomalie structurelle,
les 4 virages du coin sont matchés par OSRM à 0m d'écart). Hypothèse actuelle (non
confirmée) : le firmware garderait un pointeur de progression qui n'avance que dans un sens
et ne cherche la position que dans une fenêtre proche du dernier point connu — cohérent avec
la philosophie "device bas de gamme, calcul minimal" déjà établie, mais pas vérifié sur
device. Test proposé : demi-tour volontaire sur une portion qui marche bien, loin de toute
contrainte de terrain, pour confirmer si n'importe quel demi-tour casse le suivi.

**Preuve définitive — `.tinfo`/OSRM structurellement écarté (2026-07-24).** Régénéré `ceceles`
en v0.7 avec et sans la case navigation OSRM cochée. Comparaison par checksum MD5 :
`.track`, `.smy`, `sort1.path` et `list.junc` sont **strictement identiques, octet pour
octet**, entre les deux — seul `.tinfo` change (57 records de navigation vs fichier vide, 0
montée détectée sur cette trace). Preuve structurelle, pas juste une observation locale
sans anomalie : OSRM/les instructions de virage ne peuvent **physiquement pas** influencer le
suivi de position, quel que soit l'endroit sur la trace, puisque les fichiers responsables du
suivi ne changent pas un seul octet selon qu'OSRM soit activé ou non. L'hypothèse pointeur de
progression / fenêtre de recherche du firmware reste la piste la plus solide.

**Preuve à l'appui — même comportement sur fichier 100% officiel.** Symptôme apparenté
rapporté sur la forêt de Clapiers (single-tracks qui se recoupent, boucle A→B→C→D→B→E→F où B
est revisité) : l'affichage carte ne montrait pas le bon embranchement selon le sens de
passage à B. Vérifié sur `data_references/foret_clapiers/output_brytonofficial/` (généré par
l'**appli officielle**, pas nous) : 127 paires de points aux coordonnées quasi-identiques
mais très éloignées en ptIdx, toutes dans **un seul segment `sort1.path`** sans traitement
spécial — structure strictement identique à ce que produit notre outil. Donc ce n'est pas un
bug de notre génération : ni l'officiel ni nous ne faisons de distinction pour un point
revisité dans le format de fichier. Renforce l'hypothèse d'une vraie limite firmware pour
gérer une trace qui repasse par les mêmes coordonnées (aller-retour ou boucle qui se
recroise), indépendante de l'outil utilisé pour générer les fichiers.

**Comment investiguer un nouveau rapport "hors itinéraire" :** vérifier dans l'ordre (1) trous
d'altitude à 0m, (2) écart entre points consécutifs du `.track` (`hav()` point à point,
chercher les gaps >100m), (3) segments `sort1.path` anormalement courts, (4) si le rapport
implique un demi-tour ou un raccourci hors trace, voir le cas non résolu ci-dessus. Toujours
vérifier l'origine du GPX source (export planificateur vs enregistrement GPS réel) —
comportement très différent en densité de points.

---

## Fiabilité navigation OSRM (virages `.tinfo` format B)

**Bug "rue fantôme" (corrigé, 2026-07-21).** `matchRoute()` échantillonnait la trace tous les
200m avant d'interroger OSRM `/match`. Dans un lotissement (rues de 30-150m), OSRM manque de
repères entre deux points et peut recoller un chemin plausible mais faux à travers une rue
voisine — reproduit concrètement ("Rue Marcellin Albert" insérée à tort). Corrigé en ajoutant
les points où la trace GPS change vraiment de direction (`detectTurnIdxs`, geo.js) comme
ancrages supplémentaires à l'échantillonnage uniforme. Coût mesuré : ~1.5x plus de requêtes
OSRM (donc plus lent à générer), zéro nouvelle dépendance externe.

**Garde-fou match trop éloigné (corrigé, 2026-07-24).** Sur les tronçons hors réseau routable
(chemins/pistes), OSRM (profil driving) peut renvoyer un match sur la route bitumée la plus
proche plutôt que sur le vrai chemin — mesuré jusqu'à **926m** d'écart sur une trace gravel
réelle (`grvl_dp_zoo_ceceles`), alors que les bons matchs sont à 0m (le `.track` est densifié
à 30m max, cf. `densify()` — un bon match doit donc toujours être tout proche). `matchRoute()`
rejette maintenant les virages dont le point matché est à plus de 50m (`MAX_MATCH_DIST_M`,
osrm.js) du point réel le plus proche. ~1/3 des virages rejetés sur la trace de test. Trouvé
en creusant un rapport terrain différent (voir section "hors itinéraire" — au final sans
rapport avec ce rapport précis, mais un vrai nettoyage de bruit indépendant.)

**Nom de rue** : vient de `step.name` renvoyé directement par OSRM (lui-même le tag OSM
`name` de la way matchée) — aucune source séparée, pas de géocodage/reverse-geocoding à part.
Donc **même fiabilité que le code de direction** : les deux viennent du même step OSRM, donc
un mauvais map-matching (comme le bug rue fantôme) fausse le nom ET le code ensemble, jamais
l'un sans l'autre. Beaucoup de tronçons n'ont simplement pas de nom dans OSM (chemins/pistes
non taggés) — mesuré sur deux traces gravel réelles : **45-54% des virages sans nom**. C'est
attendu, pas un bug — plus fréquent hors zone urbaine/route bitumée.

**Pistes explorées et abandonnées :**
- *Intersections OSM réelles via Overpass* — `fetchOSMJunctions()` (junc.js) existe depuis
  v0.2 mais n'a jamais été appelée en prod (vérifié par `git log -S` sur tout l'historique).
  Le chiffre "162 intersections" documenté historiquement vient d'un test manuel isolé.
  Testé le 2026-07-21 : `overpass-api.de` injoignable (timeout puis échec réseau), confirmé
  indépendamment depuis deux environnements différents. Piste abandonnée pour l'instant —
  pas fiable comme dépendance supplémentaire. Ne pas la reprendre sans retester la
  disponibilité du service au préalable.
- *Classification des virages par géométrie GPS pure* (angle avant/après sur une fenêtre,
  au lieu de faire confiance au `modifier` OSRM) — testée sur la trace complète (101 virages) :
  seulement ~29% d'accord avec OSRM, les pires désaccords concentrés près des ronds-points et
  carrefours denses à virages rapprochés (une seule mesure d'angle local ne peut pas isoler
  le bon point de décision quand plusieurs courbures se chevauchent). Deux variantes de
  méthode ont donné des taux d'accord très différents (85% vs 29%) sur des données
  différentes — signe que l'approche est trop sensible aux paramètres pour être fiable.
  Conclusion : garder le `modifier` OSRM (topologie réelle du réseau) plutôt que recalculer
  soi-même.

**Question ouverte — décalage ptIdx/code.** L'utilisateur soupçonne qu'à l'intersection N,
le device affiche le type de virage de l'intersection N+1 (voir note dans la section `.tinfo`
plus haut). Testé une fois sur `voiceTrip` par comparaison géométrique : résultat non
concluant (la trace est trop dense par endroits pour que la méthode géométrique soit fiable,
même limite que ci-dessus). Pas d'exemple de terrain précis pour l'instant — à rouvrir dès
qu'un cas concret est rapporté (quelle rue, quel virage affiché vs attendu).

---

## Prochains chantiers

1. **Test terrain demi-tour** : demi-tour volontaire sur une portion de trace qui marche bien,
   loin de toute contrainte, pour confirmer si n'importe quel demi-tour casse le suivi
   (hypothèse pointeur de progression firmware — voir "Causes hors itinéraire")
2. **Décalage ptIdx/code éventuel** : creuser dès qu'un exemple de terrain précis est rapporté
   (voir "Fiabilité navigation OSRM")
3. **`list.junc`** : augmenter le rayon Overpass (25m → 50m) — bloqué tant qu'Overpass reste
   injoignable depuis les environnements de test
4. **Climb detection** : algo grade-based prometteur mais pas convergé ; a raté 4/4 montées
   sur `ceceles` vs officiel — pas priorisé au 2026-07-24
5. **D+ non lissé** : surestime le D+ total par rapport à l'officiel (pas de lissage avant
   somme des deltas d'altitude) — pas priorisé au 2026-07-24
6. **D- UI** : l'affichage montre encore D- calculé — à masquer (mettre 0 comme l'officiel)
7. **Code `.tinfo` `0x64`** (POI/waypoint GPX) : format pas décodé au-delà du ptIdx, `<wpt>`
   du GPX ignorés à l'import — fonctionnalité potentielle, pas creusée

---

## Données de test terrain (non versionnées)

`claude_look/` (untracked, pas dans .gitignore mais pas committé) : fichiers générés par
l'outil et effectivement testés par l'utilisateur sur son Bryton 460 en vraies sorties, plus
les GPX sources correspondants quand fournis. C'est la meilleure source de retour terrain
disponible — mais le dossier est vidé/remplacé au fil des sessions, ne pas supposer qu'un
fichier mentionné dans une session précédente y est toujours présent.

---

## Versioning

- Fichier de travail v0.7 : `src/` (modules ES) + `index.html` → `npm run build` → `dist/index.html`
- Archive proto : `proto_html/bryton.html` (v0.2), `proto_html/bryton_v0.1.html` (ne pas modifier)
- Tags git : `v0.1`, `v0.2`, `v0.4`, `v0.5`, `v0.6`, `v0.7`
- v0.6 = fix rue fantôme (`3e0f553`) + fix densify trous >30m / traces Komoot (`584f3ab`)
- v0.7 = garde-fou virages OSRM mal matchés >50m (`412ee52`) + version UI lue depuis
  `package.json` au lieu d'être écrite en dur dans `index.html`
- Numéro de version affiché dans l'UI : injecté au build par Vite (`__APP_VERSION__`,
  vite.config.js, lit `package.json`) — ne jamais l'écrire en dur dans `index.html`
