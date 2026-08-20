export interface PortfolioImageRecord {
  id: string;
  companyId: string;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  order: number;
  active: boolean;
}

export interface PortfolioImageRepositoryPort {
  create(
    companyId: string,
    data: { storageKey: string; url: string; mimeType: string; sizeBytes: number },
  ): Promise<PortfolioImageRecord>;
  findByIdInCompany(id: string, companyId: string): Promise<PortfolioImageRecord | null>;
  listInCompany(companyId: string): Promise<PortfolioImageRecord[]>;
  deleteByIdInCompany(id: string, companyId: string): Promise<PortfolioImageRecord | null>;
  reorderInCompany(companyId: string, orderedIds: string[]): Promise<void>;
}

export interface BookingAttachmentRecord {
  id: string;
  companyId: string;
  bookingId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: Date;
  status: 'active' | 'deleted';
}

export interface BookingAttachmentRepositoryPort {
  create(
    companyId: string,
    data: {
      bookingId: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      expiresAt: Date;
    },
  ): Promise<BookingAttachmentRecord>;
  findByIdInCompany(id: string, companyId: string): Promise<BookingAttachmentRecord | null>;
  listForBookingInCompany(bookingId: string, companyId: string): Promise<BookingAttachmentRecord[]>;
  /** Not tenant-scoped — the cleanup job runs across all companies. */
  findExpired(now: Date, limit: number): Promise<BookingAttachmentRecord[]>;
  /** Atomic — succeeds only if the record was still 'active'. See bookingAttachmentRepository.markDeletedIfActive. */
  markDeletedIfActive(id: string): Promise<boolean>;
  deleteByIdInCompany(id: string, companyId: string): Promise<BookingAttachmentRecord | null>;
}
