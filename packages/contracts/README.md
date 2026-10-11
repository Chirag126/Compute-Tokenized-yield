# Real metadata API patch

This patch adds a public read-only metadata route backed by the existing PostgreSQL `ComputeAsset`, `Provider`, `GpuDevice`, and `ComputeResource` records.

## Add the route

Copy `apps/api/src/routes/metadata.ts` into your repository at the same path.

In `apps/api/src/app.ts`:
1. Add `import metadataRoutes from './routes/metadata.js';`
2. After the existing `app.register(healthRoutes);` line, add `app.register(metadataRoutes);`

The existing Prisma plugin is registered at the root and decorates Fastify with `app.prisma`.

## Important behavior

- URL format: `/metadata/compute-assets/<DATABASE_COMPUTE_ASSET_UUID>`
- The URL parameter is the database ComputeAsset UUID, **not** on-chain registry asset ID `1`.
- It returns real values only from records already synchronized from the provider.
- Unknown IDs return HTTP 404; malformed IDs return HTTP 400.
- `isStale` becomes true when `lastSeenAt` is older than 30 minutes.
- This endpoint does not expose API keys.
- A Vast.ai offer is not represented as owned/rented compute or revenue.

## Verify locally (PowerShell)

From project root:
```powershell
npm run --workspace apps/api typecheck
npm run --workspace apps/api test
```

After restarting the API, first sync provider offers using your existing authenticated provider-sync route. Do not paste the API key into chat. Then query the database for a synchronized asset UUID:
```powershell
# Use Prisma Studio or your existing DB tooling to find ComputeAsset.id.
# Do not use registry asset ID 1 as this UUID.
```

Test:
```powershell
Invoke-RestMethod "http://localhost:4000/metadata/compute-assets/<DATABASE_COMPUTE_ASSET_UUID>"
```

## Deployment and on-chain URI

Deploy the API changes to the existing Render service and confirm the public endpoint returns JSON.

Then use the URL of a real synchronized compute asset in `ComputeAssetRegistry.updateAssetMetadata(1, "<PUBLIC_METADATA_URL>")`. The registry call must be sent by a wallet with `ASSET_MANAGER_ROLE`. This on-chain update is a separate transaction; do not execute it until the public URL returns valid metadata and the selected compute asset is the one you intend to associate with registry asset 1.

Do not use an arbitrary offer UUID for asset 1. The existing on-chain registry's provider address was set to the admin address during registration; this API endpoint describes a provider offer and does not itself prove that offer is owned by that address. Keep that distinction explicit in product/UI language.
