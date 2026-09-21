"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
class ConsoleEmailTransport {
    async send(to, subject, body) {
        // Dev convenience: print the message. The body includes single-use links.
        // eslint-disable-next-line no-console
        console.log(`\n[email] To: ${to}\n[email] Subject: ${subject}\n[email] ${body}\n`);
    }
}
class EmailService {
    constructor(transport = new ConsoleEmailTransport()) {
        this.transport = transport;
    }
    async sendPasswordReset(to, token) {
        const link = `${env_1.env.CLIENT_URL}/reset-password?token=${token}`;
        await this.transport.send(to, 'Reset your password', `Use this link to reset your password (valid for 30 minutes): ${link}`);
        if (env_1.isProd)
            logger_1.logger.info('email.password_reset_sent');
    }
    async sendEmailVerification(to, token) {
        const link = `${env_1.env.CLIENT_URL}/verify-email?token=${token}`;
        await this.transport.send(to, 'Verify your email', `Welcome to Custom Product Designer! Verify your email: ${link}`);
        if (env_1.isProd)
            logger_1.logger.info('email.verification_sent');
    }
}
exports.emailService = new EmailService();
//# sourceMappingURL=email.service.js.map