import bcrypt from 'bcrypt';
import prisma from '../../../infrastructure/database/prisma-client';
import { NotificationService } from '../../notifications/services/notification.service';

const BCRYPT_ROUNDS = 12;
const notificationService = new NotificationService();

const OCUPACIONES_VALIDAS = ['empleado', 'independiente', 'pensionado', 'otro'] as const;

function normalizeOcupacion(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return (OCUPACIONES_VALIDAS as readonly string[]).includes(normalized)
    ? normalized
    : undefined;
}

export class ProfileService {
  /**
   * Get user profile details.
   */
  async getProfile(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { customerProfile: true },
    });

    if (!user) {
      throw new Error('Usuario no encontrado.');
    }

    const cp = user.customerProfile;

    return {
      id: user.id,
      email: user.email,
      phoneCountry: user.phoneCountry,
      phoneNumber: user.phoneNumber,
      firstName: cp?.firstName || '',
      lastName: cp?.lastName || '',
      docType: cp?.docType || 'CC',
      docNumber: cp?.docNumber || '',
      birthDate: cp?.birthDate,
      ciudad: cp?.ciudad || '',
      ocupacion: cp?.ocupacion || 'otro',
      ingresosMensuales: cp?.ingresosMensuales
        ? Number(cp.ingresosMensuales)
        : 0,
    };
  }

  /**
   * Update profile fields (name, phone, ocupacion).
   */
  async updateProfile(
    userId: string,
    data: {
      nombre: string;
      telefono: string;
      ocupacion?: string;
      ciudad?: string;
      ingresosMensuales?: number;
    }
  ) {
    const errors: { field: string; message: string }[] = [];
    if (!data.nombre || data.nombre.trim().length === 0) {
      errors.push({ field: 'nombre', message: 'El nombre es obligatorio.' });
    }
    if (!data.telefono || data.telefono.trim().length === 0) {
      errors.push({ field: 'telefono', message: 'El teléfono es obligatorio.' });
    }

    const ocupacion = normalizeOcupacion(data.ocupacion);
    if (data.ocupacion && !ocupacion) {
      errors.push({
        field: 'ocupacion',
        message: 'Ocupación no válida. Debe ser empleado, independiente, pensionado u otro.',
      });
    }

    if (errors.length > 0) {
      throw { validationErrors: errors };
    }

    const parts = data.nombre.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { phoneNumber: data.telefono },
      });

      const existing = await tx.customerProfile.findUnique({
        where: { userId },
      });

      if (!existing) {
        throw new Error('Perfil de cliente no encontrado.');
      }

      await tx.customerProfile.update({
        where: { userId },
        data: {
          firstName,
          lastName,
          ocupacion: ocupacion || existing.ocupacion || 'otro',
          ...(data.ciudad !== undefined ? { ciudad: data.ciudad } : {}),
          ...(data.ingresosMensuales !== undefined
            ? { ingresosMensuales: data.ingresosMensuales }
            : {}),
        },
      });
    });

    await notificationService.createNotification(
      userId,
      'perfil_actualizado',
      'Perfil Actualizado',
      'Los datos de tu perfil han sido actualizados con éxito.'
    );

    return this.getProfile(userId);
  }

  /**
   * Change password or PIN code.
   */
  async changePasswordOrPin(
    userId: string,
    data: {
      password?: string;
      pin?: string;
    }
  ) {
    const errors: { field: string; message: string }[] = [];

    if (data.password !== undefined) {
      if (data.password.length < 8) {
        errors.push({
          field: 'password',
          message: 'La contraseña debe tener al menos 8 caracteres.',
        });
      }
    }

    if (data.pin !== undefined) {
      if (!/^\d{4}$/.test(data.pin)) {
        errors.push({
          field: 'pin',
          message: 'El PIN debe tener exactamente 4 dígitos.',
        });
      }
    }

    if (errors.length > 0) {
      throw { validationErrors: errors };
    }

    await prisma.$transaction(async (tx) => {
      if (data.password !== undefined) {
        const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash },
        });

        await tx.passwordHistory.create({
          data: { userId, passwordHash },
        });
      }

      if (data.pin !== undefined) {
        const pinHash = await bcrypt.hash(data.pin, BCRYPT_ROUNDS);
        await tx.user.update({
          where: { id: userId },
          data: { pinHash },
        });
      }
    });

    if (data.password !== undefined) {
      await notificationService.createNotification(
        userId,
        'password_actualizada',
        'Contraseña Modificada',
        'Tu contraseña de acceso ha sido actualizada.'
      );
    }

    if (data.pin !== undefined) {
      await notificationService.createNotification(
        userId,
        'pin_actualizado',
        'PIN Modificado',
        'El PIN de seguridad de tus tarjetas ha sido actualizado.'
      );
    }
  }
}

export default ProfileService;
