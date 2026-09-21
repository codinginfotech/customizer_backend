import { z } from 'zod';

/**
 * Product configuration schemas — everything that makes the platform
 * product-template driven instead of product-specific. Administrators
 * configure these per product; the designer renders from configuration.
 */

/** Safe printable region inside a print-area canvas (canvas pixels). */
export const safeAreaSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type SafeArea = z.infer<typeof safeAreaSchema>;

/**
 * Where a print area sits on the 2D mockup image, in percentages of the
 * base image (0–100). Used by the mockup preview for products without 3D.
 */
export const mockupPlacementSchema = z.object({
  left: z.number().min(0).max(100),
  top: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  /** Optional perspective skew in degrees for a hint of realism. */
  rotate: z.number().min(-45).max(45).default(0),
});
export type MockupPlacement = z.infer<typeof mockupPlacementSchema>;

/**
 * How the print-area canvas maps onto the 3D model texture space.
 * The area canvas is drawn into a texture; `repeat`/`offset` allow placing
 * the area within a larger UV space when a mesh hosts several areas.
 */
export const textureConfigSchema = z.object({
  /** Base texture canvas size in px (power of two recommended). */
  textureSize: z.number().int().min(256).max(4096).default(1024),
  /** Placement of the area canvas within the texture, 0–1 UV space. */
  u: z.number().min(0).max(1).default(0),
  v: z.number().min(0).max(1).default(0),
  uWidth: z.number().min(0).max(1).default(1),
  vHeight: z.number().min(0).max(1).default(1),
  flipY: z.boolean().default(true),
});
export type TextureConfig = z.infer<typeof textureConfigSchema>;

/**
 * How the design reaches the product surface. The asset generator / model
 * author bakes the chosen projection into the zone mesh's UVs; at runtime the
 * renderer always consumes UVs ('uv' is the only runtime path — planar,
 * cylinder and sphere describe how those UVs were authored). 'decal' is
 * reserved for the future runtime decal projector and is rejected by
 * validation until implemented.
 */
export const surfaceProjectionSchema = z.enum(['uv', 'planar', 'cylinder', 'sphere', 'decal']);
export type SurfaceProjection = z.infer<typeof surfaceProjectionSchema>;

export const printAreaConfigSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  width: z.number().int().min(50).max(4000),
  height: z.number().int().min(50).max(4000),
  maxDesignWidth: z.number().int().positive().optional(),
  maxDesignHeight: z.number().int().positive().optional(),
  bleed: z.number().min(0).max(200).default(0),
  safeArea: safeAreaSchema,
  /** Physical print size in inches — used for DPI quality estimation. */
  physicalWidthIn: z.number().positive().max(200).optional(),
  physicalHeightIn: z.number().positive().max(200).optional(),
  mockup: mockupPlacementSchema.optional(),
  /** Mesh in the 3D model that displays this area (if any). */
  modelMeshName: z.string().max(100).optional(),
  textureConfig: textureConfigSchema.optional(),
  projection: surfaceProjectionSchema.default('uv'),
  sortOrder: z.number().int().default(0),
});
export type PrintAreaConfig = z.infer<typeof printAreaConfigSchema>;

/** Placeholder primitives for products without an uploaded GLB yet. */
export const primitiveKindSchema = z.enum([
  'apparel', // curved front/back panels — t-shirts, hoodies, jackets
  'mug', // cylinder + handle
  'bottle', // capsule cylinder + cap
  'cylinder', // generic wrap (tumblers, containers)
  'flat', // flat panel (posters, mouse pads, phone cases)
  'box', // boxes / containers
  'pan', // shallow cylinder + handle bar
]);
export type PrimitiveKind = z.infer<typeof primitiveKindSchema>;

/**
 * Reusable physically-based material presets. The 3D engine maps each name to
 * concrete MeshPhysicalMaterial parameters (roughness, metalness, clearcoat,
 * sheen, procedural fabric normal maps, …). Product configuration assigns
 * presets to meshes — never hardcode material params per product in code.
 */
export const materialPresetSchema = z.enum([
  'cotton',
  'heavy_cotton',
  'polyester',
  'denim',
  'leather',
  'canvas',
  'ceramic',
  'glass',
  'metal',
  'brushed_metal',
  'stainless_steel',
  'plastic_gloss',
  'plastic_matte',
  'rubber',
  'paper',
  'wood',
  'silicone',
]);
export type MaterialPreset = z.infer<typeof materialPresetSchema>;

