// ════════════════════════════════════════════════════════════════
// Détection des montées significatives
//
// Problème : l'altitude GPS brute oscille de ±3–8m à chaque point.
// Sans lissage, chaque bosse de 5m serait détectée comme une montée.
//
// Approche en 4 étapes :
//   1. Lissage distance-based (fenêtre 200m) → altitude stable
//   2. Scan greedy : pour chaque départ de montée, trouver le sommet
//      en tolérant les replats/relances (seuil dynamique 30%)
//   3. Filtrer les résultats sous les seuils (longueur, D+, pente)
//   4. Garder les 5 meilleures (score = grade × gain) dans l'ordre chronologique
// ════════════════════════════════════════════════════════════════

export function detectClimbs(pts, dists) {
  const n = pts.length;

  // Aucune altitude dans le GPX → impossible de détecter des montées.
  // != null attrape à la fois null et undefined.
  if (!pts.some(p => p[2] != null)) return [];

  const raw = pts.map(p => p[2] ?? 0);

  // ── Étape 1 : lissage par moyenne glissante sur 200m ─────────────
  // La fenêtre est en mètres (pas en nombre de points) pour être
  // indépendante de la densité du GPX (1pt/5m ou 1pt/50m → même résultat).
  const SMOOTH = 200;
  const es = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i; j >= 0 && dists[i]-dists[j] <= SMOOTH; j--) { sum += raw[j]; cnt++; }
    for (let j = i+1; j < n && dists[j]-dists[i] <= SMOOTH; j++) { sum += raw[j]; cnt++; }
    es[i] = cnt ? sum/cnt : raw[i];
  }

  // ── Étape 2 : scan des montées ────────────────────────────────────
  // Seuils de qualification d'une montée :
  const MIN_LEN   = 500;   // longueur minimale en mètres
  const MIN_GAIN  = 25;    // dénivelé positif minimal en mètres
  const MIN_GRADE = 0.022; // pente moyenne minimale (2.2%)

  const all = [];
  let i = 0;
  while (i < n-2) {
    // Avancer jusqu'au prochain point où ça commence à monter.
    if (es[i+1] <= es[i]) { i++; continue; }

    const si = i; // index de départ de la montée candidate
    let peak = es[i], pi = i, j = i+1;

    // Avancer j jusqu'à ce qu'on descende "assez" depuis le pic.
    // "assez" = seuil dynamique : max(40m, 30% du gain total depuis si).
    // Le 30% tolère les replats et relances intérieures d'une longue montée
    // (ex. : -10m sur une montée de 200m D+ ne coupe pas la montée en deux).
    while (j < n) {
      if (es[j] > peak) { peak = es[j]; pi = j; } // nouveau sommet
      const drop = Math.max(40, (peak-es[si]) * 0.30);
      if (peak - es[j] >= drop) break; // on a assez redescendu → fin de montée
      j++;
    }

    const gain  = es[pi] - es[si];
    const len   = dists[pi] - dists[si];
    if (len < 10) { i = pi+1; continue; } // segment dégénéré (points quasi-identiques)
    const grade = gain / len;

    if (gain >= MIN_GAIN && len >= MIN_LEN && grade >= MIN_GRADE) {
      all.push({ start: dists[si], length: len, gain, grade, startPt: si, endPt: pi });
    }

    // Reprendre le scan après le sommet (greedy).
    // Limite connue : si deux montées se chevauchent dans le lissé,
    // la deuxième peut être décalée de ±quelques centaines de mètres.
    i = pi+1;
  }

  // ── Étapes 3 & 4 : sélection des 5 meilleures ────────────────────
  // Score = grade × gain : favorise les montées à la fois raides ET longues.
  // Une col à 7% / 500m D+ bat un faux plat à 1% / 2km D+.
  // Après sélection, retour à l'ordre chronologique pour l'affichage.
  all.sort((a, b) => (b.grade*b.gain) - (a.grade*a.gain));
  return all.slice(0, 5).sort((a, b) => a.start - b.start);
}
