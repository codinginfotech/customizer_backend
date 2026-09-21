/**
 * Point a product at an imported (stock / scanned / commissioned) GLB.
 *
 * Assets authored outside the contract have no `zone_<areaKey>` meshes and are
 * usually Z-up and off-origin, so this writes the correction transform and the
 * decal projectors that stand in for zone meshes.
 *
 *   npx tsx backend/tools/use-imported-model.ts <product-slug> <model-url>
 *
 * Print-area geometry is passed as JSON on stdin or defaults to a front chest
 * placement — tune with --zone front=x,y,z,w,h,d
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Vec3 = [number, number, number];

interface ZoneSpec {
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
}

function parseZoneArgs(argv: string[]): Record<string, ZoneSpec> {
  const zones: Record<string, ZoneSpec> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--zone') continue;
    const [key, rest] = (argv[i + 1] ?? '').split('=');
    const n = (rest ?? '').split(',').map(Number);
    if (!key || n.length < 6 || n.some(Number.isNaN)) {
      throw new Error(`--zone expects key=x,y,z,w,h,d (got "${argv[i + 1]}")`);
    }
    zones[key] = {
      position: [n[0], n[1], n[2]],
      rotation: [n[6] ?? 0, n[7] ?? 0, n[8] ?? 0],
      size: [n[3], n[4], n[5]],
    };
  }
  return zones;
}

function numFlag(argv: string[], name: string, fallback: number): number {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(argv[i + 1]);
  return Number.isNaN(v) ? fallback : v;
}

/** `--zone-lookat front=x,y,z` → aim the projector at a point. */
function parseZoneLookAts(argv: string[]): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--zone-lookat') continue;
    const [key, rest] = (argv[i + 1] ?? '').split('=');
    const n = (rest ?? '').split(',').map(Number);
    if (key && n.length === 3 && !n.some(Number.isNaN)) out[key] = [n[0], n[1], n[2]];
  }
  return out;
}

/** `--zone-target front=Object_2` → { front: 'Object_2' } */
function parseZoneTargets(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--zone-target') continue;
    const [key, mesh] = (argv[i + 1] ?? '').split('=');
    if (key && mesh) out[key] = mesh;
  }
  return out;
}

/** `--bind zone_right_sleeve=right_sleeve:overlay` */
function parseBinds(argv: string[]): Array<{ mesh: string; areaKey: string; mode: 'surface' | 'overlay' }> {
  const out: Array<{ mesh: string; areaKey: string; mode: 'surface' | 'overlay' }> = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--bind') continue;
    const [mesh, rest] = (argv[i + 1] ?? '').split('=');
    const [areaKey, mode] = (rest ?? '').split(':');
    if (mesh && areaKey) out.push({ mesh, areaKey, mode: mode === 'surface' ? 'surface' : 'overlay' });
  }
  return out;
}

function listFlag(argv: string[], name: string): string[] {
  const i = argv.indexOf(name);
  if (i === -1) return [];
  return (argv[i + 1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function strFlag(argv: string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
}

async function main() {
  const [slug, modelUrl, ...rest] = process.argv.slice(2);
  if (!slug || !modelUrl) {
    throw new Error(
      'usage: use-imported-model.ts <slug> <model-url> [--rx 0] [--ry 0] [--rz 0] [--scale 2] ' +
        '[--zone front=x,y,z,w,h,d[,rx,ry,rz]] [--color-meshes A,B] [--material cotton]',
    );
  }

  const product = await prisma.product.findUnique({
    where: { slug },
    include: { model: true, printAreas: true },
  });
  if (!product) throw new Error(`no product with slug "${slug}"`);

  const targets = parseZoneTargets(rest);
  const zones = parseZoneArgs(rest);
  // A garment's front and back are separate meshes; without an explicit target
  // the projector picks the densest one, which is as likely to be the back.
  for (const [key, mesh] of Object.entries(targets)) {
    if (zones[key]) (zones[key] as ZoneSpec & { targetMesh?: string }).targetMesh = mesh;
  }
  for (const [key, at] of Object.entries(parseZoneLookAts(rest))) {
    if (zones[key]) (zones[key] as ZoneSpec & { lookAt?: Vec3 }).lookAt = at;
  }
  const decalZones = Object.keys(zones).length
    ? zones
    : {
        // Default: a chest placement on a ~1.1-unit-tall garment facing +Z.
        front: { position: [0, 0.12, 0.25] as Vec3, rotation: [0, 0, 0] as Vec3, size: [0.42, 0.51, 0.4] as Vec3 },
      };

  const previous = (product.model?.configuration ?? {}) as Record<string, unknown>;
  const configuration = {
    ...previous,
    type: 'GLTF',
    // Imported assets ship their own baked PBR — keep it.
    preserveMaterials: true,
    transform: {
      rotation: [numFlag(rest, '--rx', 0), numFlag(rest, '--ry', 0), numFlag(rest, '--rz', 0)],
      scale: numFlag(rest, '--scale', 2),
      autoCenter: true,
    },
    decalZones,
    // Authored zone_* meshes bind by name and take precedence over any decal
    // zone for the same area — projection is only the fallback.
    meshBindings: parseBinds(rest),
    // Meshes tinted by the selected variant colour. The tint multiplies the
    // asset's baked albedo, so a white/neutral garment takes colour while
    // keeping its weave and shading — but it has to be named explicitly, or
    // trims and hardware would be tinted too.
    colorMeshes: listFlag(rest, '--color-meshes'),
    // Imported assets rarely use the mat_* naming, so the preset would fall
    // back to plastic. Name the fabric explicitly.
    materials: listFlag(rest, '--color-meshes').length
      ? Object.fromEntries(
          listFlag(rest, '--color-meshes').map((m) => [m, strFlag(rest, '--material', 'cotton')]),
        )
      : {},
    baseTextures: {},
  };

  await prisma.productModel.upsert({
    where: { productId: product.id },
    create: { productId: product.id, modelUrl, modelType: 'GLTF', configuration },
    update: { modelUrl, modelType: 'GLTF', configuration },
  });

  console.log(`${product.name} → ${modelUrl}`);
  console.log(`  transform  ${JSON.stringify(configuration.transform)}`);
  console.log(`  decalZones ${Object.keys(decalZones).join(', ')}`);
  console.log(`  printAreas ${product.printAreas.map((a) => a.key).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
