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
    password?: string;
    pin: string;
    firstName: string;
    lastName: string;
    docType: string;
    docNumber: string;
  }): Promise<{ user: User; tokens: AuthTokens }> {
    // 1. Check for existing user
    const existing =
      (await this.userRepo.findByEmail(data.email)) ??
      (await this.userRepo.findByPhone(data.phoneNumber));

    if (existing) {
      throw new Error('El correo electrónico o número de teléfono ya está registrado.');
    }

    // Check if docNumber already registered
    const existingDoc = await prisma.customerProfile.findUnique({
      where: { docNumber: data.docNumber },
    });

    if (existingDoc) {
      throw new Error('El número de documento ya está registrado.');
    }

    // 2. Hash the password & PIN with bcrypt (cost factor 12)
    const pinHash = await bcrypt.hash(data.pin, BCRYPT_ROUNDS);
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, BCRYPT_ROUNDS)
      : pinHash; // Fallback to PIN hash if no password is provided

    // 3. Create user + profile + role + settings + default accounts in a transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          phoneCountry: data.phoneCountry,
          phoneNumber: data.phoneNumber,
          passwordHash,
          pinHash,
          status: 'ACTIVE', // Activate automatically for simulator access
        },
      });

      // Record in password history for "no-reuse" policy
      await tx.passwordHistory.create({
        data: { userId: newUser.id, passwordHash },
      });

      // Assign CUSTOMER role
      let customerRole = await tx.role.findUnique({
        where: { name: 'CUSTOMER' },
      });
      if (!customerRole) {
        customerRole = await tx.role.create({
          data: { name: 'CUSTOMER', description: 'Cliente del banco' },
        });
      }
      await tx.userRole.create({
        data: { userId: newUser.id, roleId: customerRole.id },
      });

      // Create default user settings
      await tx.userSetting.create({ data: { userId: newUser.id } });

      // Create Customer Profile
      const docTypeEnum = data.docType as any; // CC, CE, PA, NIT
      await tx.customerProfile.create({
        data: {
          userId: newUser.id,
          firstName: data.firstName,
          lastName: data.lastName,
          docType: docTypeEnum,
          docNumber: data.docNumber,
        },
      });

      // Create default COP and USD Currencies if they don't exist
      let copCurrency = await tx.currency.findUnique({ where: { code: 'COP' } });
      if (!copCurrency) {
        copCurrency = await tx.currency.create({
          data: { code: 'COP', symbol: '$', name: 'Pesos Colombianos' },
        });
      }

      let usdCurrency = await tx.currency.findUnique({ where: { code: 'USD' } });
      if (!usdCurrency) {
        usdCurrency = await tx.currency.create({
          data: { code: 'USD', symbol: '$', name: 'Dólares Americanos' },
        });
      }

      // Create default Accounts with zero balance for new users
      await tx.account.create({
        data: {
          userId: newUser.id,
          accountNumber: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
          type: 'SAVINGS',
          plan: 'STANDARD',
          balance: 0.00,
          currencyId: copCurrency.id,
        },
      });

      await tx.account.create({
        data: {
          userId: newUser.id,
          accountNumber: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
          type: 'DIGITAL',
          plan: 'STANDARD',
          balance: 0.00,
          currencyId: usdCurrency.id,
        },
      });

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

    // 2. Log attempt
    await prisma.loginAttempt.create({
      data: {
        email: emailOrPhone,
        ipAddress,
        userAgent,
        isSuccess: false,
      },
    });

    if (!user || user.deletedAt) {
      throw new Error('Credenciales inválidas.');
    }

    if (user.status === 'BLOCKED') {
      throw new Error('La cuenta está bloqueada. Por favor, contacta a soporte.');
    }

    // 3. Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      await this.checkBruteForce(emailOrPhone, ipAddress);
      throw new Error('Credenciales inválidas.');
    }

    // 4. Update login attempt as successful
    await prisma.loginAttempt.updateMany({
      where: { email: emailOrPhone, isSuccess: false },
      data: { isSuccess: true },
    });

    const tokens = await this.issueTokens(user.id, ipAddress, userAgent);

    return { user, tokens };
  }

  // ─── LOGIN WITH PIN (DOCUMENT) ─────────────────────────────────────────────

  async loginWithPin(
    docType: string,
    docNumber: string,
    pin: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ user: User; tokens: AuthTokens; customerProfile: any }> {
    // 1. Find CustomerProfile by docType and docNumber
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { docNumber },
      include: { user: true },
    });

    if (!customerProfile || customerProfile.docType !== docType) {
      throw new Error('Credenciales inválidas.');
    }

    const user = customerProfile.user;

    // 2. Log attempt
    await prisma.loginAttempt.create({
      data: {
        email: user.email,
        ipAddress,
        userAgent,
        isSuccess: false,
      },
    });

    if (!user || user.deletedAt) {
      throw new Error('Credenciales inválidas.');
    }

    if (user.status === 'BLOCKED') {
      throw new Error('La cuenta está bloqueada. Por favor, contacta a soporte.');
    }

    if (!user.pinHash) {
      throw new Error('El PIN de seguridad no está configurado para esta cuenta.');
    }

    // 3. Verify PIN
    const valid = await bcrypt.compare(pin, user.pinHash);

    if (!valid) {
      await this.checkBruteForce(user.email, ipAddress);
      throw new Error('Credenciales inválidas.');
    }

    // 4. Update login attempt as successful
    await prisma.loginAttempt.updateMany({
      where: { email: user.email, isSuccess: false },
      data: { isSuccess: true },
    });

    const tokens = await this.issueTokens(user.id, ipAddress, userAgent);

    return { user, tokens, customerProfile };
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
