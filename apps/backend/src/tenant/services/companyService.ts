import { NotFoundError } from '../../shared/errors/AppError.js';
import type {
  CompanyProfileUpdate,
  CompanyRecord,
  CompanyRepositoryPort,
} from '../repositories/types.js';

export interface CompanyServiceDeps {
  companyRepo: CompanyRepositoryPort;
}

export function createCompanyService(deps: CompanyServiceDeps) {
  const { companyRepo } = deps;

  return {
    async getCompany(companyId: string): Promise<CompanyRecord> {
      const company = await companyRepo.findById(companyId);
      if (!company) {
        throw new NotFoundError('Company not found.');
      }
      return company;
    },

    /**
     * `bookingSettings` in the update is a PARTIAL object (e.g. just
     * `{ minNoticeMinutes: 120 }`). Mongoose would replace the whole
     * embedded subdocument if we passed that straight through, silently
     * resetting the other booking-settings fields. So this merges it with
     * the company's current settings first, and only then calls the
     * repository with the full, correct object.
     */
    async updateCompany(companyId: string, updates: CompanyProfileUpdate): Promise<CompanyRecord> {
      const { bookingSettings: partialBookingSettings, ...restUpdates } = updates;
      let mergedBookingSettings: CompanyRecord['bookingSettings'] | undefined;

      if (partialBookingSettings) {
        const current = await companyRepo.findById(companyId);
        if (!current) {
          throw new NotFoundError('Company not found.');
        }
        mergedBookingSettings = { ...current.bookingSettings, ...partialBookingSettings };
      }

      const updated = await companyRepo.updateById(companyId, {
        ...restUpdates,
        ...(mergedBookingSettings ? { bookingSettings: mergedBookingSettings } : {}),
      });

      if (!updated) {
        throw new NotFoundError('Company not found.');
      }
      return updated;
    },
  };
}

export type CompanyService = ReturnType<typeof createCompanyService>;
