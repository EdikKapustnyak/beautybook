import { randomUUID } from 'node:crypto';

import type {
  BookingAttachmentRecord,
  BookingAttachmentRepositoryPort,
  PortfolioImageRecord,
  PortfolioImageRepositoryPort,
} from '../../repositories/storageTypes.js';

export function createInMemoryPortfolioRepo(): PortfolioImageRepositoryPort {
  const images = new Map<string, PortfolioImageRecord>();
  return {
    async create(companyId, data) {
      const record: PortfolioImageRecord = {
        id: randomUUID(),
        companyId,
        order: 0,
        active: true,
        ...data,
      };
      images.set(record.id, record);
      return record;
    },
    async findByIdInCompany(id, companyId) {
      const image = images.get(id);
      return image && image.companyId === companyId ? image : null;
    },
    async listInCompany(companyId) {
      return [...images.values()]
        .filter((image) => image.companyId === companyId)
        .sort((a, b) => a.order - b.order);
    },
    async deleteByIdInCompany(id, companyId) {
      const image = images.get(id);
      if (!image || image.companyId !== companyId) {
        return null;
      }
      images.delete(id);
      return image;
    },
    async reorderInCompany(companyId, orderedIds) {
      orderedIds.forEach((id, index) => {
        const image = images.get(id);
        if (image && image.companyId === companyId) {
          images.set(id, { ...image, order: index });
        }
      });
    },
  };
}

export function createInMemoryAttachmentRepo(): BookingAttachmentRepositoryPort {
  const attachments = new Map<string, BookingAttachmentRecord>();
  return {
    async create(companyId, data) {
      const record: BookingAttachmentRecord = {
        id: randomUUID(),
        companyId,
        status: 'active',
        ...data,
      };
      attachments.set(record.id, record);
      return record;
    },
    async findByIdInCompany(id, companyId) {
      const attachment = attachments.get(id);
      return attachment && attachment.companyId === companyId && attachment.status === 'active'
        ? attachment
        : null;
    },
    async listForBookingInCompany(bookingId, companyId) {
      return [...attachments.values()].filter(
        (a) => a.bookingId === bookingId && a.companyId === companyId && a.status === 'active',
      );
    },
    async findExpired(now, limit) {
      return [...attachments.values()]
        .filter((a) => a.status === 'active' && a.expiresAt.getTime() <= now.getTime())
        .slice(0, limit);
    },
    async markDeletedIfActive(id) {
      const attachment = attachments.get(id);
      if (!attachment || attachment.status !== 'active') {
        return false;
      }
      attachments.set(id, { ...attachment, status: 'deleted' });
      return true;
    },
    async deleteByIdInCompany(id, companyId) {
      const attachment = attachments.get(id);
      if (!attachment || attachment.companyId !== companyId || attachment.status !== 'active') {
        return null;
      }
      const updated: BookingAttachmentRecord = { ...attachment, status: 'deleted' };
      attachments.set(id, updated);
      return updated;
    },
  };
}
