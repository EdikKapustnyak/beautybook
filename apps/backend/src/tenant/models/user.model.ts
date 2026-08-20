import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * Tenant-surface user account (owner/admin/manager/employee of a company).
 * Deliberately a SEPARATE model/collection from platform-admin users — see
 * README.md "Tenant/admin isolation in the backend" and
 * beautybook-security-measures.md §2 ("разные session stores/collections").
 * Platform admin accounts live in src/admin/models/adminUser.model.ts,
 * added when the Platform Admin stage is implemented.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose E.164-ish validation; strict phone validation belongs to a
// dedicated phone-number library when SMS/OTP is implemented.
const PHONE_PATTERN = /^\+?[0-9()\-\s]{6,20}$/;

export type TenantUserRole = 'owner' | 'admin' | 'manager' | 'employee';
export type TenantUserStatus = 'active' | 'invited' | 'disabled';

export interface TenantUserAttrs {
  companyId: Types.ObjectId;
  email: string;
  // Never selected by default (`select: false`) — see
  // beautybook-security-measures.md §22 (never log/return password hashes).
  passwordHash: string;
  name: string;
  phone?: string;
  role: TenantUserRole;
  status: TenantUserStatus;
  lastLoginAt?: Date;
}

export type TenantUserDocument = HydratedDocument<TenantUserAttrs>;

const tenantUserSchema = new Schema<TenantUserAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
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
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      validate: {
        validator: (value: string | undefined) => value === undefined || PHONE_PATTERN.test(value),
        message: 'phone must be a valid phone number',
      },
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'manager', 'employee'] satisfies TenantUserRole[],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'disabled'] satisfies TenantUserStatus[],
      default: 'invited',
      required: true,
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

// User.email unique "в необходимом scope" (technical spec §4): email is
// globally unique across all tenants. This is a deliberate product
// decision, not an oversight — the login endpoint (POST /auth/login) takes
// only an email/password pair with no company slug, so email must resolve
// to exactly one account. Revisit only if the login flow changes to be
// slug-first. The `unique: true` and `index: true` above already create
// the necessary indexes on email and companyId respectively.

export const TenantUserModel: Model<TenantUserAttrs> = model<TenantUserAttrs>(
  'TenantUser',
  tenantUserSchema,
);
