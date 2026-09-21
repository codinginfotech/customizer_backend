/**
 * Apply a rig produced by the frontend's auto-rigger to a product.
 *
 *   npx tsx backend/tools/apply-rig.ts <slug> <model-url> <rig.json>
 *        [--from <template-slug>] [--name "..."] [--category <slug>] [--price 19.99]
 *
 * The rig JSON carries the whole model configuration — axis/scale correction,
 * zone-mesh bindings, tintable meshes — all derived from the geometry, so no
 * mesh names are ever typed by hand.
 *
 * The rig's bindings are also the source of truth for which print areas the
 * product has: an area the mesh cannot carry is not a real area, and an area
 * the mesh does carry must exist or the customizer has nothing to bind to. So
 * print areas are synced to the bindings rather than assumed.
 *
 * If the product does not exist it is created by cloning a template product's
 * variants and print areas, because pricing and colourways are a property of
 * the product family, not of the mesh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

interface AreaSpec {
  name: string;
  width: number;
  height: number;
  physicalWidthIn: number;
  physicalHeightIn: number;
  mockup: { top: number; left: number; width: number; height: number; rotate: number };
  sortOrder: number;
}

/**
 * Canonical geometry for every print-area key the rigger can produce, so a
 * newly rigged area lands with sane canvas and physical dimensions instead of
 * inheriting whatever the template happened to have.
 */
const AREA_SPECS: Record<string, AreaSpec> = {
  front:        { name: 'Front',       width: 450, height: 550, physicalWidthIn: 12,   physicalHeightIn: 14.7, mockup: { top: 26, left: 31, width: 38, height: 46, rotate: 0 },   sortOrder: 0 },
  back:         { name: 'Back',        width: 450, height: 550, physicalWidthIn: 12,   physicalHeightIn: 14.7, mockup: { top: 24, left: 31, width: 38, height: 46, rotate: 0 },   sortOrder: 1 },
  left_sleeve:  { name: 'Left Sleeve', width: 200, height: 220, physicalWidthIn: 4,    physicalHeightIn: 4.4,  mockup: { top: 30, left: 8,  width: 15, height: 16, rotate: -12 }, sortOrder: 2 },
  right_sleeve: { name: 'Right Sleeve', width: 200, height: 220, physicalWidthIn: 4,   physicalHeightIn: 4.4,  mockup: { top: 30, left: 77, width: 15, height: 16, rotate: 12 },  sortOrder: 3 },
  pocket:       { name: 'Pocket',      width: 300, height: 160, physicalWidthIn: 8,    physicalHeightIn: 4.3,  mockup: { top: 62, left: 34, width: 32, height: 13, rotate: 0 },   sortOrder: 4 },
  left_leg:     { name: 'Left Leg',    width: 250, height: 500, physicalWidthIn: 6,    physicalHeightIn: 12,   mockup: { top: 38, left: 24, width: 21, height: 48, rotate: -3 },  sortOrder: 0 },
  right_leg:    { name: 'Right Leg',   width: 250, height: 500, physicalWidthIn: 6,    physicalHeightIn: 12,   mockup: { top: 38, left: 55, width: 21, height: 48, rotate: 3 },   sortOrder: 1 },
  wrap:         { name: 'Wrap',        width: 800, height: 340, physicalWidthIn: 8.5,  physicalHeightIn: 3.6,  mockup: { top: 30, left: 22, width: 48, height: 42, rotate: 0 },   sortOrder: 0 },
  band:         { name: 'Outer Band',  width: 720, height: 300, physicalWidthIn: 8,    physicalHeightIn: 3.3,  mockup: { top: 34, left: 22, width: 56, height: 38, rotate: 0 },   sortOrder: 0 },
  center:       { name: 'Center',      width: 520, height: 520, physicalWidthIn: 7.5,  physicalHeightIn: 7.5,  mockup: { top: 27, left: 27, width: 46, height: 46, rotate: 0 },   sortOrder: 0 },
  top:          { name: 'Top',         width: 600, height: 480, physicalWidthIn: 11.8, physicalHeightIn: 9.4,  mockup: { top: 22, left: 15, width: 70, height: 56, rotate: 0 },   sortOrder: 0 },
  base:         { name: 'Base',        width: 500, height: 500, physicalWidthIn: 8,    physicalHeightIn: 8,    mockup: { top: 26, left: 26, width: 48, height: 48, rotate: 0 },   sortOrder: 0 },
};

