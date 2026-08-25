// apps/backend/src/shared/dto/publicDto.ts
//
// Public-facing DTO mappers.
//
// Per technical-spec.md §7 ("Публичные ответы должны быть DTO/view models,
// а не raw MongoDB documents") and security-measures.md §4, every public
// endpoint must go through one of these mappers instead of returning a
// Mongoose document (even a .lean() one) directly. This file is the ONE
// place internal fields get stripped for the public surface.
//
// Deliberately framework-free (no Mongoose/Express import) so it stays
// trivially unit-testable without a live database — same pattern as
// availabilityEngine.ts and slotLocking.ts elsewhere in this codebase.
// Source shapes below are minimal structural interfaces, not the real
// Mongoose model types, so this file has zero compile-time dependency on
// tenant/models/*.ts — a real Company/Service/Employee document (or a
// .lean() plain object) satisfies these structurally without any cast.

// Structurally mirrors tenant/models/company.model.ts's SocialLinks —
// duplicated rather than imported, keeping this file framework/model-free
// per its header comment (zero compile-time dependency on tenant/models).
export interface PublicSocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
}

export interface PublicCompanyDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  coverImage: string | null;
  timezone: string;
  currency: string;
  bookingSettings: unknown;
  theme: string;
  socialLinks: PublicSocialLinks;
}

export interface CompanySourceForPublicDto {
  _id: unknown;
  name: string;
  slug: string;
  description?: string | null;
  logo?: string | null;
  coverImage?: string | null;
  timezone: string;
  currency: string;
  bookingSettings?: unknown;
  theme: string;
  socialLinks?: PublicSocialLinks;
}

export function toPublicCompanyDto(company: CompanySourceForPublicDto): PublicCompanyDto {
  return {
    id: String(company._id),
    name: company.name,
    slug: company.slug,
    description: company.description ?? null,
    logo: company.logo ?? null,
    coverImage: company.coverImage ?? null,
    timezone: company.timezone,
    currency: company.currency,
    bookingSettings: company.bookingSettings ?? null,
    theme: company.theme,
    socialLinks: company.socialLinks ?? {},
  };
  // Deliberately NOT included: subscriptionId, status, createdAt, updatedAt,
  // or any other platform-internal field. Adding a field here later must be
  // a conscious decision, never a blind copy from the internal model.
}

export interface PublicServiceDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationMinutes: number;
  bufferMinutes: number;
  employeeIds: string[];
}

export interface ServiceSourceForPublicDto {
  _id: unknown;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  durationMinutes: number;
  bufferMinutes: number;
  employeeIds: unknown[];
}

export function toPublicServiceDto(service: ServiceSourceForPublicDto): PublicServiceDto {
  return {
    id: String(service._id),
    name: service.name,
    description: service.description ?? null,
    price: service.price,
    currency: service.currency,
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    employeeIds: service.employeeIds.map((id) => String(id)),
  };
  // `active` is deliberately not part of the source interface or the DTO —
  // the controller is responsible for only ever passing already-filtered
  // active services in; the public surface has no legitimate use for the
  // flag itself (an inactive service leaking here would itself be a bug).
}

export interface PublicEmployeeDto {
  id: string;
  name: string;
  serviceIds: string[];
}

export interface EmployeeSourceForPublicDto {
  _id: unknown;
  name: string;
  serviceIds: unknown[];
}

export function toPublicEmployeeDto(employee: EmployeeSourceForPublicDto): PublicEmployeeDto {
  return {
    id: String(employee._id),
    name: employee.name,
    serviceIds: employee.serviceIds.map((id) => String(id)),
  };
  // Deliberately excluded: email, phone, role, workingHours, locationIds,
  // active. Staff contact info has no legitimate public use case;
  // workingHours is only ever exposed indirectly, through the availability
  // endpoint's already-computed slots — never as a raw weekly template a
  // scraper could diff against real bookings to infer schedules.
}

export interface PublicPortfolioImageDto {
  id: string;
  url: string;
  order: number;
}

export interface PortfolioImageSourceForPublicDto {
  _id: unknown;
  url: string;
  order: number;
}

/**
 * Landing editor stage (dev-tasks.md §18/§19, HANDOFF_2.md §4 item 6) —
 * portfolio images were already CRUD-manageable on the tenant side
 * (portfolioController.ts) but had no public-facing DTO/endpoint yet.
 * Deliberately excluded: storageKey (internal object-storage path —
 * never exposed, security-measures.md §27 path-traversal reasoning
 * applies to not leaking storage layout, not just to accepting input),
 * mimeType, sizeBytes, companyId, active (the controller is responsible
 * for only ever passing already-filtered active images in, same
 * reasoning as toPublicServiceDto's `active` exclusion above),
 * createdAt/updatedAt.
 */
export function toPublicPortfolioImageDto(
  image: PortfolioImageSourceForPublicDto,
): PublicPortfolioImageDto {
  return {
    id: String(image._id),
    url: image.url,
    order: image.order,
  };
}
