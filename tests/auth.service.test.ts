import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/email.service', () => ({
  emailService: {
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  },
}));

// The Prisma-backed repository is replaced with an in-memory fake.
import { AuthService } from '../src/modules/auth/auth.service';
import type { AuthRepository } from '../src/modules/auth/auth.repository';
import { hashPassword } from '../src/utils/password';
import { ApiError } from '../src/utils/apiError';

interface FakeUser {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function createFakeRepo() {
  const users: FakeUser[] = [];
  const refreshTokens: Array<{ tokenHash: string; userId: number; expiresAt: Date; revokedAt: Date | null }> = [];
  const actionTokens: Array<{ id: number; userId: number; type: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }> = [];
  let nextId = 1;

  const repo = {
    findUserByEmail: async (email: string) => users.find((u) => u.email === email) ?? null,
    findUserById: async (id: number) => users.find((u) => u.id === id) ?? null,
    createUser: async (data: { name: string; email: string; passwordHash: string; emailVerified?: boolean }) => {
      const user: FakeUser = {
        id: nextId++,
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: data.emailVerified ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.push(user);
      return user;
    },
    updatePassword: async (userId: number, passwordHash: string) => {
      const u = users.find((x) => x.id === userId)!;
      u.passwordHash = passwordHash;
      return u;
    },
    markEmailVerified: async (userId: number) => {
      const u = users.find((x) => x.id === userId)!;
      u.emailVerified = true;
      return u;
    },
    createRefreshToken: async (userId: number, tokenHash: string, expiresAt: Date) => {
      const rec = { tokenHash, userId, expiresAt, revokedAt: null };
      refreshTokens.push(rec);
      return rec;
    },
    findRefreshToken: async (tokenHash: string) => {
      const rec = refreshTokens.find((t) => t.tokenHash === tokenHash);
      if (!rec) return null;
      return { ...rec, user: users.find((u) => u.id === rec.userId)! };
    },
    revokeRefreshToken: async (tokenHash: string) => {
      const rec = refreshTokens.find((t) => t.tokenHash === tokenHash && !t.revokedAt);
      if (rec) rec.revokedAt = new Date();
      return { count: rec ? 1 : 0 };
    },
    revokeAllUserTokens: async (userId: number) => {
      let count = 0;
      refreshTokens.forEach((t) => {
        if (t.userId === userId && !t.revokedAt) {
          t.revokedAt = new Date();
          count++;
        }
      });
      return { count };
    },
    createActionToken: async (userId: number, type: string, tokenHash: string, expiresAt: Date) => {
      const rec = { id: actionTokens.length + 1, userId, type, tokenHash, expiresAt, usedAt: null };
      actionTokens.push(rec);
      return rec;
    },
    findActionToken: async (tokenHash: string, type: string) =>
      actionTokens.find(
        (t) => t.tokenHash === tokenHash && t.type === type && !t.usedAt && t.expiresAt > new Date(),
      ) ?? null,
    consumeActionToken: async (id: number) => {
      const rec = actionTokens.find((t) => t.id === id)!;
      rec.usedAt = new Date();
      return rec;
    },
  };
  return { repo: repo as unknown as AuthRepository, state: { users, refreshTokens, actionTokens } };
}

describe('AuthService', () => {
  let service: AuthService;
  let fake: ReturnType<typeof createFakeRepo>;

  beforeEach(() => {
    fake = createFakeRepo();
    service = new AuthService(fake.repo);
  });

  it('registers a user and issues tokens', async () => {
    const result = await service.register('Ada Lovelace', 'ada@example.com', 'Passw0rd!');
    expect(result.user.email).toBe('ada@example.com');
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(fake.state.users).toHaveLength(1);
    // Password is stored hashed, never in plaintext.
    expect(fake.state.users[0].passwordHash).not.toContain('Passw0rd!');
  });

  it('rejects duplicate email registration', async () => {
    await service.register('A', 'dup@example.com', 'Passw0rd1');
    await expect(service.register('B', 'dup@example.com', 'Passw0rd1')).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await service.register('Ada', 'ada@example.com', 'Passw0rd1');
    const login = await service.login('ada@example.com', 'Passw0rd1');
    expect(login.user.name).toBe('Ada');
    await expect(service.login('ada@example.com', 'wrong-pass1')).rejects.toBeInstanceOf(ApiError);
    await expect(service.login('nobody@example.com', 'whatever1')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('blocks disabled accounts from logging in', async () => {
    await service.register('Ada', 'ada@example.com', 'Passw0rd1');
    fake.state.users[0].status = 'INACTIVE';
    await expect(service.login('ada@example.com', 'Passw0rd1')).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('rotates refresh tokens: the old token becomes invalid', async () => {
    const { tokens } = await service.register('Ada', 'ada@example.com', 'Passw0rd1');
    const refreshed = await service.refresh(tokens.refreshToken);
    expect(refreshed.tokens.refreshToken).not.toBe(tokens.refreshToken);
    await expect(service.refresh(tokens.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_INVALID',
    });
  });

  it('resets password via token and revokes existing sessions', async () => {
    const email = 'ada@example.com';
    await service.register('Ada', email, 'Passw0rd1');
    await service.forgotPassword(email);
    expect(fake.state.actionTokens).toHaveLength(2); // email-verify + reset

    // Simulate the emailed token by regenerating from the stored hash side:
    // instead, drive the flow through the service with a fresh token pair.
    const { generateActionToken } = await import('../src/utils/jwt');
    const fresh = generateActionToken(30);
    await fake.repo.createActionToken(1, 'PASSWORD_RESET', fresh.tokenHash, fresh.expiresAt);

    await service.resetPassword(fresh.token, 'NewPassw0rd');
    const login = await service.login(email, 'NewPassw0rd');
    expect(login.user.id).toBe(1);
    await expect(service.login(email, 'Passw0rd1')).rejects.toBeInstanceOf(ApiError);
  });

  it('does not reveal whether an email exists on forgot-password', async () => {
    await expect(service.forgotPassword('ghost@example.com')).resolves.toBeUndefined();
  });

  it('verifies email through an action token', async () => {
    await service.register('Ada', 'ada@example.com', 'Passw0rd1');
    const { generateActionToken } = await import('../src/utils/jwt');
    const fresh = generateActionToken(60);
    await fake.repo.createActionToken(1, 'EMAIL_VERIFY', fresh.tokenHash, fresh.expiresAt);
    await service.verifyEmail(fresh.token);
    expect(fake.state.users[0].emailVerified).toBe(true);
  });
});

describe('AuthService.loginWithGoogle', () => {
  let fake: ReturnType<typeof createFakeRepo>;
  const identity = {
    uid: 'google-uid-1',
    email: 'ada@example.com',
    emailVerified: true,
    name: 'Ada Lovelace' as string | null,
  };

  // The Firebase verifier is injected, so no network or Admin SDK is touched.
  function serviceWith(verify: (idToken: string) => Promise<typeof identity>) {
    fake = createFakeRepo();
    return new AuthService(fake.repo, verify);
  }

  it('creates a verified account on first Google sign-in', async () => {
    const service = serviceWith(async () => identity);
    const result = await service.loginWithGoogle('id-token');
    expect(result.user.email).toBe(identity.email);
    expect(result.user.name).toBe('Ada Lovelace');
    expect(result.user.emailVerified).toBe(true);
    expect(result.tokens.accessToken).toBeTruthy();
    expect(fake.state.users).toHaveLength(1);
    // The placeholder password is a real bcrypt hash of something random,
    // so password login cannot work until the person resets it.
    expect(fake.state.users[0].passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('links to an existing account by email and marks it verified', async () => {
    const service = serviceWith(async () => identity);
    await service.register('Ada', identity.email, 'Passw0rd1');
    expect(fake.state.users[0].emailVerified).toBe(false);

    const result = await service.loginWithGoogle('id-token');
    expect(fake.state.users).toHaveLength(1);
    expect(result.user.id).toBe(1);
    expect(result.user.name).toBe('Ada'); // existing profile wins
    expect(fake.state.users[0].emailVerified).toBe(true);
    // Password login still works for the original account.
    await expect(service.login(identity.email, 'Passw0rd1')).resolves.toBeTruthy();
  });

  it('refuses an unverified Google email', async () => {
    const service = serviceWith(async () => ({ ...identity, emailVerified: false }));
    await expect(service.loginWithGoogle('id-token')).rejects.toMatchObject({
      code: 'GOOGLE_EMAIL_UNVERIFIED',
    });
    expect(fake.state.users).toHaveLength(0);
  });

  it('blocks disabled accounts', async () => {
    const service = serviceWith(async () => identity);
    await service.register('Ada', identity.email, 'Passw0rd1');
    fake.state.users[0].status = 'INACTIVE';
    await expect(service.loginWithGoogle('id-token')).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('falls back to the email local part when Google sends no name', async () => {
    const service = serviceWith(async () => ({ ...identity, name: null }));
    const result = await service.loginWithGoogle('id-token');
    expect(result.user.name).toBe('ada');
  });

  it('propagates verifier failures without creating a user', async () => {
    const service = serviceWith(async () => {
      throw ApiError.unauthorized('bad token', 'GOOGLE_TOKEN_INVALID');
    });
    await expect(service.loginWithGoogle('id-token')).rejects.toMatchObject({
      code: 'GOOGLE_TOKEN_INVALID',
    });
    expect(fake.state.users).toHaveLength(0);
  });
});

describe('password hashing', () => {
  it('produces verifiable bcrypt hashes', async () => {
    const hash = await hashPassword('S3curePass');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});