/**
 * Presentation settings the rigger knows nothing about.
 *
 * A rig describes the mesh — where the panels are, how to right the axes, which
 * meshes take the variant colour. How the product is *lit and framed* is an art
 * direction choice that lives on the product, so it is merged around the rig
 * rather than replaced by it: without this a rig would silently drop the camera
 * views and every angle in the preview would show the same shot.
 */
const PRESENTATION_DEFAULTS = {
  lighting: 'studio',
  metalness: 0.05,
  roughness: 0.85,
  partLabels: {},
  baseTextures: {},
};

/**
 * Frame the product from its measured size.
 *
 * A garment is taller than it is wide and reads best from eye level; a plate or
 * a mouse pad is the opposite, and the same eye-level angle shows it edge-on as
 * a sliver. So the polar angle follows the shape, and the distance follows the
 * largest dimension — otherwise a wide product is cropped by the viewport it is
 * previewed in.
 */
function framing(size?: number[]) {
  const [w, h, d] = size?.length === 3 ? size : [1, 1.15, 0.5];
  const flat = h < Math.max(w, d) * 0.5;
  const polar = flat ? 34 : 82;
  return {
    cameraViews: {
      default: { azimuth: flat ? 18 : 28, polar: flat ? 38 : 78, zoom: 1 },
      front: { azimuth: 0, polar, zoom: 1 },
      right: { azimuth: 90, polar, zoom: 1 },
      back: { azimuth: 180, polar, zoom: 1 },
      left: { azimuth: -90, polar, zoom: 1 },
      top: { azimuth: 10, polar: 18, zoom: 1 },
    },
    cameraDistance: Math.round(Math.min(3.2, Math.max(1.9, Math.max(w, h, d) * 1.9)) * 10) / 10,
  };
}

function inset(w: number, h: number) {
  const x = Math.round(w * 0.09);
  const y = Math.round(h * 0.09);
  return { x, y, width: w - x * 2, height: h - y * 2 };
}

