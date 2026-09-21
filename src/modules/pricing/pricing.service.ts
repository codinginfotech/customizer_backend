import {
  countElements,
  countPrintedAreas,
  DesignDocument,
  PriceBreakdown,
  PricingRules,
  pricingRulesSchema,
} from '@cpd/shared';
import { round2 } from '../../utils/misc';

/**
 * Modular pricing engine. All money math happens server-side; the client
 * only ever displays what this service returns. Rules are configured per
 * product (JSON column) and validated against the shared PricingRules schema.
 */
export class PricingService {
  resolveRules(raw: unknown): PricingRules {
    const parsed = pricingRulesSchema.safeParse(raw ?? {});
    if (parsed.success) return parsed.data;
    return pricingRulesSchema.parse({});
  }

  /**
   * @param basePrice product base price or variant override
   * @param design the design document (null = blank product)
   */
  quote(
    basePrice: number,
    rules: PricingRules,
    design: DesignDocument | null,
    quantity: number,
  ): PriceBreakdown {
    const printedAreas = design ? countPrintedAreas(design) : 0;
    const elementCount = design ? countElements(design) : 0;

    let customizationFee = 0;
    if (printedAreas > 0) {
      customizationFee += rules.firstAreaFee;
      customizationFee += (printedAreas - 1) * rules.extraAreaFee;
    }
    if (elementCount > rules.includedElements) {
      customizationFee += (elementCount - rules.includedElements) * rules.perElementFee;
    }

    const discountPct = this.discountFor(rules, quantity);
    const rawUnit = basePrice + customizationFee;
    const unitPrice = round2(rawUnit * (1 - discountPct / 100));

    return {
      unitBasePrice: round2(basePrice),
      customizationFee: round2(customizationFee),
      printedAreas,
      elementCount,
      quantity,
      discountPct,
      unitPrice,
      totalPrice: round2(unitPrice * quantity),
    };
  }

  discountFor(rules: PricingRules, quantity: number): number {
    const tiers = [...rules.quantityTiers].sort((a, b) => b.minQty - a.minQty);
    const tier = tiers.find((t) => quantity >= t.minQty);
    return tier?.discountPct ?? 0;
  }

  /** Cart/order totals from already-priced line items. */
  totals(lineTotals: number[], taxRate: number, flatShipping: number, freeShippingThreshold: number) {
    const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0));
    const shipping = subtotal === 0 || subtotal >= freeShippingThreshold ? 0 : flatShipping;
    const tax = round2(subtotal * taxRate);
    return { subtotal, tax, shipping: round2(shipping), total: round2(subtotal + tax + shipping) };
  }
}

export const pricingService = new PricingService();