export const meshBindingSchema = z.object({
  /** Mesh name inside the GLTF scene (or primitive part name). */
  mesh: z.string().min(1).max(100),
  /** Print-area key rendered onto this mesh. */
  areaKey: z.string().min(1).max(64),
  /**
   * surface: the mesh IS the printable surface — texture background is the
   *   product color (mug body, phone-case back).
   * overlay: the mesh is a conforming patch above a colored surface — the
   *   texture background is transparent so the base material shows through
   *   (apparel print zones).
   */
  mode: z.enum(['surface', 'overlay']).default('surface'),
});
export type MeshBinding = z.infer<typeof meshBindingSchema>;

/** A named camera view in orbit coordinates around the product. */
export const cameraViewSchema = z.object({
  /** Horizontal angle in degrees, 0 = front (+z), 90 = right. */
  azimuth: z.number().min(-360).max(360),
  /** Vertical angle in degrees from the pole; 90 = level with the product. */
  polar: z.number().min(1).max(179).default(80),
  /** Distance multiplier relative to the fitted framing distance. */
  zoom: z.number().min(0.3).max(4).default(1),
});
export type CameraView = z.infer<typeof cameraViewSchema>;

/**
 * Rigid transform applied to an imported model whose axes or origin do not
 * match the contract — Z-up DCC exports, off-origin scans, wrong unit scale.
 * Applied before framing, so the camera rig still auto-fits.
 */
export const modelTransformSchema = z.object({
  /** Euler XYZ in DEGREES. A Z-up export needs [-90, 0, 0]. */
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.number().positive().max(1000).default(1),
  /** Recentre the bounding box on the origin after rotating. */
  autoCenter: z.boolean().default(true),
});
export type ModelTransform = z.infer<typeof modelTransformSchema>;

/**
 * A print area projected onto arbitrary geometry as a decal, for models that
 * ship without authored `zone_<areaKey>` meshes (stock or scanned assets).
 * Coordinates are in the model's local space AFTER `transform` is applied.
 */
export const decalZoneSchema = z.object({
  /** Centre of the projector box. */
  position: z.tuple([z.number(), z.number(), z.number()]),
  /** Projector orientation, Euler XYZ in DEGREES. [0,0,0] projects along -Z (front). */
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  /** Projector box size [width, height, depth]; depth must span the surface. */
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  /**
   * Aim the projector at a point instead of by Euler angles. Far easier to
   * get right on a curved part: put the position just off the surface and the
   * target at the part centre. Overrides `rotation` when present.
   */
  lookAt: z.tuple([z.number(), z.number(), z.number()]).optional(),
  /** Restrict projection to one mesh; defaults to every mesh in the model. */
  targetMesh: z.string().max(100).optional(),
});
export type DecalZone = z.infer<typeof decalZoneSchema>;

export const lightingPresetSchema = z.enum([
  'studio',
  'soft',
  'product',
  'high_contrast',
  'neutral',
  'dark_studio',
]);
export type LightingPreset = z.infer<typeof lightingPresetSchema>;

