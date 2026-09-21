import { describe, expect, it } from 'vitest';
import { createEmptyDesign, DesignDocument, pricingRulesSchema } from '@cpd/shared';
import { PricingService } from '../src/modules/pricing/pricing.service';

const svc = new PricingService();
const defaultRules = pricingRulesSchema.parse({});

function designWith(elementsPerArea: Record<string, number>): DesignDocument {
  const doc = createEmptyDesign(1, null, Object.keys(elementsPerArea));
  doc.areas = doc.areas.map((a) => ({
    areaKey: a.areaKey,
    elements: Array.from({ length: elementsPerArea[a.areaKey] }, (_, i) => ({
      id: `el-${a.areaKey}-${i}`,
      type: 'shape' as const,
      shape: 'rect' as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      flipX: false,
      flipY: false,
      fill: '#000',
      stroke: '',
      strokeWidth: 0,
      cornerRadius: 0,
      sides: 5,
      points: 5,
      innerRadiusRatio: 0.5,
    })),
  }));
  return doc;
}

describe('PricingService.quote', () => {
  it('prices a blank product at base price', () => {
    const q = svc.quote(20, defaultRules, null, 1);
    expect(q.unitPrice).toBe(20);
    expect(q.totalPrice).toBe(20);
    expect(q.customizationFee).toBe(0);
    expect(q.printedAreas).toBe(0);
  });

  it('charges extra-area fees beyond the first printed area', () => {
    const design = designWith({ front: 1, back: 1, left_sleeve: 1 });
    const q = svc.quote(15, defaultRules, design, 1);
    // firstAreaFee(0) + 2 × extraAreaFee(2.5) = 5; 3 elements are included
    expect(q.printedAreas).toBe(3);
    expect(q.customizationFee).toBe(5);
    expect(q.unitPrice).toBe(20);
  });

  it('charges per-element fees above the included count', () => {
    const design = designWith({ front: 6 });
    const q = svc.quote(10, defaultRules, design, 1);
    // 6 elements, 3 included → 3 × 0.2 = 0.6 extra
    expect(q.customizationFee).toBeCloseTo(0.6, 5);
    expect(q.unitPrice).toBeCloseTo(10.6, 5);
  });

  it('applies the best quantity tier discount', () => {
    const q = svc.quote(10, defaultRules, null, 50);
    expect(q.discountPct).toBe(15);
    expect(q.unitPrice).toBe(8.5);
    expect(q.totalPrice).toBe(425);
  });

  it('ignores empty areas when counting printed areas', () => {
    const design = designWith({ front: 2, back: 0 });
    const q = svc.quote(10, defaultRules, design, 1);
    expect(q.printedAreas).toBe(1);
  });

  it('respects custom pricing rules', () => {
    const rules = pricingRulesSchema.parse({
      firstAreaFee: 3,
      extraAreaFee: 5,
      includedElements: 0,
      perElementFee: 1,
      quantityTiers: [],
    });
    const design = designWith({ front: 2, back: 1 });
    const q = svc.quote(10, rules, design, 200);
    // 3 + 5 + 3×1 = 11 fee; no tiers → no discount
    expect(q.customizationFee).toBe(11);
    expect(q.discountPct).toBe(0);
    expect(q.unitPrice).toBe(21);
  });
});

describe('PricingService.totals', () => {
  it('adds tax and flat shipping under the free-shipping threshold', () => {
    const t = svc.totals([20, 10], 0.1, 5.99, 75);
    expect(t.subtotal).toBe(30);
    expect(t.tax).toBe(3);
    expect(t.shipping).toBe(5.99);
    expect(t.total).toBe(38.99);
  });

  it('waives shipping above the threshold', () => {
    const t = svc.totals([80], 0.1, 5.99, 75);
    expect(t.shipping).toBe(0);
  });

  it('returns zeros for an empty cart', () => {
    const t = svc.totals([], 0.1, 5.99, 75);
    expect(t.total).toBe(0);
    expect(t.shipping).toBe(0);
  });
});
