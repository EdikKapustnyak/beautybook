import { mongoCompanyRepositoryPort } from '../repositories/authRepositoryAdapters.js';
import { createCompanyService } from './companyService.js';

export const companyService = createCompanyService({
  companyRepo: mongoCompanyRepositoryPort,
});
