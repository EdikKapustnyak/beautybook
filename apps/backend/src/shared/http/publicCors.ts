// apps/backend/src/shared/http/publicCors.ts
//
// CORS policy for the public, unauthenticated routes only
// (dev-tasks.md §5 "Public API", security-measures.md §9/§21).
//
// Deliberately permissive on origin — a business's public landing page is
// meant to be reachable/embeddable from anywhere (their own future custom
// domain, social link previews, etc.) and carries no cookies or auth
// headers, unlike the tenant/admin CORS instances in app.ts.
// `credentials: false` is the property that makes a wide-open origin safe
// here: there is no session to steal cross-site because none is ever sent
// or accepted on these routes.
//
// ASSUMPTION (verify once app.ts is available): tenant/admin CORS is
// mounted as a separate `cors()` middleware instance per surface, per
// README's "Tenant/admin isolation in the backend" section
// (`/api/tenant/*`, `/api/admin/*`, each with its own cors()). This file
// only exports the config + a ready `cors()` instance for the public
// surface — it does not assume where in app.ts it gets applied. Public
// routes should get their own mount point (see publicRoutes.ts), not reuse
// the tenant cors() instance.

import cors, { type CorsOptions } from 'cors';

export const publicCorsOptions: CorsOptions = {
  origin: true, // reflect any origin
  credentials: false, // no cookies/auth headers ever accepted on public routes
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

export const publicCorsMiddleware = cors(publicCorsOptions);
