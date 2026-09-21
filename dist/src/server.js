"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const prisma_1 = require("./lib/prisma");
const app = (0, app_1.createApp)();
const server = app.listen(env_1.env.PORT, () => {
    logger_1.logger.info(`API listening on http://localhost:${env_1.env.PORT} (${env_1.env.NODE_ENV})`);
});
async function shutdown(signal) {
    logger_1.logger.info(`Received ${signal}, shutting down`);
    server.close(async () => {
        await prisma_1.prisma.$disconnect();
        process.exit(0);
    });
    // Force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error('process.unhandled_rejection', { reason: String(reason) });
});
//# sourceMappingURL=server.js.map