async function main() {
  const [slug, modelUrl, rigPath, ...rest] = process.argv.slice(2);
  if (!slug || !modelUrl || !rigPath) {
    throw new Error('usage: apply-rig.ts <slug> <model-url> <rig.json> [--from <template-slug>] [--name "Display Name"] [--category <slug>] [--price 19.99]');
  }
  const rig = JSON.parse(fs.readFileSync(rigPath, 'utf8'));
  const bound: string[] = (rig.meshBindings ?? []).map((b: { areaKey: string }) => b.areaKey);
  if (!bound.length) throw new Error(`${rigPath} has no meshBindings — the rigger found no panels`);

  let product = await prisma.product.findUnique({
    where: { slug },
    include: { printAreas: true, _count: { select: { designs: true, orderItems: true } } },
  });

  if (!product) {
    const templateSlug = flag(rest, '--from') ?? 'classic-cotton-tshirt';
    const template = await prisma.product.findUnique({
      where: { slug: templateSlug },
      include: { variants: true },
    });
    if (!template) throw new Error(`template product "${templateSlug}" not found`);

    const categorySlug = flag(rest, '--category');
    const category = categorySlug
      ? await prisma.category.findUnique({ where: { slug: categorySlug } })
      : null;
    if (categorySlug && !category) throw new Error(`category "${categorySlug}" not found`);

    const name = flag(rest, '--name') ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const price = flag(rest, '--price');
    product = await prisma.product.create({
      data: {
        name,
        slug: slugify(slug),
        description: template.description,
        basePrice: price ? new Prisma.Decimal(price) : template.basePrice,
        categoryId: category?.id ?? template.categoryId,
        status: 'ACTIVE',
        featured: false,
        variants: {
          create: template.variants.map((v, i) => ({
            name: v.name, color: v.color, colorName: v.colorName, size: v.size,
            material: v.material,
            // Index-suffixed: the template's own SKU tail is not unique across
            // colour/size combinations, so reusing it collides.
            sku: `${slugify(slug).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
            price: price && v.price ? new Prisma.Decimal(price) : v.price,
            stock: v.stock, status: v.status,
          })),
        },
      },
      include: { printAreas: true, _count: { select: { designs: true, orderItems: true } } },
    });
    console.log(`created product "${product.name}" (${product.slug}) from ${templateSlug}`);
  }

  /* --------------------------------------------------- sync the print areas */
  const existing = new Map(product.printAreas.map((a) => [a.key, a]));
  const created: string[] = [];
  for (const key of bound) {
    if (existing.has(key)) {
      // Keep the artist-facing spec, but make sure the binding is current.
      await prisma.productPrintArea.update({
        where: { id: existing.get(key)!.id },
        data: { modelMeshName: `zone_${key}` },
      });
      continue;
    }
    const spec = AREA_SPECS[key];
    if (!spec) { console.log(`  ! no spec for area "${key}" — skipped`); continue; }
    await prisma.productPrintArea.create({
      data: {
        productId: product.id,
        key,
        name: spec.name,
        width: spec.width,
        height: spec.height,
        bleed: 0,
        safeArea: inset(spec.width, spec.height),
        physicalWidthIn: new Prisma.Decimal(spec.physicalWidthIn),
        physicalHeightIn: new Prisma.Decimal(spec.physicalHeightIn),
        mockup: spec.mockup,
        modelMeshName: `zone_${key}`,
        sortOrder: spec.sortOrder,
      },
    });
    created.push(key);
  }

  // An area the mesh cannot carry would render nothing, so drop it — but never
  // out from under saved work, since designs address areas by key.
  const stale = product.printAreas.filter((a) => !bound.includes(a.key)).map((a) => a.key);
  const canPrune = product._count.designs === 0 && product._count.orderItems === 0;
  if (stale.length && canPrune) {
    await prisma.productPrintArea.deleteMany({ where: { productId: product.id, key: { in: stale } } });
  }

  // Keep a copy beside the schema so a fresh seed reproduces the same rig
  // without needing the frontend repo checked out next door.
  const rigDir = path.join(__dirname, '..', 'prisma', 'rigs');
  fs.mkdirSync(rigDir, { recursive: true });
  fs.writeFileSync(path.join(rigDir, `${product.slug}.rig.json`), JSON.stringify(rig, null, 2));

  const existingModel = await prisma.productModel.findUnique({ where: { productId: product.id } });
  const configuration = {
    ...PRESENTATION_DEFAULTS,
    ...((existingModel?.configuration as object) ?? {}),
    type: 'GLTF',
    ...rig,
    // Framing is derived from the mesh the rig just measured, so it overrides
    // whatever the product carried from an earlier, differently sized model.
    ...framing(rig.size),
  };

  await prisma.productModel.upsert({
    where: { productId: product.id },
    create: { productId: product.id, modelUrl, modelType: 'GLTF', configuration },
    update: { modelUrl, modelType: 'GLTF', configuration },
  });

  console.log(`${product.slug} → ${modelUrl}`);
  console.log(`  transform ${JSON.stringify(configuration.transform)}`);
  console.log(`  zones     ${bound.join(', ')}`);
  if (created.length) console.log(`  +areas    ${created.join(', ')}`);
  if (stale.length) console.log(`  ${canPrune ? '-areas   ' : 'KEPT(used)'} ${stale.join(', ')}`);
}

main()
  .catch((err) => { console.error(err.message ?? err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
