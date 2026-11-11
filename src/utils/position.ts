export const GAP = 1000;
export const MIN_GAP = 1e-6;

export function positionAt(positions: number[], index: number): number | null {
    const i = Math.min(index, positions.length);
    const prev: number | undefined = positions[i - 1];
    const next: number | undefined = positions[i];

    if (prev === undefined) {
        return next === undefined ? GAP : next - GAP;
    }
    if (next === undefined) return prev + GAP;
    if (next - prev < MIN_GAP) return null;

    return (prev + next) / 2;
}
