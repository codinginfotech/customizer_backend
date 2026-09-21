import sharp from 'sharp';
import {
  computeTextArc,
  DesignDocument,
  DesignElement,
  ImageElement,
  renderedText,
  ShapeElement,
  TextElement,
} from '@cpd/shared';
import { prisma } from '../../lib/prisma';
import { storage } from '../../storage';
import { ApiError } from '../../utils/apiError';
import { dec } from '../../utils/misc';
import { env } from '../../config/env';

/**
 * Production export pipeline — completely separate from the browser preview.
 * Builds a print-resolution SVG from the design JSON for one print area and
 * rasterizes it with Sharp. Text uses system fonts on the server; for exact
 * brand fonts install them on the host (fontconfig) — see README.
 */

const BASE_SCREEN_DPI = 72; // design canvas px are treated as 72dpi units

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function elementTransform(el: DesignElement, w: number, h: number): string {
  const flip =
    el.flipX || el.flipY
      ? ` translate(${el.flipX ? w : 0} ${el.flipY ? h : 0}) scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1})`
      : '';
  return `translate(${el.x} ${el.y}) rotate(${el.rotation})${flip}`;
}

/** Per-element drop-shadow filter (mirrors the canvas/Konva shadow effect). */
function shadowFilter(el: DesignElement, defs: string[]): string {
  if (!el.shadow) return '';
  const id = `sh-${defs.length}-${el.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  defs.push(
    `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="${el.shadow.offsetX}" dy="${el.shadow.offsetY}" stdDeviation="${el.shadow.blur / 2}" flood-color="${escapeXml(el.shadow.color)}" flood-opacity="${el.shadow.opacity}"/></filter>`,
  );
  return ` filter="url(#${id})"`;
}

function textPaintAttrs(el: TextElement): string {
  const stroke =
    el.stroke && el.strokeWidth > 0
      ? ` stroke="${escapeXml(el.stroke)}" stroke-width="${el.strokeWidth}" stroke-linejoin="round" paint-order="stroke"`
      : '';
  return `font-family="${escapeXml(el.fontFamily)}, sans-serif" font-size="${el.fontSize}" font-weight="${el.fontWeight}" font-style="${el.fontStyle}" letter-spacing="${el.letterSpacing}" fill="${escapeXml(el.fill)}"${stroke}${el.underline ? ' text-decoration="underline"' : ''}`;
}

function renderText(el: TextElement, defs: string[]): string {
  const content = renderedText(el);
  const lines = content.split('\n');
  const lineHeightPx = el.fontSize * el.lineHeight;
  const filter = shadowFilter(el, defs);

  // Curved single-line text: SVG textPath along the shared arc geometry.
  const arc = lines.length === 1 ? computeTextArc(el.width, el.fontSize, el.curve) : null;
  if (arc) {
    const half = Math.PI * 0.98;
    const point = (theta: number) =>
      arc.up
        ? [arc.cx + arc.radius * Math.sin(theta), arc.cy - arc.radius * Math.cos(theta)]
        : [arc.cx + arc.radius * Math.sin(theta), arc.cy + arc.radius * Math.cos(theta)];
    const clamped = Math.min(arc.sweep / 2 + 0.2, half);
    const [sx, sy] = point(-clamped);
    const [ex, ey] = point(clamped);
    const large = clamped > Math.PI / 2 ? 1 : 0;
    const sweepFlag = arc.up ? 1 : 0;
    const pathId = `arc-${defs.length}-${el.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    defs.push(
      `<path id="${pathId}" d="M ${sx} ${sy} A ${arc.radius} ${arc.radius} 0 ${large} ${sweepFlag} ${ex} ${ey}" fill="none"/>`,
    );
    return `<g transform="${elementTransform(el, el.width, lineHeightPx)}" opacity="${el.opacity}"${filter}><text ${textPaintAttrs(el)}><textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapeXml(lines[0])}</textPath></text></g>`;
  }

  const anchor = el.align === 'left' ? 'start' : el.align === 'right' ? 'end' : 'middle';
  const anchorX = el.align === 'left' ? 0 : el.align === 'right' ? el.width : el.width / 2;
  const spans = lines
    .map((line, i) => {
      const y = i * lineHeightPx + el.fontSize * 0.8;
      return `<text x="${anchorX}" y="${y}" text-anchor="${anchor}" ${textPaintAttrs(el)}>${escapeXml(line)}</text>`;
    })
    .join('');
  const height = lines.length * lineHeightPx;
  return `<g transform="${elementTransform(el, el.width, height)}" opacity="${el.opacity}"${filter}>${spans}</g>`;
}

