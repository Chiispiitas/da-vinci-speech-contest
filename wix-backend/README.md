# Leonardo Da Vinci contest backend

This Wix-managed Astro project serves API endpoints only. The contest frontend is hosted separately on GitHub Pages. See the root README for operation, deployment identities and safeguards.

- `src/contest/core.mjs`: validation, scoring, scenes and append-only command processing.
- `src/contest/repository.ts`: server-only elevated CMS queries and create-only inserts.
- `src/pages/api/[route].ts`: fixed API routes, audience projection and origin checks.

Official SDK contracts:

- https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/query-data-items
- https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/insert-data-item

The private collections have ADMIN-only read and write permissions. Every accepted command inserts a deterministic next-revision item; duplicate IDs fail atomically. There is no general CMS proxy or public direct CMS write permission.
