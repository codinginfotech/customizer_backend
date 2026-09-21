import { ModelValidationReport, modelValidationReportSchema, ZONE_MESH_PREFIX } from '@cpd/shared';

/**
 * 3D asset ingestion validation — parses GLB/GLTF structure (pure Node, no
 * GPU) and produces a ModelValidationReport with a 0–100 quality score.
 *
 * Designed as a queue-ready unit of work: `validateModelBuffer` is a pure
 * function of the file bytes, so it can move behind a worker queue without
 * touching callers (§42 of the platform spec).
 */

interface GltfJson {
  meshes?: Array<{ name?: string; primitives?: Array<Record<string, unknown>> }>;
  materials?: Array<{ name?: string }>;
  accessors?: Array<{ count?: number; type?: string }>;
  images?: Array<{ uri?: string; bufferView?: number }>;
  textures?: unknown[];
  animations?: unknown[];
  extensionsUsed?: string[];
  nodes?: Array<{ name?: string; mesh?: number }>;
}

function parseGltfJson(buffer: Buffer): { json: GltfJson; isBinary: boolean } {
  if (buffer.subarray(0, 4).toString('ascii') === 'glTF') {
    // GLB container: header (12 bytes) then chunks [length, type, data]
    const jsonChunkLength = buffer.readUInt32LE(12);
    const jsonChunkType = buffer.readUInt32LE(16);
    if (jsonChunkType !== 0x4e4f534a) throw new Error('GLB missing JSON chunk');
    const jsonText = buffer.subarray(20, 20 + jsonChunkLength).toString('utf8');
    return { json: JSON.parse(jsonText) as GltfJson, isBinary: true };
  }
  return { json: JSON.parse(buffer.toString('utf8')) as GltfJson, isBinary: false };
}

/** Triangle count for one primitive from its indices/POSITION accessor. */
function primitiveTriangles(primitive: Record<string, unknown>, accessors: GltfJson['accessors']): number {
  const mode = (primitive.mode as number | undefined) ?? 4; // TRIANGLES
  if (mode !== 4 && mode !== 5 && mode !== 6) return 0;
  const indexAccessor = primitive.indices as number | undefined;
  const attributes = (primitive.attributes ?? {}) as Record<string, number>;
  const count =
    indexAccessor !== undefined
      ? accessors?.[indexAccessor]?.count ?? 0
      : accessors?.[attributes.POSITION]?.count ?? 0;
  return mode === 4 ? Math.floor(count / 3) : Math.max(0, count - 2);
}

