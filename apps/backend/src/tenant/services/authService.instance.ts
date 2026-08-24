import { tokenVersionRevocationStore } from '../../shared/security/tokenVersionRevocation.instance.js';
import {
  mongoCompanyRepositoryPort,
  mongoPasswordResetTokenRepositoryPort,
  mongoSessionRepositoryPort,
  mongoUserRepositoryPort,
} from '../repositories/authRepositoryAdapters.js';
import { createAuthService } from './authService.js';

export const authService = createAuthService({
  companyRepo: mongoCompanyRepositoryPort,
  userRepo: mongoUserRepositoryPort,
  sessionRepo: mongoSessionRepositoryPort,
  resetTokenRepo: mongoPasswordResetTokenRepositoryPort,
  tokenVersionRevocationStore,
});
