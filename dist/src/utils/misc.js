"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
exports.generateOrderNumber = generateOrderNumber;
exports.dec = dec;
exports.round2 = round2;
exports.parsePagination = parsePagination;
const crypto_1 = __importDefault(require("crypto"));
function slugify(input) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 140);
}
function generateOrderNumber() {
    const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const rand = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
    return `ORD-${stamp}-${rand}`;
}
/** Prisma Decimal → number for API responses. */
function dec(value) {
    if (value === null || value === undefined)
        return 0;
    return typeof value === 'number' ? value : Number(value);
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function parsePagination(query, defaultSize = 20) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || defaultSize));
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
//# sourceMappingURL=misc.js.map