export function validateModelBuffer(buffer: Buffer, fileName = 'model.glb'): ModelValidationReport {
  const checks: ModelValidationReport['checks'] = [];
  const push = (level: 'ok' | 'warn' | 'error', code: string, message: string) =>
    checks.push({ level, code, message });

  let json: GltfJson = {};
  let valid = true;
  try {
    json = parseGltfJson(buffer).json;
    push('ok', 'PARSE', 'Valid glTF container');
  } catch (err) {
    valid = false;
    push('error', 'PARSE', `Not a valid GLB/GLTF file: ${(err as Error).message}`);
  }

  // Mesh names come from nodes when authors name nodes instead of meshes.
  const nodeNameByMesh = new Map<number, string>();
  for (const node of json.nodes ?? []) {
    if (node.mesh !== undefined && node.name) nodeNameByMesh.set(node.mesh, node.name);
  }
  const meshNames: string[] = (json.meshes ?? []).map(
    (m, i) => m.name || nodeNameByMesh.get(i) || `mesh_${i}`,
  );
  const materialNames = (json.materials ?? []).map((m, i) => m.name || `material_${i}`);
  const zoneMeshes = meshNames.filter((n) => n.startsWith(ZONE_MESH_PREFIX));

  let triangleCount = 0;
  let hasUVs = false;
  let hasNormals = false;
  let missingUvMeshes = 0;
  for (const m of json.meshes ?? []) {
    for (const primitive of m.primitives ?? []) {
      triangleCount += primitiveTriangles(primitive, json.accessors);
      const attributes = (primitive.attributes ?? {}) as Record<string, number>;
      if ('TEXCOORD_0' in attributes) hasUVs = true;
      else missingUvMeshes += 1;
      if ('NORMAL' in attributes) hasNormals = true;
    }
  }

  const textureCount = json.textures?.length ?? 0;
  // Embedded image sizes: approximate via bufferView lengths is complex;
  // report count and flag data-URI/external images.
  let maxTextureSize = 0;
  for (const image of json.images ?? []) {
    if (image.uri && !image.uri.startsWith('data:')) {
      push('warn', 'EXTERNAL_TEXTURE', `Texture references external file "${image.uri}" — embed textures in the GLB`);
    }
    if (image.uri?.startsWith('data:')) {
      maxTextureSize = Math.max(maxTextureSize, Math.round((image.uri.length * 3) / 4));
    }
  }

  const hasAnimations = (json.animations?.length ?? 0) > 0;
  const draco = json.extensionsUsed?.includes('KHR_draco_mesh_compression') ?? false;

  // ---- checks ----
  if (valid) {
    if ((json.meshes?.length ?? 0) === 0) {
      valid = false;
      push('error', 'NO_MESHES', 'Model contains no meshes');
    } else {
      push('ok', 'MESHES', `${json.meshes!.length} meshes (${meshNames.slice(0, 8).join(', ')}${meshNames.length > 8 ? '…' : ''})`);
    }
    if (materialNames.length === 0) push('warn', 'NO_MATERIALS', 'No materials — presets cannot be mapped by name');
    else push('ok', 'MATERIALS', `${materialNames.length} materials`);

    if (!hasNormals) push('warn', 'NO_NORMALS', 'No normals — lighting will look faceted');
    if (!hasUVs) push('error', 'NO_UVS', 'No UV coordinates — designs cannot be applied');
    else if (missingUvMeshes > 0) push('warn', 'PARTIAL_UVS', `${missingUvMeshes} primitives have no UVs`);
    else push('ok', 'UVS', 'UV map detected on all primitives');

    if (zoneMeshes.length === 0) {
      push('warn', 'NO_ZONES', `No "${ZONE_MESH_PREFIX}<areaKey>" meshes — bind print areas manually in the 3D studio`);
    } else {
      push('ok', 'ZONES', `Print zones: ${zoneMeshes.join(', ')}`);
    }

    if (triangleCount > 200_000) push('warn', 'HEAVY_GEOMETRY', `${(triangleCount / 1000).toFixed(0)}K triangles — consider decimation`);
    else if (triangleCount > 0) push('ok', 'GEOMETRY', `${(triangleCount / 1000).toFixed(1)}K triangles`);

    if (buffer.length > 15 * 1024 * 1024) push('warn', 'LARGE_FILE', `${(buffer.length / 1024 / 1024).toFixed(1)} MB file — will be slow on mobile`);
    if (maxTextureSize > 6 * 1024 * 1024) push('warn', 'LARGE_TEXTURE', 'Embedded texture exceeds ~6 MB');
    if (hasAnimations) push('warn', 'ANIMATIONS', 'Animations present — ignored by the product viewer');
    if (draco) push('ok', 'DRACO', 'Draco compression detected (decoder bundled in the viewer)');
  }

  // ---- score ----
  let score = 0;
  if (valid) {
    score = 40;
    if (hasUVs && missingUvMeshes === 0) score += 15;
    else if (hasUVs) score += 8;
    if (hasNormals) score += 10;
    if (materialNames.length > 0) score += 10;
    if (zoneMeshes.length > 0) score += 15;
    if (triangleCount > 500 && triangleCount <= 200_000) score += 5;
    if (buffer.length <= 8 * 1024 * 1024) score += 5;
    score -= checks.filter((c) => c.level === 'warn').length * 2;
    score = Math.max(0, Math.min(100, score));
  }

  return modelValidationReportSchema.parse({
    valid,
    score,
    stats: {
      fileBytes: buffer.length,
      meshCount: json.meshes?.length ?? 0,
      materialCount: materialNames.length,
      triangleCount,
      textureCount,
      maxTextureSize,
      hasUVs,
      hasNormals,
      hasAnimations,
      zoneMeshes,
      meshNames,
      materialNames,
    },
    checks,
    generatedAt: new Date().toISOString(),
  });
}