function renderShape(el: ShapeElement, defs: string[]): string {
  const { width: w, height: h } = el;
  const filter = shadowFilter(el, defs);
  const stroke = el.stroke
    ? ` stroke="${escapeXml(el.stroke)}" stroke-width="${el.strokeWidth}"`
    : '';
  const fill = ` fill="${escapeXml(el.fill)}"`;
  let body = '';
  switch (el.shape) {
    case 'rect':
      body = `<rect width="${w}" height="${h}" rx="${el.cornerRadius}"${fill}${stroke}/>`;
      break;
    case 'circle':
      body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"${fill}${stroke}/>`;
      break;
    case 'triangle':
      body = `<polygon points="${w / 2},0 ${w},${h} 0,${h}"${fill}${stroke}/>`;
      break;
    case 'line':
      body = `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${escapeXml(el.stroke || el.fill)}" stroke-width="${Math.max(el.strokeWidth, 2)}" stroke-linecap="round"/>`;
      break;
    case 'polygon': {
      const points: string[] = [];
      const rx = w / 2;
      const ry = h / 2;
      for (let i = 0; i < el.sides; i += 1) {
        const angle = (Math.PI * 2 * i) / el.sides - Math.PI / 2;
        points.push(`${rx + rx * Math.cos(angle)},${ry + ry * Math.sin(angle)}`);
      }
      body = `<polygon points="${points.join(' ')}"${fill}${stroke}/>`;
      break;
    }
    case 'star': {
      const points: string[] = [];
      const rx = w / 2;
      const ry = h / 2;
      const inner = el.innerRadiusRatio;
      for (let i = 0; i < el.points * 2; i += 1) {
        const angle = (Math.PI * i) / el.points - Math.PI / 2;
        const fx = i % 2 === 0 ? 1 : inner;
        points.push(`${rx + rx * fx * Math.cos(angle)},${ry + ry * fx * Math.sin(angle)}`);
      }
      body = `<polygon points="${points.join(' ')}"${fill}${stroke}/>`;
      break;
    }
  }
  return `<g transform="${elementTransform(el, w, h)}" opacity="${el.opacity}"${filter}>${body}</g>`;
}

