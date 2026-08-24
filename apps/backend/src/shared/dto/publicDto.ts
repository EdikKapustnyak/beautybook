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
