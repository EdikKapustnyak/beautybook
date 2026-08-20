import { Router } from 'express';

import { getAvailability } from '../controllers/availabilityController.js';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';

export const availabilityRouter: Router = Router();

availabilityRouter.get('/', requireTenantAuth, getAvailability);
