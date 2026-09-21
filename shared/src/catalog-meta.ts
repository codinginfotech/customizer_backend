import { z } from 'zod';

/**
 * Catalog metadata — merchandising tags, physical metadata, and production
 * (print-method) configuration. Stored as JSON columns on products so new
 * product types never require code changes.
 */

export const productTagSchema = z.enum([
  'new',
  'popular',
  'best_seller',
  'trending',
  'premium',
  'eco',
  'customizable',
  'featured',
]);
export type ProductTag = z.infer<typeof productTagSchema>;

export const printMethodSchema = z.enum([
  'dtg',
  'dtf',
  'sublimation',
  'screen_print',
  'embroidery',
  'uv_print',
  'laser_engraving',
  'etching',
  'vinyl',
]);
export type PrintMethod = z.infer<typeof printMethodSchema>;

/**
 * Production-aware design rules. These live in configuration (not the
 * frontend) so different print methods can constrain the editor and the
 * pre-cart validator. Embroidery-specific fields are architecture seams for
 * a future embroidery engine (§63) — validated but not yet enforced beyond
 * the generic rules.
 */
export const productionRulesSchema = z.object({
  minTextPx: z.number().min(0).max(200).default(10),
  minStrokePx: z.number().min(0).max(50).default(0),
  maxColors: z.number().int().min(0).max(64).default(0), // 0 = unlimited
  minImageDpi: z.number().min(0).max(1200).default(90),
  /** Embroidery seams (future engine). */
  embroidery: z
    .object({
      maxThreadColors: z.number().int().min(1).max(15).default(8),
      minStitchMm: z.number().min(0.1).max(10).default(1),
    })
    .optional(),
});
export type ProductionRules = z.infer<typeof productionRulesSchema>;

export const productMetadataSchema = z.object({
  material: z.string().max(200).optional(),
  careInstructions: z.string().max(1000).optional(),
  productionMethod: z.string().max(200).optional(),
  sizeInformation: z.string().max(1000).optional(),
  weightGrams: z.number().positive().max(100000).optional(),
  dimensions: z.string().max(200).optional(),
  shippingClass: z.enum(['standard', 'bulky', 'fragile']).optional(),
});
export type ProductMetadata = z.infer<typeof productMetadataSchema>;

// ---------------------------------------------------------------------------
// Pre-cart design validation (shared between editor UI and server)
// ---------------------------------------------------------------------------

export type ValidationLevel = 'ok' | 'warn' | 'error';

export interface DesignValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  areaKey?: string;
  elementId?: string;
}

export type ProductionReadiness = 'READY' | 'WARNING' | 'NOT_READY';

export function readinessFromIssues(issues: DesignValidationIssue[]): ProductionReadiness {
  if (issues.some((i) => i.level === 'error')) return 'NOT_READY';
  if (issues.some((i) => i.level === 'warn')) return 'WARNING';
  return 'READY';
}

/** Minimal area shape the validator needs (subset of the API PrintArea). */
export interface ValidatableArea {
  key: string;
  name: string;
  width: number;
  height: number;
  safeArea: { x: number; y: number; width: number; height: number };
  physicalWidthIn?: number | null;
}

interface ValidatableElement {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  visible?: boolean;
  opacity?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  lineHeight?: number;
  text?: string;
  naturalWidth?: number;
  src?: string;
}

function elementBox(el: ValidatableElement): { w: number; h: number } {
  if (el.type === 'text') {
    const lines = (el.text ?? '').split('\n').length;
    return { w: el.width ?? 0, h: lines * (el.fontSize ?? 0) * (el.lineHeight ?? 1.2) };
  }
  return { w: el.width ?? 0, h: el.height ?? 0 };
}

function rotatedBounds(el: ValidatableElement) {
  const { w, h } = elementBox(el);
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pts = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([px, py]) => [el.x + px * cos - py * sin, el.y + px * sin + py * cos]);
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

/**
 * Production validation engine (§44/§45): evaluates a design document
 * against print-area geometry and production rules. Pure and shared, so the
 * editor's pre-cart check and any server-side re-check agree exactly.
 */
export function validateDesignDocument(
  doc: { areas: Array<{ areaKey: string; elements: ValidatableElement[] }> },
  areas: ValidatableArea[],
  rules?: Partial<ProductionRules> | null,
): DesignValidationIssue[] {
  const resolved = productionRulesSchema.parse(rules ?? {});
  const issues: DesignValidationIssue[] = [];
  let totalElements = 0;

  for (const area of doc.areas) {
    const config = areas.find((a) => a.key === area.areaKey);
    if (!config) continue;
    for (const el of area.elements) {
      if (el.visible === false) continue;
      totalElements += 1;
      const bounds = rotatedBounds(el);
      const safe = config.safeArea;
      if (
        bounds.minX < safe.x ||
        bounds.minY < safe.y ||
        bounds.maxX > safe.x + safe.width ||
        bounds.maxY > safe.y + safe.height
      ) {
        const fullyOutside =
          bounds.maxX < 0 || bounds.maxY < 0 || bounds.minX > config.width || bounds.minY > config.height;
        issues.push({
          level: fullyOutside ? 'error' : 'warn',
          code: fullyOutside ? 'OUTSIDE_CANVAS' : 'OUTSIDE_SAFE_AREA',
          message: fullyOutside
            ? `An element on ${config.name} is completely outside the print area`
            : `An element on ${config.name} crosses the safe print margin`,
          areaKey: area.areaKey,
          elementId: el.id,
        });
      }
      if (el.type === 'text' && (el.fontSize ?? 99) < resolved.minTextPx) {
        issues.push({
          level: 'warn',
          code: 'TEXT_TOO_SMALL',
          message: `Text on ${config.name} is smaller than ${resolved.minTextPx}px and may not print cleanly`,
          areaKey: area.areaKey,
          elementId: el.id,
        });
      }
      if (
        el.type === 'image' &&
        el.naturalWidth &&
        el.width &&
        config.physicalWidthIn &&
        !(el.src ?? '').endsWith('.svg')
      ) {
        const physicalElementWidthIn = (el.width / config.width) * config.physicalWidthIn;
        const dpi = physicalElementWidthIn > 0 ? el.naturalWidth / physicalElementWidthIn : 0;
        if (dpi > 0 && dpi < resolved.minImageDpi) {
          issues.push({
            level: dpi < resolved.minImageDpi * 0.6 ? 'error' : 'warn',
            code: 'LOW_RESOLUTION',
            message: `An image on ${config.name} prints at ~${Math.round(dpi)} DPI (minimum ${resolved.minImageDpi})`,
            areaKey: area.areaKey,
            elementId: el.id,
          });
        }
      }
      if ((el.opacity ?? 1) < 0.05) {
        issues.push({
          level: 'warn',
          code: 'NEARLY_INVISIBLE',
          message: `An element on ${config.name} is nearly transparent`,
          areaKey: area.areaKey,
          elementId: el.id,
        });
      }
    }
  }

  if (totalElements === 0) {
    issues.push({ level: 'error', code: 'EMPTY_DESIGN', message: 'The design has no visible elements' });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Analytics event names (typed, privacy-safe; no free-form PII payloads)
// ---------------------------------------------------------------------------

export const ANALYTICS_EVENTS = [
  'product_viewed',
  'customizer_opened',
  'design_started',
  'asset_uploaded',
  'design_saved',
  'preview_3d_used',
  'part_clicked',
  'template_applied',
  'design_transferred',
  'added_to_cart',
  'checkout_started',
  'order_completed',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
