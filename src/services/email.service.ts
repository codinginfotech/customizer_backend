import { env, isProd } from '../config/env';
import { logger } from '../config/logger';

/**
 * Email delivery abstraction. In development it logs the action link (never
 * the raw token) so flows can be exercised end to end from the console.
 * Swap `ConsoleEmailTransport` for an SMTP/SES/Resend transport in production
 * by implementing `EmailTransport`.
 */
interface EmailTransport {
  send(to: string, subject: string, body: string): Promise<void>;
}

class ConsoleEmailTransport implements EmailTransport {
  async send(to: string, subject: string, body: string): Promise<void> {
    // Dev convenience: print the message. The body includes single-use links.
    // eslint-disable-next-line no-console
    console.log(`\n[email] To: ${to}\n[email] Subject: ${subject}\n[email] ${body}\n`);
  }
}

class EmailService {
  constructor(private readonly transport: EmailTransport = new ConsoleEmailTransport()) {}

  async sendPasswordReset(to: string, token: string) {
    const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
    await this.transport.send(
      to,
      'Reset your password',
      `Use this link to reset your password (valid for 30 minutes): ${link}`,
    );
    if (isProd) logger.info('email.password_reset_sent');
  }

  async sendEmailVerification(to: string, token: string) {
    const link = `${env.CLIENT_URL}/verify-email?token=${token}`;
    await this.transport.send(
      to,
      'Verify your email',
      `Welcome to Custom Product Designer! Verify your email: ${link}`,
    );
    if (isProd) logger.info('email.verification_sent');
  }
}

export const emailService = new EmailService();
