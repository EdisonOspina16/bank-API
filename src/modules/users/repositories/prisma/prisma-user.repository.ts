import { User } from '@prisma/client';
import { IUserRepository } from '../interfaces/user-repository.interface';
import prisma from '../../../../infrastructure/database/prisma-client';

export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { phoneNumber: phone, deletedAt: null },
    });
  }

  async create(data: {
    email: string;
    phoneCountry: string;
    phoneNumber: string;
    passwordHash: string;
  }): Promise<User> {
    return prisma.user.create({
      data,
    });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    // If updating version, we perform optimistic lock increment
    const updateData = { ...data };
    if (updateData.version !== undefined) {
      updateData.version = (updateData.version || 0) + 1;
    }
    return prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  async softDelete(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
export default PrismaUserRepository;