export const modelConfigurationSchema = z.object({
  type: z.enum(['GLTF', 'PRIMITIVE']),
  primitive: z
    .object({
      kind: primitiveKindSchema,
      /** Rough dimensions in scene units (meters). */
      width: z.number().positive().default(1),
      height: z.number().positive().default(1),
      depth: z.number().positive().default(0.3),
    })
    .optional(),
  /** Which meshes take which print-area textures. */
  meshBindings: z.array(meshBindingSchema).default([]),
  /** Mesh names tinted with the selected product color. */
  colorMeshes: z.array(z.string()).default([]),
  /** Mesh name → material preset (falls back to metalness/roughness below). */
  materials: z.record(z.string().max(100), materialPresetSchema).default({}),
  /**
   * Mesh name → artwork texture URL (PNG/SVG) applied as the base map —
   * sublimated jerseys, patterned fabrics, printed shells. The artwork wraps
   * via the mesh's authored UVs. Meshes with a base texture ignore product
   * color tinting unless also listed in colorMeshes (then the color
   * multiplies the artwork — author white regions to receive the tint).
   */
  baseTextures: z.record(z.string().max(100), z.string().max(500)).default({}),
  /** Mesh name → human label used by click-to-select and the admin studio. */
  partLabels: z.record(z.string().max(100), z.string().max(80)).default({}),
  /** Named camera views; missing names fall back to computed defaults. */
  cameraViews: z.record(z.string().max(40), cameraViewSchema).default({}),
  /**
   * Print areas projected as decals onto arbitrary geometry, keyed by areaKey.
   * Used when the asset has no `zone_<areaKey>` meshes; authored zone meshes
   * always win where both exist.
   */
  decalZones: z.record(z.string().max(100), decalZoneSchema).default({}),
  /** Axis/origin/scale correction for imported assets. */
  transform: modelTransformSchema.default({ rotation: [0, 0, 0], scale: 1, autoCenter: true }),
  /**
   * Keep the normal / roughness / AO / metalness maps authored into the GLB
   * instead of substituting a procedural preset. Set this for photoreal
   * assets; the presets remain the fallback wherever a map is absent.
   */
  preserveMaterials: z.boolean().default(false),
  lighting: lightingPresetSchema.default('studio'),
  /** Initial camera distance multiplier. */
  cameraDistance: z.number().positive().max(20).default(2.2),
  metalness: z.number().min(0).max(1).default(0.05),
  roughness: z.number().min(0).max(1).default(0.85),
});
export type ModelConfiguration = z.infer<typeof modelConfigurationSchema>;

/** Naming contract for authored GLBs: printable zones are `zone_<areaKey>`. */
export const ZONE_MESH_PREFIX = 'zone_';
export function zoneMeshName(areaKey: string): string {
  return `${ZONE_MESH_PREFIX}${areaKey}`;
}
export function areaKeyFromMesh(meshName: string): string | null {
  return meshName.startsWith(ZONE_MESH_PREFIX) ? meshName.slice(ZONE_MESH_PREFIX.length) : null;
}

// ---------------------------------------------------------------------------
// 3D asset validation (populated by the backend ingestion pipeline)
// ---------------------------------------------------------------------------

export const modelValidationCheckSchema = z.object({
  level: z.enum(['ok', 'warn', 'error']),
  code: z.string().max(60),
  message: z.string().max(300),
});

export const modelValidationReportSchema = z.object({
  valid: z.boolean(),
  /** 0–100 internal quality score. */
  score: z.number().min(0).max(100),
  stats: z.object({
    fileBytes: z.number().int().nonnegative(),
    meshCount: z.number().int().nonnegative(),
    materialCount: z.number().int().nonnegative(),
    triangleCount: z.number().int().nonnegative(),
    textureCount: z.number().int().nonnegative(),
    maxTextureSize: z.number().int().nonnegative(),
    hasUVs: z.boolean(),
    hasNormals: z.boolean(),
    hasAnimations: z.boolean(),
    zoneMeshes: z.array(z.string()),
    meshNames: z.array(z.string()),
    materialNames: z.array(z.string()),
  }),
  checks: z.array(modelValidationCheckSchema),
  generatedAt: z.string(),
});
export type ModelValidationReport = z.infer<typeof modelValidationReportSchema>;

/** Pricing rules stored per product (JSON column), consumed by the backend pricing engine. */
export const pricingRulesSchema = z.object({
  /** Flat fee added per printed area beyond the first. */
  extraAreaFee: z.number().min(0).default(2.5),
  /** Fee for the first printed area (customization fee). */
  firstAreaFee: z.number().min(0).default(0),
  /** Fee per design element beyond the included count. */
  perElementFee: z.number().min(0).default(0.2),
  includedElements: z.number().int().min(0).default(3),
  /** Quantity discount tiers, evaluated highest minQty first. */
  quantityTiers: z
    .array(
      z.object({
        minQty: z.number().int().min(1),
        discountPct: z.number().min(0).max(90),
      }),
    )
    .default([
      { minQty: 10, discountPct: 5 },
      { minQty: 25, discountPct: 10 },
      { minQty: 50, discountPct: 15 },
      { minQty: 100, discountPct: 20 },
    ]),
});
export type PricingRules = z.infer<typeof pricingRulesSchema>;

export interface PriceBreakdown {
  unitBasePrice: number;
  customizationFee: number;
  printedAreas: number;
  elementCount: number;
  quantity: number;
  discountPct: number;
  unitPrice: number;
  totalPrice: number;
}
