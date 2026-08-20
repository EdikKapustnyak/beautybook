import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import { escapeRegExp } from '../../shared/validation/regexEscape.js';
import {
  CustomerModel,
  type CustomerAttrs,
  type CustomerDocument,
} from '../models/customer.model.js';

export type CreateCustomerInput = {
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  notes?: string;
  priority?: number;
};

export type UpdateCustomerInput = Partial<
  Pick<CustomerAttrs, 'name' | 'phone' | 'email' | 'tags' | 'notes' | 'priority'>
>;

export interface ListCustomersOptions {
  page: number;
  limit: number;
  /** Matched (safely, escaped) as a case-insensitive substring against name/phone/email. */
  search?: string;
  tag?: string;
}

export const customerRepository = {
  async findByPhoneInCompany(
    phone: string,
    companyId: string | Types.ObjectId,
  ): Promise<CustomerDocument | null> {
    return CustomerModel.findOne(withTenantScope(String(companyId), { phone })).exec();
  },

  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreateCustomerInput,
  ): Promise<CustomerDocument> {
    return CustomerModel.create(withTenantScope(String(companyId), data));
  },

  async findByIdInCompany(
    customerId: string,
    companyId: string | Types.ObjectId,
  ): Promise<CustomerDocument | null> {
    return CustomerModel.findOne(withTenantScope(String(companyId), { _id: customerId })).exec();
  },

  /**
   * Substring search across name/phone/email. The search term is regex-
   * escaped (`escapeRegExp`) before being embedded in the query — this is
   * what makes it safe against regex injection and ReDoS regardless of
   * what the caller types; length is additionally bounded at the Zod
   * validation layer (defense in depth). See
   * beautybook-security-measures.md §7.
   */
  async listInCompany(
    companyId: string | Types.ObjectId,
    options: ListCustomersOptions,
  ): Promise<{ items: CustomerDocument[]; total: number }> {
    const searchFilter = options.search
      ? {
          $or: [
            { name: { $regex: escapeRegExp(options.search), $options: 'i' } },
            { phone: { $regex: escapeRegExp(options.search), $options: 'i' } },
            { email: { $regex: escapeRegExp(options.search), $options: 'i' } },
          ],
        }
      : {};

    const filter = withTenantScope(String(companyId), {
      ...searchFilter,
      ...(options.tag ? { tags: options.tag } : {}),
    });
    const skip = (options.page - 1) * options.limit;

    const [items, total] = await Promise.all([
      CustomerModel.find(filter)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(options.limit)
        .exec(),
      CustomerModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  },

  async updateInCompany(
    customerId: string,
    companyId: string | Types.ObjectId,
    updates: UpdateCustomerInput,
  ): Promise<CustomerDocument | null> {
    return CustomerModel.findOneAndUpdate(
      withTenantScope(String(companyId), { _id: customerId }),
      updates,
      { new: true, runValidators: true },
    ).exec();
  },

  /**
   * Called by bookingService after each successful booking creation —
   * keeps the denormalized `totalBookings`/`lastBookingAt` counters
   * current without a separate aggregation query on every read.
   */
  async recordBooking(customerId: string | Types.ObjectId, bookingDate: Date): Promise<void> {
    await CustomerModel.findByIdAndUpdate(customerId, {
      $inc: { totalBookings: 1 },
      $set: { lastBookingAt: bookingDate },
    }).exec();
  },

  /**
   * dev-tasks.md §12 "Delete/anonymize" — implemented as anonymize, not a
   * hard delete: existing Booking documents reference this customerId
   * (technical-spec.md §3), so hard-deleting would either orphan those
   * references or require cascading deletes across booking history,
   * which the business may still need for its own records. Anonymizing
   * strips PII while preserving referential integrity.
   *
   * NOTE (known limitation, documented scope decision): this only scrubs
   * the Customer record itself. Any PII a customer entered directly into
   * a Booking's own `customerNote` is NOT cascaded/scrubbed here — a
   * fuller GDPR-style erasure flow is future work if needed.
   */
  async anonymizeInCompany(
    customerId: string,
    companyId: string | Types.ObjectId,
  ): Promise<CustomerDocument | null> {
    // Digits-only placeholder so it still satisfies the phone format
    // validator, and is very unlikely to collide with a real customer's
    // phone (which would trip the unique index and fail loudly — safe
    // failure mode, not silent data corruption).
    const placeholderPhone = `+${Date.now()}${Math.floor(Math.random() * 1000)}`;

    return CustomerModel.findOneAndUpdate(
      withTenantScope(String(companyId), { _id: customerId }),
      {
        $set: { name: 'Deleted Customer', phone: placeholderPhone, tags: [] },
        $unset: { email: '', notes: '' },
      },
      { new: true, runValidators: true },
    ).exec();
  },
};
