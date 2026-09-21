import { z } from 'zod';

/**
 * Design JSON — the single normalized design state shared by the 2D editor,
 * the 3D preview, the mockup preview, persistence and production export.
 *
 * Coordinate system: each print area has its own canvas of `width × height`
 * pixels (defined by the product's print-area configuration). Element `x`/`y`
 * are the TOP-LEFT corner in that space; `rotation` is degrees clockwise
 * around the top-left corner (Konva's default transform origin).
 */

export const DESIGN_SCHEMA_VERSION = 1;

/**
 * Element effects. Every effect here is implemented identically in ALL THREE
 * renderers (Konva editor, canvas rasterizer, server SVG exporter) — an
 * effect that cannot be reproduced in the production renderer must not be
 * added to this schema (§22 of the platform spec).
 */
export const shadowEffectSchema = z.object({
  color: z.string().max(30).default('#000000'),
  blur: z.number().min(0).max(120).default(8),
  offsetX: z.number().min(-200).max(200).default(4),
  offsetY: z.number().min(-200).max(200).default(4),
  opacity: z.number().min(0).max(1).default(0.4),
});
export type ShadowEffect = z.infer<typeof shadowEffectSchema>;

const baseElement = z.object({
  id: z.string().min(1).max(64),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  shadow: shadowEffectSchema.nullable().default(null),
});

export const textElementSchema = baseElement.extend({
  type: z.literal('text'),
  text: z.string().max(2000),
  fontFamily: z.string().max(100).default('Inter'),
  fontSize: z.number().min(4).max(600).default(40),
  fontWeight: z.number().int().min(100).max(900).default(400),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  underline: z.boolean().default(false),
  uppercase: z.boolean().default(false),
  letterSpacing: z.number().min(-20).max(100).default(0),
  lineHeight: z.number().min(0.5).max(4).default(1.2),
  align: z.enum(['left', 'center', 'right']).default('center'),
  fill: z.string().max(30).default('#111111'),
  /** Text outline (stroke). Empty string = none. */
  stroke: z.string().max(30).default(''),
  strokeWidth: z.number().min(0).max(40).default(0),
  width: z.number().positive().max(10000),
  /**
   * Arc bend, -100..100. 0 = straight; positive bends upward (smile),
   * negative downward. Applies to single-line text; the arc sweeps up to
   * ±180° at |100|.
   */
  curve: z.number().min(-100).max(100).default(0),
});

/** The string a renderer must draw for a text element (case transform applied). */
export function renderedText(el: { text: string; uppercase?: boolean }): string {
  return el.uppercase ? el.text.toUpperCase() : el.text;
}

/**
 * Curved-text arc geometry, shared by the Konva editor, the canvas
 * rasterizer and the server-side SVG exporter so all three bend text
 * identically. The text's width is treated as the arc length; |curve|=100
 * bends a half-circle. Coordinates are in the element's local space
 * (origin at the element's top-left, like straight text).
 */
export interface TextArc {
  /** Arc radius in px. */
  radius: number;
  /** Total sweep in radians (positive value). */
  sweep: number;
  /** Arc center (local coords). */
  cx: number;
  cy: number;
  /** True when text bends upward (smile); false for downward (frown). */
  up: boolean;
}

export function computeTextArc(width: number, fontSize: number, curve: number): TextArc | null {
  if (!curve || Math.abs(curve) < 1) return null;
  const sweep = (Math.abs(curve) / 100) * Math.PI;
  const radius = width / sweep;
  const up = curve > 0;
  // Baseline reference: straight text's first-line baseline sits at
  // fontSize*0.8 below the top. Place the arc so the text's horizontal
  // center passes through that baseline.
  const cy = up ? fontSize * 0.8 + radius : fontSize * 0.8 - radius;
  return { radius, sweep, cx: width / 2, cy, up };
}

export const imageElementSchema = baseElement.extend({
  type: z.literal('image'),
  src: z.string().max(2048),
  width: z.number().positive().max(10000),
  height: z.number().positive().max(10000),
  naturalWidth: z.number().positive().optional(),
  naturalHeight: z.number().positive().optional(),
  assetId: z.number().int().positive().optional(),
  crop: z
    .object({
      x: z.number().min(0),
      y: z.number().min(0),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
});

export const shapeKindSchema = z.enum([
  'rect',
  'circle',
  'triangle',
  'line',
  'polygon',
  'star',
]);

export const shapeElementSchema = baseElement.extend({
  type: z.literal('shape'),
  shape: shapeKindSchema,
  width: z.number().positive().max(10000),
  height: z.number().positive().max(10000),
  fill: z.string().max(30).default('#2563eb'),
  stroke: z.string().max(30).default(''),
  strokeWidth: z.number().min(0).max(200).default(0),
  cornerRadius: z.number().min(0).max(500).default(0),
  sides: z.number().int().min(3).max(24).default(5),
  points: z.number().int().min(3).max(24).default(5),
  innerRadiusRatio: z.number().min(0.05).max(0.95).default(0.5),
});

export const designElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
]);

export const designAreaSchema = z.object({
  areaKey: z.string().min(1).max(64),
  elements: z.array(designElementSchema).max(200),
});

export const designDocumentSchema = z.object({
  version: z.literal(DESIGN_SCHEMA_VERSION).default(DESIGN_SCHEMA_VERSION),
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().default(null),
  productColor: z.string().max(30).default('#ffffff'),
  areas: z.array(designAreaSchema).max(30),
});

export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type ShapeElement = z.infer<typeof shapeElementSchema>;
export type ShapeKind = z.infer<typeof shapeKindSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignArea = z.infer<typeof designAreaSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;

export function createEmptyDesign(
  productId: number,
  variantId: number | null,
  areaKeys: string[],
  productColor = '#ffffff',
): DesignDocument {
  return {
    version: DESIGN_SCHEMA_VERSION,
    productId,
    variantId,
    productColor,
    areas: areaKeys.map((areaKey) => ({ areaKey, elements: [] })),
  };
}

/** Count non-empty areas — used by the pricing engine. */
export function countPrintedAreas(doc: DesignDocument): number {
  return doc.areas.filter((a) => a.elements.length > 0).length;
}

/** Total element count — a proxy for design complexity in pricing. */
export function countElements(doc: DesignDocument): number {
  return doc.areas.reduce((sum, a) => sum + a.elements.length, 0);
}
