# TCG Catalog Server

Central catalog service for the app. MTG is the first game routed through it.

## What it does

- Downloads Scryfall `default-cards` bulk data on the server.
- Normalizes paper printings into a central SQLite database.
- Groups printings under Oracle cards.
- Mirrors MTG thumbnails locally by default.
- Can also mirror normal-size images.
- Exposes a paginated MTG catalog API for the Expo app.
- Keeps the Expo client away from Scryfall's ~100k raw-printing sync.

## First run

```powershell
cd D:\tcg-collection-app\server
Copy-Item .env.example .env
npm install
npm run sync:mtg
npm run dev
```

The server listens on `http://localhost:8787` by default.

The web Expo app automatically uses `http://localhost:8787` when
`EXPO_PUBLIC_CATALOG_API_URL` is not set.

For a phone / deployed app, set:

```
EXPO_PUBLIC_CATALOG_API_URL=https://your-catalog-host.example
```

## Images

`MTG_IMAGE_MIRROR=thumbnail` downloads a local thumbnail for every MTG printing.
The API then returns the server's own image URL.

`MTG_IMAGE_MIRROR=full` stores both thumbnail and normal-size image.

`MTG_IMAGE_MIRROR=none` keeps only Scryfall image URLs.

Existing mirrored files are reused on later syncs.

## Endpoints

- `GET /health`
- `GET /catalog/mtg/version`
- `GET /catalog/mtg/cards?cursor=0&limit=500`
- `POST /admin/sync/mtg`

If `ADMIN_TOKEN` is configured, manual sync requires:

```
Authorization: Bearer <token>
```

## Updating the MTG catalog

```powershell
npm run sync:mtg
```

The sync first checks Scryfall's bulk-data version. If it is unchanged, it exits
without reimporting the catalog. Use `-- --force` to force a refresh:

```powershell
npm run sync:mtg -- --force
```
