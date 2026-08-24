import { tokenVersionRevocationStore } from '../../shared/security/tokenVersionRevocation.instance.js';
import {
  mongoAdminSessionRepositoryPort,
  mongoAdminUserRepositoryPort,
} from '../repositories/adminRepositoryAdapters.js';
import { createAdminAuthService } from './adminAuthService.js';

export const adminAuthService = createAdminAuthService({
  adminUserRepo: mongoAdminUserRepositoryPort,
  adminSessionRepo: mongoAdminSessionRepositoryPort,
  tokenVersionRevocationStore,
});
