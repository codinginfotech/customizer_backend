import { z } from 'zod';
import type { DesignDocument } from './design';

/**
 * Shopify app contracts shared by the API, the embedded admin and the
 * storefront customizer page. Everything a merchant can configure lives in
 * `ShopifySettings`; everything the theme extension needs to render the
 * "Customize" button comes back as `StorefrontProductConfig`.
 */

export const SHOPIFY_LAUNCH_MODES = ['modal', 'page'] as const;
export type ShopifyLaunchMode = (typeof SHOPIFY_LAUNCH_MODES)[number];

export const shopifySettingsSchema = z.object({
  /** Text on the storefront button. */
  buttonLabel: z.string().trim().min(1).max(60).default('Customize this product'),
  /** modal = customizer opens in an overlay iframe; page = full-page redirect. */
  launchMode: z.enum(SHOPIFY_LAUNCH_MODES).default('modal'),
  /** Show the composite preview image as a visible line-item property. */
  showPreviewInCart: z.boolean().default(true),
  /** Which DPI the merchant downloads production files at by default. */
  productionDpi: z.number().int().min(72).max(600).default(300),
  /** Require at least one element before "Add to cart" is enabled. */
  requireDesign: z.boolean().default(true),
});
export type ShopifySettings = z.infer<typeof shopifySettingsSchema>;
export const DEFAULT_SHOPIFY_SETTINGS: ShopifySettings = shopifySettingsSchema.parse({});

/** Cart line-item property keys. Underscore-prefixed keys are hidden by themes. */
export const SHOPIFY_LINE_ITEM_PROPS = {
  token: '_cpd_customization',
  preview: 'Design preview',
  hiddenPreview: '_cpd_preview',
  label: 'Customization',
} as const;

/** What the theme extension receives from the app proxy for one product. */
export interface StorefrontProductConfig {
  customizable: boolean;
  shopifyProductId: string;
  /** Customizer product the Shopify product is linked to (when customizable). */
  product: { id: number; slug: string; name: string } | null;
  settings: Pick<ShopifySettings, 'buttonLabel' | 'launchMode' | 'showPreviewInCart' | 'requireDesign'>;
  /** Absolute URL of the customizer page for this product (no variant yet). */
  customizeUrl: string | null;
}

/** Public shape of a storefront customization (never includes the edit key). */
export interface StorefrontCustomization {
  token: string;
  productId: number;
  variantId: number | null;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  designJson: DesignDocument;
  previewImage: string | null;
  status: 'DRAFT' | 'ORDERED';
  updatedAt: string;
}

/** Message the customizer iframe posts to the theme extension. */
export interface CustomizerAddToCartMessage {
  type: 'cpd:add-to-cart';
  token: string;
  previewUrl: string | null;
  shopifyVariantId: string | null;
  quantity: number;
}
export interface CustomizerCloseMessage {
  type: 'cpd:close';
}
export type CustomizerMessage = CustomizerAddToCartMessage | CustomizerCloseMessage;
