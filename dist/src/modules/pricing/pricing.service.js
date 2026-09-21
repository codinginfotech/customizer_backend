"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingService = exports.PricingService = void 0;
const shared_1 = require("@cpd/shared");
const misc_1 = require("../../utils/misc");
/**
 * Modular pricing engine. All money math happens server-side; the client
 * only ever displays what this service returns. Rules are configured per
 * product (JSON column) and validated against the shared PricingRules schema.
 */
class PricingService {
    resolveRules(raw) {
        const parsed = shared_1.pricingRulesSchema.safeParse(raw ?? {});
        if (parsed.success)
            return parsed.data;
        return shared_1.pricingRulesSchema.parse({});
    }
    /**
     * @param basePrice product base price or variant override
     * @param design the design document (null = blank product)
     */
    quote(basePrice, rules, design, quantity) {
        const printedAreas = design ? (0, shared_1.countPrintedAreas)(design) : 0;
        const elementCount = design ? (0, shared_1.countElements)(design) : 0;
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
        const unitPrice = (0, misc_1.round2)(rawUnit * (1 - discountPct / 100));
        return {
            unitBasePrice: (0, misc_1.round2)(basePrice),
            customizationFee: (0, misc_1.round2)(customizationFee),
            printedAreas,
            elementCount,
            quantity,
            discountPct,
            unitPrice,
            totalPrice: (0, misc_1.round2)(unitPrice * quantity),
        };
    }
    discountFor(rules, quantity) {
        const tiers = [...rules.quantityTiers].sort((a, b) => b.minQty - a.minQty);
        const tier = tiers.find((t) => quantity >= t.minQty);
        return tier?.discountPct ?? 0;
    }
    /** Cart/order totals from already-priced line items. */
    totals(lineTotals, taxRate, flatShipping, freeShippingThreshold) {
        const subtotal = (0, misc_1.round2)(lineTotals.reduce((a, b) => a + b, 0));
        const shipping = subtotal === 0 || subtotal >= freeShippingThreshold ? 0 : flatShipping;
        const tax = (0, misc_1.round2)(subtotal * taxRate);
        return { subtotal, tax, shipping: (0, misc_1.round2)(shipping), total: (0, misc_1.round2)(subtotal + tax + shipping) };
    }
}
exports.PricingService = PricingService;
exports.pricingService = new PricingService();
//# sourceMappingURL=pricing.service.js.map