# Base alpha hosting

Frontend: https://base.yieldshield.ai
Vercel project: yieldshield-base (`prj_oONP7jl3GFjFt7190EzwHuNhqwxI`), team `team_B1gmlyua4FRgXZSs0859SCoQ`.

Backend: https://base-api.yieldshield.ai
Railway project: YieldShield Base Alpha (`265ae76d-ee55-4c9d-8e64-a3b4b29a7e30`).
Environment: production (`53f626cc-ac3a-4cb2-b735-423b96a80b1b`).
Service: base-api (`9b56a91b-4102-4b50-a24b-4493dea09ed9`).

Both projects are linked to YieldShield/yieldshield-base, branch main. Vercel's current `services` format is configured in vercel.json. The Base API runs as a Railway Docker service using Dockerfile.base-api, Node 24, explicit PORT=3001 and `/health`. Railway's former railway.toml format is deprecated for new services; the service build/start/health settings are stored through the Railway API. One replica, no scheduled jobs, no wallet environment variables and no recurring transaction service are enabled.

DNS is managed through the existing yieldshield.ai Vercel zone. `base-api` has Railway's required CNAME and `_railway-verify.base-api` has the public ownership-verification TXT record. Vercel manages the `base` frontend domain. Existing apex, mail and other subdomain records are preserved.

The public market endpoint is `/api/markets`; Vercel forwards it to the Railway subdomain. Requests do not submit transactions. All canonical source fields are read from one Base-mainnet block. The process refreshes its read-only cache once per minute. Source snapshots older than 120 seconds expire, and a request for unavailable market data returns 503. `/health` reports process liveness separately from `sourceReady`.

If source data fails, inspect Railway runtime logs and the health response; do not refresh source price timestamps or bypass the source freshness guards. A funded onchain relay is a separate, not-yet-enabled deployment step requiring explicit authorization. Never place its key in Vercel, frontend environment variables, GitHub source, Docker build arguments or logs.
