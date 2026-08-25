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
     * `bookingSettings` and `socialLinks` in the update are PARTIAL
     * objects (e.g. just `{ minNoticeMinutes: 120 }` or just
     * `{ instagram: '...' }`). Mongoose would replace the whole embedded
     * subdocument if we passed that straight through, silently resetting
     * the other fields (e.g. clearing `facebook`/`tiktok`/`website` just
     * because the caller only meant to update `instagram`). So both get
     * merged with the company's current values first, and only then does
     * the repository get called with the full, correct object.
     */
    async updateCompany(companyId: string, updates: CompanyProfileUpdate): Promise<CompanyRecord> {
      const {
        bookingSettings: partialBookingSettings,
        socialLinks: partialSocialLinks,
        ...restUpdates
      } = updates;
      let mergedBookingSettings: CompanyRecord['bookingSettings'] | undefined;
      let mergedSocialLinks: CompanyRecord['socialLinks'] | undefined;

      if (partialBookingSettings || partialSocialLinks) {
        const current = await companyRepo.findById(companyId);
        if (!current) {
          throw new NotFoundError('Company not found.');
        }
        if (partialBookingSettings) {
          mergedBookingSettings = { ...current.bookingSettings, ...partialBookingSettings };
        }
        if (partialSocialLinks) {
          mergedSocialLinks = { ...current.socialLinks, ...partialSocialLinks };
        }
      }

      const updated = await companyRepo.updateById(companyId, {
        ...restUpdates,
        ...(mergedBookingSettings ? { bookingSettings: mergedBookingSettings } : {}),
        ...(mergedSocialLinks ? { socialLinks: mergedSocialLinks } : {}),
      });

      if (!updated) {
        throw new NotFoundError('Company not found.');
      }
      return updated;
    },
  };
}

export type CompanyService = ReturnType<typeof createCompanyService>;
