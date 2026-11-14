<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b7333237-88f4-4649-9029-bd9bc17f57cd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Restricted database runtime

Set `ECOLETRACK_RESTRICTED_DB_RUNTIME=true` only after an administrator has applied the required database structures, completed existing data backfills, and granted the mobile API role its runtime privileges. In this mode, the API checks the schema with read-only catalog queries and fails with a list of missing structures instead of creating or altering database objects. When the flag is unset or `false`, the existing mobile table initialization path is retained.

Configure `SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, and `SQL_DB_NAME` explicitly for production or restricted mode. Restricted mode does not load `.env` files. In unrestricted production, only the mobile service's working-directory `.env` is eligible; it never falls back to the Web project's `.env`. Prefer service-specific process variables and keep administrative credentials confined to separate migration or maintenance processes.
