/** Consistent API envelope used by every backend response. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFailure {
  success: false;
  message: string;
  code: string;
  details?: unknown;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type Role = 'USER' | 'ADMIN';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

/** Image print-quality rating derived from effective DPI. */
export type PrintQuality = 'good' | 'acceptable' | 'low';

export function ratePrintQuality(dpi: number): PrintQuality {
  if (dpi >= 150) return 'good';
  if (dpi >= 90) return 'acceptable';
  return 'low';
}

/**
 * Effective DPI of an image element placed on a print area.
 * naturalWidth: source image pixels; displayWidth: canvas px it is stretched
 * to; areaWidth: canvas px of the full area; physicalWidthIn: the physical
 * print width of that area in inches.
 */
export function estimateDpi(
  naturalWidth: number,
  displayWidth: number,
  areaWidth: number,
  physicalWidthIn: number,
): number {
  if (displayWidth <= 0 || areaWidth <= 0 || physicalWidthIn <= 0) return 0;
  const physicalElementWidthIn = (displayWidth / areaWidth) * physicalWidthIn;
  if (physicalElementWidthIn <= 0) return 0;
  return Math.round(naturalWidth / physicalElementWidthIn);
}
