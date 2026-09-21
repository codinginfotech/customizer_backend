import { beforeAll, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';

// The database is replaced by an in-memory fake: one installed store, no mappings.
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    shopifyShop: {
      findUnique: vi.fn(async ({ where }: { where: { shopDomain: string } }) =>
        where.shopDomain === 'demo.myshopify.com'
          ? {
              id: 1,
              shopDomain: 'demo.myshopify.com',
              accessToken: 'v1.x.y.z',
              scope: 'read_products',
              settings: null,
              uninstalledAt: null,
            }
          : null,
      ),
    },
    shopifyProductMapping: { findUnique: vi.fn(async () => null) },
  },
}));

import { decryptToken, encryptToken, sha256, safeEqual } from '../src/modules/shopify/shopify.crypto';
import { autoMatchVariants } from '../src/modules/shopify/mapping.service';
import { customizationTokenOf, customizedLineItems } from '../src/modules/shopify/order.service';
import { gidToId, toGid } from '../src/modules/shopify/shopify.client';
import { createApp } from '../src/app';

describe('shopify token encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const token = 'shpat_' + crypto.randomBytes(16).toString('hex');
    const stored = encryptToken(token);
    expect(stored).not.toContain(token);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(decryptToken(stored)).toBe(token);
  });

  it('uses a fresh IV per encryption', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });

  it('rejects tampered ciphertext', () => {
    const stored = encryptToken('secret');
    const parts = stored.split('.');
    parts[3] = parts[3].slice(0, -2) + 'AA';
    expect(() => decryptToken(parts.join('.'))).toThrow();
  });

  it('compares hashes in constant time helper', () => {
    expect(safeEqual(sha256('a'), sha256('a'))).toBe(true);
    expect(safeEqual(sha256('a'), sha256('b'))).toBe(false);
  });
});

describe('gid helpers', () => {
  it('extracts numeric ids from gids and passes numbers through', () => {
    expect(gidToId('gid://shopify/Product/123')).toBe('123');
    expect(gidToId('456')).toBe('456');
    expect(gidToId(789)).toBe('789');
    expect(gidToId('not-an-id')).toBeNull();
    expect(toGid('ProductVariant', 5)).toBe('gid://shopify/ProductVariant/5');
  });
});

describe('autoMatchVariants', () => {
  const customizer = [
    { id: 1, name: 'Black / S', colorName: 'Black', size: 'S' },
    { id: 2, name: 'Black / M', colorName: 'Black', size: 'M' },
    { id: 3, name: 'White / M', colorName: 'White', size: 'M' },
    { id: 4, name: 'Red / M', colorName: 'Red', size: 'M', status: 'INACTIVE' },
  ];

  it('matches on colour + size option values', () => {
    const map = autoMatchVariants(
      [
        { id: '100', title: 'Black / M', options: [{ name: 'Color', value: 'black' }, { name: 'Size', value: 'M' }] },
        { id: '101', title: 'White / M', options: [{ name: 'Colour', value: 'White' }, { name: 'Size', value: 'M' }] },
      ],
      customizer,
    );
    expect(map).toEqual({ '100': 2, '101': 3 });
  });

  it('falls back to colour only and skips inactive variants', () => {
    const map = autoMatchVariants(
      [
        { id: '200', title: 'Black', options: [{ name: 'Color', value: 'Black' }] },
        { id: '201', title: 'Red', options: [{ name: 'Color', value: 'Red' }] },
        { id: '202', title: 'Default Title', options: [{ name: 'Title', value: 'Default Title' }] },
      ],
      customizer,
    );
    expect(map['200']).toBe(1); // first black variant wins on a tie
    expect(map['201']).toBeUndefined();
    expect(map['202']).toBeUndefined();
  });
});

