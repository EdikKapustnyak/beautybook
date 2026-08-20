import { bookingAttachmentRepository } from './bookingAttachmentRepository.js';
import { portfolioImageRepository } from './portfolioImageRepository.js';
import type {
  BookingAttachmentRecord,
  BookingAttachmentRepositoryPort,
  PortfolioImageRecord,
  PortfolioImageRepositoryPort,
} from './storageTypes.js';

function toPortfolioImageRecord(doc: {
  _id: unknown;
  companyId: unknown;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  order: number;
  active: boolean;
}): PortfolioImageRecord {
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    storageKey: doc.storageKey,
    url: doc.url,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    order: doc.order,
    active: doc.active,
  };
}

export const mongoPortfolioImageRepositoryPort: PortfolioImageRepositoryPort = {
  async create(companyId, data) {
    const doc = await portfolioImageRepository.createInCompany(companyId, data);
    return toPortfolioImageRecord(doc);
  },
  async findByIdInCompany(id, companyId) {
    const doc = await portfolioImageRepository.findByIdInCompany(id, companyId);
    return doc ? toPortfolioImageRecord(doc) : null;
  },
  async listInCompany(companyId) {
    const docs = await portfolioImageRepository.listInCompany(companyId);
    return docs.map(toPortfolioImageRecord);
  },
  async deleteByIdInCompany(id, companyId) {
    const doc = await portfolioImageRepository.deleteByIdInCompany(id, companyId);
    return doc ? toPortfolioImageRecord(doc) : null;
  },
  async reorderInCompany(companyId, orderedIds) {
    await portfolioImageRepository.reorderInCompany(companyId, orderedIds);
  },
};

function toBookingAttachmentRecord(doc: {
  _id: unknown;
  companyId: unknown;
  bookingId: unknown;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: Date;
  status: BookingAttachmentRecord['status'];
}): BookingAttachmentRecord {
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    bookingId: String(doc.bookingId),
    storageKey: doc.storageKey,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    expiresAt: doc.expiresAt,
    status: doc.status,
  };
}

export const mongoBookingAttachmentRepositoryPort: BookingAttachmentRepositoryPort = {
  async create(companyId, data) {
    const doc = await bookingAttachmentRepository.createInCompany(companyId, data);
    return toBookingAttachmentRecord(doc);
  },
  async findByIdInCompany(id, companyId) {
    const doc = await bookingAttachmentRepository.findByIdInCompany(id, companyId);
    return doc ? toBookingAttachmentRecord(doc) : null;
  },
  async listForBookingInCompany(bookingId, companyId) {
    const docs = await bookingAttachmentRepository.listForBookingInCompany(bookingId, companyId);
    return docs.map(toBookingAttachmentRecord);
  },
  async findExpired(now, limit) {
    const docs = await bookingAttachmentRepository.findExpired(now, limit);
    return docs.map(toBookingAttachmentRecord);
  },
  async markDeletedIfActive(id) {
    return bookingAttachmentRepository.markDeletedIfActive(id);
  },
  async deleteByIdInCompany(id, companyId) {
    const doc = await bookingAttachmentRepository.deleteByIdInCompany(id, companyId);
    return doc ? toBookingAttachmentRecord(doc) : null;
  },
};
