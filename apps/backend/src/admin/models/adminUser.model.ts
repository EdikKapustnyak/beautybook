import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * Platform-admin account — the SaaS owner's internal team, NOT a tenant
 * user. Deliberately a separate model/collection from TenantUser (see
 * README.md "Tenant/admin isolation in the backend" and
 * beautybook-security-measures.md §2). There is no public registration
 * endpoint for this model — accounts are created via the seed script in
 * src/admin/scripts/createAdminUser.ts, run manually by an operator.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminUserRole = 'superadmin' | 'support';
export type AdminUserStatus = 'active' | 'disabled';

export interface AdminUserAttrs {
  email: string;
  passwordHash: string;
  name: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  lastLoginAt?: Date;
  /** Same purpose as TenantUserAttrs.tokenVersion — see user.model.ts. */
  tokenVersion: number;
}

export type AdminUserDocument = HydratedDocument<AdminUserAttrs>;

const adminUserSchema = new Schema<AdminUserAttrs>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: {
        validator: (value: string) => EMAIL_PATTERN.test(value),
        message: 'email must be a valid email address',
      },
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    role: {
      type: String,
      enum: ['superadmin', 'support'] satisfies AdminUserRole[],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'disabled'] satisfies AdminUserStatus[],
      default: 'active',
      required: true,
    },
    lastLoginAt: { type: Date },
    tokenVersion: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export const AdminUserModel: Model<AdminUserAttrs> = model<AdminUserAttrs>(
  'AdminUser',
  adminUserSchema,
);
