import {
  AdminUserModel,
  type AdminUserAttrs,
  type AdminUserDocument,
} from '../models/adminUser.model.js';

export const adminUserRepository = {
  async findByEmailForLogin(email: string): Promise<AdminUserDocument | null> {
    return AdminUserModel.findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .exec();
  },

  async findById(id: string): Promise<AdminUserDocument | null> {
    return AdminUserModel.findById(id).exec();
  },

  async create(
    data: Pick<AdminUserAttrs, 'email' | 'passwordHash' | 'name' | 'role'>,
  ): Promise<AdminUserDocument> {
    return AdminUserModel.create(data);
  },

  async updatePasswordHash(adminUserId: string, passwordHash: string): Promise<void> {
    await AdminUserModel.findByIdAndUpdate(adminUserId, { passwordHash }).exec();
  },

  async updateLastLoginAt(adminUserId: string, date: Date): Promise<void> {
    await AdminUserModel.findByIdAndUpdate(adminUserId, { lastLoginAt: date }).exec();
  },
};
