/* eslint-disable no-console */
/**
 * Backfills ingestion validation reports + quality scores for product models
 * whose GLBs live in frontend/public/models (the generated catalog).
 *
 *   npx tsx tools/backfill-model-validation.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { validateModelBuffer } from '../src/modules/models/modelValidation.service';

const prisma = new PrismaClient();
const modelsDir = path.resolve(__dirname, '../../frontend/public/models');

async function main() {
  const models = await prisma.productModel.findMany({ where: { modelType: 'GLTF' } });
  for (const model of models) {
    if (!model.modelUrl?.startsWith('/models/')) continue;
    const file = path.join(modelsDir, path.basename(model.modelUrl));
    if (!fs.existsSync(file)) {
      console.log(`- skip ${model.modelUrl} (file missing)`);
      continue;
    }
    const report = validateModelBuffer(fs.readFileSync(file), path.basename(file));
    await prisma.productModel.update({
      where: { id: model.id },
      data: {
        validation: report as unknown as Prisma.InputJsonValue,
        qualityScore: Math.round(report.score),
      },
    });
    console.log(`✓ ${model.modelUrl} → quality ${report.score}/100 (${report.stats.zoneMeshes.length} zones)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
