import { describe, expect, it } from 'vitest';
import { positionAt } from '../src/utils/position';

describe('positionAt', () => {
    it('puts the first item of an empty list at 1000', () => {
        expect(positionAt([], 0)).toBe(1000);
    });

    it('goes 1000 above the first item at the top', () => {
        expect(positionAt([1000, 2000], 0)).toBe(0);
    });

    it('takes the midpoint between two neighbours', () => {
        expect(positionAt([1000, 2000], 1)).toBe(1500);
    });

    it('goes 1000 below the last item at the bottom', () => {
        expect(positionAt([1000, 2000], 2)).toBe(3000);
    });

    it('treats an index past the end as the bottom', () => {
        expect(positionAt([1000], 99)).toBe(2000);
    });

    it('returns null when the neighbours are too close', () => {
        expect(positionAt([1000, 1000 + 1e-7], 1)).toBeNull();
    });
});