/** Resolve an image src to a data URI. Only trusted origins are readable. */
async function resolveImageHref(src: string): Promise<string | null> {
  if (src.startsWith('data:image/')) {
    return src.length <= 4_000_000 ? src : null;
  }
  let key: string | null = null;
  if (src.startsWith('/uploads/')) {
    key = src.slice('/uploads/'.length);
  } else if (env.STORAGE_PUBLIC_URL && src.startsWith(env.STORAGE_PUBLIC_URL)) {
    key = src.slice(env.STORAGE_PUBLIC_URL.replace(/\/$/, '').length + 1);
  }
  if (!key) return null; // external URLs are not fetched server-side
  try {
    const buffer = await storage.read(key);
    const ext = key.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'svg' ? 'image/svg+xml'
      : 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

async function renderImage(el: ImageElement, defs: string[]): Promise<string> {
  const href = await resolveImageHref(el.src);
  if (!href) return '';
  const filter = shadowFilter(el, defs);
  let inner: string;
  if (el.crop) {
    // Nested svg viewBox shows only the cropped source region.
    inner = `<svg x="0" y="0" width="${el.width}" height="${el.height}" viewBox="${el.crop.x} ${el.crop.y} ${el.crop.width} ${el.crop.height}" preserveAspectRatio="none"><image href="${href}" width="${el.naturalWidth ?? el.crop.x + el.crop.width}" height="${el.naturalHeight ?? el.crop.y + el.crop.height}" preserveAspectRatio="none"/></svg>`;
  } else {
    inner = `<image href="${href}" width="${el.width}" height="${el.height}" preserveAspectRatio="none"/>`;
  }
  return `<g transform="${elementTransform(el, el.width, el.height)}" opacity="${el.opacity}"${filter}>${inner}</g>`;
}

export class ExportService {
  /** Build the print-area SVG at design-canvas coordinates. */
  async buildAreaSvg(
    doc: DesignDocument,
    areaKey: string,
    areaWidth: number,
    areaHeight: number,
    outputWidth: number,
    outputHeight: number,
    transparent: boolean,
  ): Promise<string> {
    const area = doc.areas.find((a) => a.areaKey === areaKey);
    if (!area) throw ApiError.notFound(`Design has no area "${areaKey}"`, 'AREA_NOT_FOUND');

    const parts: string[] = [];
    const defs: string[] = [];
    for (const el of area.elements) {
      if (el.visible === false) continue;
      if (el.type === 'text') parts.push(renderText(el, defs));
      else if (el.type === 'shape') parts.push(renderShape(el, defs));
      else if (el.type === 'image') parts.push(await renderImage(el, defs));
    }

    const background = transparent
      ? ''
      : `<rect width="${areaWidth}" height="${areaHeight}" fill="${escapeXml(doc.productColor || '#ffffff')}"/>`;
    const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${areaWidth} ${areaHeight}">${defsBlock}${background}${parts.join('')}</svg>`;
  }

  /**
   * Render a print-ready PNG for one area of a design document.
   * Output resolution derives from the area's physical size × requested DPI;
   * without physical dimensions it falls back to DPI-scaling the canvas px.
   */
  async renderProductionFile(
    doc: DesignDocument,
    productId: number,
    areaKey: string,
    dpi: number,
  ): Promise<Buffer> {
    const areas = await prisma.productPrintArea.findMany({ where: { productId } });
    if (areas.length === 0) throw ApiError.notFound('Product has no print areas', 'AREA_NOT_FOUND');
    const areaConfig = areaKey
      ? areas.find((a) => a.key === areaKey)
      : areas.find((a) => doc.areas.some((d) => d.areaKey === a.key && d.elements.length > 0)) ?? areas[0];
    if (!areaConfig) throw ApiError.notFound(`Unknown print area "${areaKey}"`, 'AREA_NOT_FOUND');

    const physicalW = dec(areaConfig.physicalWidthIn);
    const physicalH = dec(areaConfig.physicalHeightIn);
    const outputWidth = physicalW > 0 ? Math.round(physicalW * dpi) : Math.round((areaConfig.width * dpi) / BASE_SCREEN_DPI);
    const outputHeight =
      physicalH > 0 ? Math.round(physicalH * dpi) : Math.round((areaConfig.height * dpi) / BASE_SCREEN_DPI);

    const svg = await this.buildAreaSvg(
      doc,
      areaConfig.key,
      areaConfig.width,
      areaConfig.height,
      Math.min(outputWidth, 10_000),
      Math.min(outputHeight, 10_000),
      true,
    );

    // The SVG's width/height attributes already encode the target pixel size
    // (physical inches × DPI) — no additional density scaling.
    return sharp(Buffer.from(svg), { limitInputPixels: 120_000_000 })
      .png({ compressionLevel: 8 })
      .toBuffer();
  }
}

export const exportService = new ExportService();
