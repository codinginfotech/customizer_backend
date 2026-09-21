import crypto from 'crypto';
import { Prisma } from '@prisma/client';

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export function generateOrderNumber(): string {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${stamp}-${rand}`;
}

/** Prisma Decimal → number for API responses. */
export function dec(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parsePagination(query: Record<string, unknown>, defaultSize = 20) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
