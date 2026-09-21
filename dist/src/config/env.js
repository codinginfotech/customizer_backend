"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTest = exports.isProd = exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().default(4000),
    DATABASE_URL: zod_1.z.string().min(1),
    CLIENT_URL: zod_1.z.string().default('http://localhost:5173'),
    JWT_ACCESS_SECRET: zod_1.z.string().min(8),
    JWT_REFRESH_SECRET: zod_1.z.string().min(8),
    ACCESS_TOKEN_TTL: zod_1.z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: zod_1.z.coerce.number().default(7),
    STORAGE_PROVIDER: zod_1.z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: zod_1.z.string().default('uploads'),
    STORAGE_BUCKET: zod_1.z.string().optional(),
    STORAGE_REGION: zod_1.z.string().optional(),
    STORAGE_ENDPOINT: zod_1.z.string().optional(),
    STORAGE_ACCESS_KEY: zod_1.z.string().optional(),
    STORAGE_SECRET_KEY: zod_1.z.string().optional(),
    STORAGE_PUBLIC_URL: zod_1.z.string().optional(),
    TAX_RATE: zod_1.z.coerce.number().default(0.08),
    FLAT_SHIPPING: zod_1.z.coerce.number().default(5.99),
    FREE_SHIPPING_THRESHOLD: zod_1.z.coerce.number().default(75),
    MAX_UPLOAD_MB: zod_1.z.coerce.number().default(15),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
exports.isProd = exports.env.NODE_ENV === 'production';
exports.isTest = exports.env.NODE_ENV === 'test';
//# sourceMappingURL=env.js.map