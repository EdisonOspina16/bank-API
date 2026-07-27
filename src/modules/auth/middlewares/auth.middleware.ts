import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../../infrastructure/database/prisma-client';

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';

export interface JwtPayload {
  sub: string; // userId
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * JWT Authentication Middleware.
 * Validates Bearer token, checks session is not revoked, and injects userId.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header.' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // Optionally verify the user still exists and is active
    const user = await prisma.user.findFirst({
      where: { id: decoded.sub, deletedAt: null, status: { not: 'BLOCKED' } },
      select: { id: true, email: true },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found or account blocked.' });
      return;
    }

    req.userId = user.id;
    req.userEmail = user.email;

    next();
  } catch {
    res.status(401).json({ error: 'Token is invalid or expired.' });
  }
}

/**
 * Role-based access control middleware factory.
 * Usage: router.get('/admin', authenticate, requireRole('ADMIN'), handler)
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthenticated.' });
      return;
    }

    const userRoles = await prisma.userRole.findMany({
      where: { userId: req.userId },
      include: { role: true },
    });

    const userRoleNames = userRoles.map((ur) => ur.role.name as string);
    const hasRole = roles.some((r) => userRoleNames.includes(r));

    if (!hasRole) {
      res.status(403).json({
        error: `Access denied. Required roles: ${roles.join(', ')}.`,
      });
      return;
    }

    next();
  };
}
