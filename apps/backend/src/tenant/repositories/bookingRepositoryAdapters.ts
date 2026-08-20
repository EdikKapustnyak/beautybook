import { bookingRepository } from './bookingRepository.js';
import type {
  BookingRecord,
  BookingRepositoryPort,
  CustomerRecord,
  CustomerRepositoryPort,
  SlotLockRepositoryPort,
} from './bookingTypes.js';
import { customerRepository } from './customerRepository.js';
import { slotLockRepository } from './slotLockRepository.js';

function toBookingRecord(doc: {
  _id: unknown;
  companyId: unknown;
  employeeId: unknown;
  customerId: unknown;
  serviceId: unknown;
  startAt: Date;
  endAt: Date;
  footprintEndAt: Date;
  status: BookingRecord['status'];
  customerNote?: string;
  internalNote?: string;
  cancellationReason?: string;
}): BookingRecord {
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    employeeId: String(doc.employeeId),
    customerId: String(doc.customerId),
    serviceId: String(doc.serviceId),
    startAt: doc.startAt,
    endAt: doc.endAt,
    footprintEndAt: doc.footprintEndAt,
    status: doc.status,
    customerNote: doc.customerNote,
    internalNote: doc.internalNote,
    cancellationReason: doc.cancellationReason,
  };
}

export const mongoBookingRepositoryPort: BookingRepositoryPort = {
  generateId() {
    return bookingRepository.generateId();
  },
  async create(data) {
    const doc = await bookingRepository.createInCompany(data.companyId, data);
    return toBookingRecord(doc);
  },
  async findByIdInCompany(id, companyId) {
    const doc = await bookingRepository.findByIdInCompany(id, companyId);
    return doc ? toBookingRecord(doc) : null;
  },
  async updateStatusIfCurrentIn(bookingId, companyId, allowedFromStatuses, newStatus, extra) {
    const doc = await bookingRepository.updateStatusIfCurrentIn(
      bookingId,
      companyId,
      allowedFromStatuses,
      newStatus,
      extra,
    );
    return doc ? toBookingRecord(doc) : null;
  },
  async updateFieldsInCompany(bookingId, companyId, updates) {
    const doc = await bookingRepository.updateFieldsInCompany(bookingId, companyId, updates);
    return doc ? toBookingRecord(doc) : null;
  },
};

function toCustomerRecord(doc: {
  _id: unknown;
  companyId: unknown;
  name: string;
  phone: string;
  email?: string;
}): CustomerRecord {
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    name: doc.name,
    phone: doc.phone,
    email: doc.email,
  };
}

export const mongoCustomerRepositoryPort: CustomerRepositoryPort = {
  async findOrCreate(companyId, data) {
    const existing = await customerRepository.findByPhoneInCompany(data.phone, companyId);
    if (existing) {
      return toCustomerRecord(existing);
    }
    const created = await customerRepository.createInCompany(companyId, data);
    return toCustomerRecord(created);
  },
  async recordBooking(customerId, bookingDate) {
    await customerRepository.recordBooking(customerId, bookingDate);
  },
};

export const mongoSlotLockRepositoryPort: SlotLockRepositoryPort = {
  async reserve(employeeId, cellKeys, bookingId) {
    return slotLockRepository.reserve(employeeId, cellKeys, bookingId);
  },
  async release(bookingId) {
    await slotLockRepository.release(bookingId);
  },
  async releaseCells(bookingId, cellKeys) {
    await slotLockRepository.releaseCells(bookingId, cellKeys);
  },
};