describe('order webhook line items', () => {
  const token = 'abcDEF123_-abcDEF123_-xyz';

  it('reads our token from line item properties and ignores others', () => {
    expect(
      customizationTokenOf({
        id: 1,
        properties: [
          { name: 'Design preview', value: 'https://x/y.webp' },
          { name: '_cpd_customization', value: token },
        ],
      }),
    ).toBe(token);
    expect(customizationTokenOf({ id: 2, properties: [{ name: 'Gift', value: 'yes' }] })).toBeNull();
    expect(customizationTokenOf({ id: 3, properties: null })).toBeNull();
    // Garbage in the property is never treated as a token.
    expect(customizationTokenOf({ id: 4, properties: [{ name: '_cpd_customization', value: '<script>' }] })).toBeNull();
  });

  it('filters an order down to customized lines only', () => {
    const lines = customizedLineItems({
      id: 99,
      line_items: [
        { id: 1, properties: [{ name: '_cpd_customization', value: token }] },
        { id: 2, properties: [] },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].item.id).toBe(1);
  });
});

describe('webhook endpoint', () => {
  let app: ReturnType<typeof createApp>;
  beforeAll(() => {
    app = createApp();
  });

  function sign(body: string) {
    return crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET!).update(body, 'utf8').digest('base64');
  }

  it('rejects an unsigned payload', async () => {
    const res = await request(app)
      .post('/api/shopify/webhooks')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'orders/create')
      .set('X-Shopify-Shop-Domain', 'demo.myshopify.com')
      .send('{}');
    expect(res.status).toBe(401);
  });

  it('accepts a correctly signed unknown topic without touching the database', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const res = await request(app)
      .post('/api/shopify/webhooks')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'products/update')
      .set('X-Shopify-Shop-Domain', 'demo.myshopify.com')
      .set('X-Shopify-Webhook-Id', 'wh_1')
      .set('X-Shopify-API-Version', '2026-04')
      .set('X-Shopify-Hmac-Sha256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('reports configuration status', async () => {
    const res = await request(app).get('/api/shopify/status');
    expect(res.body).toEqual({ success: true, data: { configured: true } });
  });
});

describe('oauth + app proxy', () => {
  let app: ReturnType<typeof createApp>;
  beforeAll(() => {
    app = createApp();
  });

  it('starts OAuth with a redirect to the store', async () => {
    const res = await request(app).get('/api/shopify/auth?shop=demo.myshopify.com');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.origin).toBe('https://demo.myshopify.com');
    expect(location.pathname).toBe('/admin/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('test-key');
    expect(location.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/shopify/auth/callback');
    expect(location.searchParams.get('scope')).toBe('read_products,read_orders');
  });

  it('rejects an invalid shop domain', async () => {
    const res = await request(app).get('/api/shopify/auth?shop=evil.example.com');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SHOPIFY_INVALID_SHOP');
  });

  function proxySign(params: Record<string, string>) {
    const payload = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('');
    return crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET!).update(payload).digest('hex');
  }

  it('rejects an app proxy call with a bad signature', async () => {
    const res = await request(app).get(
      '/api/shopify/proxy/config?product_id=1&shop=demo.myshopify.com&path_prefix=%2Fapps%2Fcustomizer&timestamp=' +
        Math.floor(Date.now() / 1000) +
        '&signature=deadbeef',
    );
    expect(res.status).toBe(401);
  });

  it('accepts a correctly signed app proxy call', async () => {
    const params = {
      product_id: '1',
      shop: 'demo.myshopify.com',
      path_prefix: '/apps/customizer',
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const signature = proxySign(params);
    const qs = new URLSearchParams({ ...params, signature }).toString();
    const res = await request(app).get(`/api/shopify/proxy/config?${qs}`);
    // Signature is valid; the (mocked) store is installed and the product is
    // not linked, so the theme extension is told to stay hidden.
    expect(res.status).toBe(200);
    expect(res.body.data.customizable).toBe(false);
    expect(res.body.data.settings.buttonLabel).toBe('Customize this product');
  });
});

describe('withShopLock', () => {
  it('runs work for the same shop one at a time, in order', async () => {
    const { withShopLock } = await import('../src/modules/shopify/shopify.locks');
    const log: string[] = [];
    const job = (name: string, ms: number) => () =>
      new Promise<string>((resolve) =>
        setTimeout(() => {
          log.push(name);
          resolve(name);
        }, ms),
      );
    // Three "parallel" token exchanges for one shop: the slow first one must
    // finish before the others start; another shop is not blocked.
    const results = await Promise.all([
      withShopLock('a.myshopify.com', job('a1', 30)),
      withShopLock('a.myshopify.com', job('a2', 1)),
      withShopLock('b.myshopify.com', job('b1', 1)),
      withShopLock('a.myshopify.com', job('a3', 1)),
    ]);
    expect(results).toEqual(['a1', 'a2', 'b1', 'a3']);
    expect(log.indexOf('b1')).toBeLessThan(log.indexOf('a1'));
    expect(log.filter((n) => n.startsWith('a'))).toEqual(['a1', 'a2', 'a3']);
  });

  it('keeps serving the shop after a failed critical section', async () => {
    const { withShopLock } = await import('../src/modules/shopify/shopify.locks');
    await expect(withShopLock('c.myshopify.com', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(withShopLock('c.myshopify.com', async () => 'ok')).resolves.toBe('ok');
  });
});
