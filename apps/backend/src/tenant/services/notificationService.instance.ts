import { smsProvider } from '../../shared/sms/smsProvider.instance.js';
import { mongoNotificationRepositoryPort } from '../repositories/notificationRepositoryAdapter.js';
import { createNotificationService } from './notificationService.js';

export const notificationService = createNotificationService({
  notificationRepo: mongoNotificationRepositoryPort,
  smsProvider,
});
