import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateModelBuffer } from '../src/modules/models/modelValidation.service';

/**
 * The production GLBs are authored on the client side (frontend/public/models).
 * They are present in the monorepo and in a full checkout, but not when the API
 * is checked out on its own — so the two asset-backed cases skip instead of
 * failing. Point CPD_MODELS_DIR at a frontend checkout to run them anywhere.
 */
const modelsDir = process.env.CPD_MODELS_DIR
  ? path.resolve(process.env.CPD_MODELS_DIR)
  : path.resolve(__dirname, '../../frontend/public/models');
const hasModels = fs.existsSync(path.join(modelsDir, 'tshirt.glb'));

describe('3D asset ingestion validation', () => {
  it.skipIf(!hasModels)('validates the generated production GLBs with high quality scores', () => {
    for (const name of ['tshirt', 'mug', 'bottle', 'pillow', 'notebook']) {
      const report = validateModelBuffer(fs.readFileSync(path.join(modelsDir, `${name}.glb`)));
      expect(report.valid, name).toBe(true);
      expect(report.score, name).toBeGreaterThanOrEqual(80);
      expect(report.stats.hasUVs, name).toBe(true);
      expect(report.stats.hasNormals, name).toBe(true);
      expect(report.stats.zoneMeshes.length, name).toBeGreaterThan(0);
    }
  });

  it.skipIf(!hasModels)('detects the zone mesh contract', () => {
    const report = validateModelBuffer(fs.readFileSync(path.join(modelsDir, 'tshirt.glb')));
    expect(report.stats.zoneMeshes).toEqual(
      expect.arrayContaining(['zone_front', 'zone_back', 'zone_left_sleeve', 'zone_right_sleeve']),
    );
  });

  it('rejects garbage bytes', () => {
    const report = validateModelBuffer(Buffer.from('not a model at all'));
    expect(report.valid).toBe(false);
    expect(report.score).toBe(0);
    expect(report.checks[0].level).toBe('error');
  });

  it('rejects a GLB header with a corrupt JSON chunk', () => {
    const bogus = Buffer.alloc(64);
    bogus.write('glTF', 0, 'ascii');
    bogus.writeUInt32LE(2, 4);
    bogus.writeUInt32LE(64, 8);
    bogus.writeUInt32LE(20, 12);
    bogus.writeUInt32LE(0x4e4f534a, 16);
    const report = validateModelBuffer(bogus);
    expect(report.valid).toBe(false);
  });

  it('flags a parseable model with no meshes', () => {
    const gltf = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, meshes: [] }));
    const report = validateModelBuffer(gltf);
    expect(report.valid).toBe(false);
    expect(report.checks.some((c) => c.code === 'NO_MESHES')).toBe(true);
  });
});
