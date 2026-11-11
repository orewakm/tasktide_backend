// Columns and cards are ordered by a float `position`. Items start 1000 apart, so a move
// only has to update the moved row: it takes the midpoint between its new neighbours.
// TR: Sütunlar ve kartlar float bir `position` ile sıralanır. Öğeler 1000 arayla başlar, böylece
// TR: bir taşıma sadece taşınan satırı günceller: yeni komşularının tam ortasını alır.
export const GAP = 1000;
// Dropping into the same spot again and again halves the gap each time. Once it gets
// this small we stop, before float precision runs out, and the caller renumbers.
// TR: Aynı yere tekrar tekrar bırakmak aradaki boşluğu her seferinde yarıya indirir. Bu kadar
// TR: küçülünce float hassasiyeti bitmeden dururuz ve çağıran taraf pozisyonları yeniden numaralandırır.
export const MIN_GAP = 1e-6;

// `positions` are the other items' positions in order (the moved one left out), and
// `index` is the slot it should land in. Returns null when the two neighbours are too
// close; the caller then renumbers the list to 1000, 2000, 3000... and calls again.
// TR: `positions` diğer öğelerin sıralı pozisyonlarıdır (taşınan öğe hariç), `index` ise
// TR: öğenin gireceği sıradır. İki komşu birbirine çok yakınsa null döner; çağıran taraf
// TR: listeyi 1000, 2000, 3000... diye yeniden numaralandırır ve fonksiyonu tekrar çağırır.
export function positionAt(positions: number[], index: number): number | null {
    const i = Math.min(index, positions.length); // past the end means last (TR: listenin sonunu aşarsa en sona)
    const prev: number | undefined = positions[i - 1];
    const next: number | undefined = positions[i];

    // First slot: 1000 in an empty list, otherwise 1000 before the current first item.
    // Going to zero or below is fine, positions only need to keep their order.
    // TR: İlk sıra: liste boşsa 1000, değilse mevcut ilk öğeden 1000 önce.
    // TR: Sıfıra ya da eksiye düşmesi sorun değil, pozisyonların sadece sırayı koruması yeterli.
    if (prev === undefined) {
        return next === undefined ? GAP : next - GAP;
    }
    if (next === undefined) return prev + GAP;
    if (next - prev < MIN_GAP) return null;

    return (prev + next) / 2;
}
