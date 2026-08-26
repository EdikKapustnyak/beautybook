// apps/backend/src/admin/repositories/companyExistsAdapter.ts
//
// Implements shared/billing/types.ts's CompanyExistsPort WITHOUT
// importing tenant/models/company.model.ts directly — eslint.config.js
// forbids admin/** from importing anything under tenant/** (see
// shared/billing/types.ts's header for the full reasoning). Instead,
// this retrieves the ALREADY-REGISTERED Mongoose model by its string
// name (`mongoose.model('Company')`, no schema argument), which Mongoose
// explicitly supports for exactly this kind of cross-module access to a
// model defined elsewhere in the same process/connection.
//
// This is safe because createApp() (app.ts) always constructs BOTH
// tenantRouter and adminRouter, so tenant/models/company.model.ts's
// `model('Company', companySchema)` call has already executed — and
// 'Company' is registered on Mongoose's default connection — before any
// HTTP request (tenant OR admin) is ever handled. If this were ever
// called from a context where tenant/router.ts's import graph hadn't run
// yet (e.g. a hypothetical admin-only standalone script), it would throw
// `MissingSchemaError` — a loud, obvious failure, not silent data
// corruption.

import { model } from 'mongoose';
import type { CompanyExistsPort } from '../../shared/billing/types.js';

export const companyExistsAdapter: CompanyExistsPort = {
  async exists(companyId) {
    const CompanyModel = model('Company');
    const doc = await CompanyModel.exists({ _id: companyId });
    return doc !== null;
  },
};
