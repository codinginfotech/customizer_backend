/**
 * Delete every product that is not in the model manifest.
 *
 *   npx tsx backend/tools/prune-products.ts <models.manifest.json> [--yes]
 *
 * The manifest is the catalogue: a product with no rigged model has nothing to
 * preview, so it has no business in the storefront. Without --yes this only
 * reports what it would do.
 *
 * A product that carries history — orders, saved designs, live carts — is never
 * deleted, because that would orphan records people can still see. Those are
 * deactivated instead, which hides them from the storefront and leaves the
 * history intact.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [manifestPath, ...rest] = process.argv.slice(2);
  if (!manifestPath) throw new Error('usage: prune-products.ts <models.manifest.json> [--yes]');
  const apply = rest.includes('--yes');

  const { models } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const keep: string[] = models.map((m: { slug: string }) => m.slug);

  const doomed = await prisma.product.findMany({
    where: { slug: { notIn: keep } },
    include: { _count: { select: { orderItems: true, designs: true, cartItems: true } } },
    orderBy: { id: 'asc' },
  });

  if (!doomed.length) {
    console.log(`nothing to prune — all ${keep.length} products are in the manifest`);
    return;
  }

  const deactivate = doomed.filter((p) => p._count.orderItems + p._count.designs + p._count.cartItems > 0);
  const remove = doomed.filter((p) => !deactivate.includes(p));

  for (const p of remove) console.log(`  delete   ${p.slug}`);
  for (const p of deactivate) {
    const c = p._count;
    console.log(`  deactivate  ${p.slug}  (ord:${c.orderItems} dsg:${c.designs} cart:${c.cartItems})`);
  }

  if (!apply) {
    console.log(`\n${remove.length} to delete, ${deactivate.length} to deactivate. Re-run with --yes to apply.`);
    return;
  }

  if (deactivate.length) {
    await prisma.product.updateMany({
      where: { id: { in: deactivate.map((p) => p.id) } },
      data: { status: 'INACTIVE', featured: false },
    });
  }
  // Print areas, variants, images and the model row all cascade from Product.
  if (remove.length) {
    await prisma.product.deleteMany({ where: { id: { in: remove.map((p) => p.id) } } });
  }
  console.log(`\ndeleted ${remove.length}, deactivated ${deactivate.length}, kept ${keep.length}`);
}

main()
  .catch((err) => { console.error(err.message ?? err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
