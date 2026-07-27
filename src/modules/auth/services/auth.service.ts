import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../../infrastructure/database/prisma-client';
import { PrismaUserRepository } from '../../users/repositories/prisma/prisma-user.repository';
import { User } from '@prisma/client';

const BCRYPT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
const REFRESH_EXPIRES_IN_DAYS = 30;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private readonly userRepo: PrismaUserRepository;

  constructor() {
    this.userRepo = new PrismaUserRepository();
  }

  // ─── REGISTER ──────────────────────────────────────────────────────────────

  async register(data: {
    email: string;
    phoneCountry: string;
    phoneNumber: string;
    password: string;
  }): Promise<{ user: User; tokens: AuthTokens }> {
    // 1. Check for existing user
    const existing =
      (await this.userRepo.findByEmail(data.email)) ??
      (await this.userRepo.findByPhone(data.phoneNumber));

    if (existing) {
      throw new Error('Email or phone number already registered.');
    }

    // 2. Hash the password with bcrypt (cost factor 12)
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // 3. Create user + save password hash in history using an ACID transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          phoneCountry: data.phoneCountry,
          phoneNumber: data.phoneNumber,
          passwordHash,
        },
      });

      // Record in password history for "no-reuse" policy
      await tx.passwordHistory.create({
        data: { userId: newUser.id, passwordHash },
      });

      // Assign CUSTOMER role
      const customerRole = await tx.role.findUniqueOrThrow({
        where: { name: 'CUSTOMER' },
      });
      await tx.userRole.create({
        data: { userId: newUser.id, roleId: customerRole.id },
      });

      // Create default user settings
      await tx.userSetting.create({ data: { userId: newUser.id } });

      return newUser;
    });

    // 4. Issue JWT + refresh token
    const tokens = await this.issueTokens(user.id);

    return { user, tokens };
  }

  // ─── LOGIN ─────────────────────────────────────────────────────────────────

  async login(
    emailOrPhone: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ user: User; tokens: AuthTokens }> {
    // 1. Find user (email or phone)
    const user =
      (await this.userRepo.findByEmail(emailOrPhone)) ??
      (await this.userRepo.findByPhone(emailOrPhone));

    // 2. Log attempt (always, even if user not found, for rate-limiting)
    await prisma.loginAttempt.create({
      data: {
        email: emailOrPhone,
        ipAddress,
        userAgent,
        isSuccess: false, // will update if successful
      },
    });

    if (!user || user.deletedAt) {
      throw new Error('Invalid credentials.');
    }

    if (user.status === 'BLOCKED') {
      throw new Error('Account is blocked. Please contact support.');
    }

    // 3. Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      // Record failed security event if multiple failures detected
      await this.checkBruteForce(emailOrPhone, ipAddress);
      throw new Error('Invalid credentials.');
    }

    // 4. Update login attempt as successful
    await prisma.loginAttempt.updateMany({
      where: { email: emailOrPhone, isSuccess: false },
      data: { isSuccess: true },
    });

    const tokens = await this.issueTokens(user.id, ipAddress, userAgent);

    return { user, tokens };
  }

  // ─── REFRESH TOKEN ──────────────────────────────────────────────────────────

  async refreshToken(
    rawRefreshToken: string
  ): Promise<AuthTokens> {
    const session = await prisma.session.findFirst({
      where: {
        refreshToken: rawRefreshToken,
        isRevoked: false,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      throw new Error('Invalid or expired refresh token.');
    }

    // Rotate refresh token (token rotation for security)
    await prisma.session.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    return this.issueTokens(session.userId);
  }

  // ─── LOGOUT ────────────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    await prisma.session.updateMany({
      where: { refreshToken },
      data: { isRevoked: true },
    });
  }

  // ─── CHANGE PASSWORD ────────────────────────────────────────────────────────

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // Verify old password
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new Error('Current password is incorrect.');

    // Check against last 5 passwords to prevent reuse
    const history = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const entry of history) {
      const reused = await bcrypt.compare(newPassword, entry.passwordHash);
      if (reused) {
        throw new Error('You cannot reuse one of your last 5 passwords.');
      }
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });
      await tx.passwordHistory.create({
        data: { userId, passwordHash: newHash },
      });
      // Revoke all existing sessions (force re-login)
      await tx.session.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
    });
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  private async issueTokens(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthTokens> {
    const accessToken = jwt.sign({ sub: userId }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);

    const rawRefresh = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_IN_DAYS);

    await prisma.session.create({
      data: {
        userId,
        refreshToken: rawRefresh,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  private async checkBruteForce(email: string, ip?: string): Promise<void> {
    const since = new Date(Date.now() - 15 * 60 * 1000); // last 15 min
    const count = await prisma.loginAttempt.count({
      where: {
        email,
        isSuccess: false,
        createdAt: { gte: since },
      },
    });

    if (count >= 5) {
      await prisma.securityEvent.create({
        data: {
          eventType: 'BRUTE_FORCE_ATTEMPT',
          severity: 'HIGH',
          description: `${count} failed login attempts for ${email}`,
          ipAddress: ip,
          payload: { email, attemptCount: count },
        },
      });
    }
  }
}

export default AuthService;
