import { describe, expect, it } from 'vitest';
import {
  createEmptyDesign,
  designDocumentSchema,
  estimateDpi,
  ratePrintQuality,
} from '@cpd/shared';

describe('design document schema', () => {
  it('accepts a valid document with mixed element types', () => {
    const doc = {
      version: 1,
      productId: 1,
      variantId: 2,
      productColor: '#ffffff',
      areas: [
        {
          areaKey: 'front',
          elements: [
            {
              id: 'e1', type: 'text', text: 'HELLO', x: 10, y: 20, rotation: 0, opacity: 1,
              locked: false, visible: true, flipX: false, flipY: false,
              fontFamily: 'Inter', fontSize: 40, fontWeight: 700, fontStyle: 'normal',
              underline: false, letterSpacing: 0, lineHeight: 1.2, align: 'center',
              fill: '#000000', width: 300, curve: 0,
            },
            {
              id: 'e2', type: 'image', src: '/uploads/assets/1/x.png', x: 0, y: 0,
              width: 100, height: 80, rotation: 15, opacity: 0.9,
              locked: false, visible: true, flipX: true, flipY: false,
            },
          ],
        },
      ],
    };
    const parsed = designDocumentSchema.parse(doc);
    expect(parsed.areas[0].elements).toHaveLength(2);
  });

  it('rejects unknown element types', () => {
    const doc = createEmptyDesign(1, null, ['front']);
    (doc.areas[0].elements as unknown[]).push({ id: 'x', type: 'video', x: 0, y: 0 });
    expect(designDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects out-of-range opacity', () => {
    const result = designDocumentSchema.safeParse({
      version: 1,
      productId: 1,
      variantId: null,
      productColor: '#fff',
      areas: [
        {
          areaKey: 'front',
          elements: [
            {
              id: 'e1', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10,
              rotation: 0, opacity: 4, locked: false, visible: true, flipX: false, flipY: false,
              fill: '#000', stroke: '', strokeWidth: 0, cornerRadius: 0,
              sides: 5, points: 5, innerRadiusRatio: 0.5,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('DPI estimation', () => {
  it('computes effective DPI from placement size', () => {
    // 800px image at full width of a 12in-wide area = 800/12 ≈ 67 DPI
    expect(estimateDpi(800, 450, 450, 12)).toBe(67);
    // Same image at a third of the width prints 3× denser
    expect(estimateDpi(800, 150, 450, 12)).toBe(200);
  });

  it('rates quality bands', () => {
    expect(ratePrintQuality(300)).toBe('good');
    expect(ratePrintQuality(120)).toBe('acceptable');
    expect(ratePrintQuality(60)).toBe('low');
  });

  it('handles degenerate values without dividing by zero', () => {
    expect(estimateDpi(800, 0, 450, 12)).toBe(0);
    expect(estimateDpi(800, 100, 450, 0)).toBe(0);
  });
});
