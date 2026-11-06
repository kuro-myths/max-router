# GitHub Connector (public and private repositories)

Max Router uses a server-side GitHub OAuth connection. The OAuth token is encrypted with AES-256-GCM and stored in the existing database `kv` table. The token is never returned to the browser.

## GitHub OAuth App setup

1. In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set the application homepage to the deployed Max Router URL.
3. Set the callback URL to `https://YOUR-MAX-ROUTER-DOMAIN/api/connectors/github/oauth/callback`.
4. Copy the Client ID and generate a Client Secret.
5. Add these backend environment variables:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `PUBLIC_BASE_URL` (the canonical HTTPS Max Router URL)
   - `JWT_SECRET` or `API_KEY_SECRET` (already required by Max Router; used to derive the encryption key)

OAuth requests `repo read:user`. The `repo` scope is required for private repositories and write access. The user must authorize access to the target organization/repository, and organization SSO authorization may also be required.

## API

All endpoints except the OAuth callback require the normal Max Router dashboard/API authentication.

- `GET /api/connectors/github/oauth/start` — begin OAuth.
- `GET /api/connectors/github/oauth/callback` — validate state, exchange code, encrypt and store token.
- `GET /api/connectors/github/status` — connection metadata only; never returns token.
- `DELETE /api/connectors/github/status` — revoke local connection (does not revoke the GitHub OAuth grant).
- `GET /api/connectors/github/repos` — list repositories visible to the connected GitHub user, including private repositories.
- `GET /api/connectors/github/contents?owner=...&repo=...&path=...&ref=...` — read a file or directory.
- `PUT /api/connectors/github/contents` — update an existing file. Requires the current blob `sha` to prevent overwriting concurrent changes.
- `POST /api/connectors/github/branches` — create a branch from a base branch.
- `GET /api/connectors/github/pulls?owner=...&repo=...` — list open pull requests.
- `POST /api/connectors/github/pulls` — create a pull request.

The editor API limits a file to 1 MB. Writes should normally target a feature branch and be reviewed through a pull request. Do not expose OAuth tokens, log authorization headers, or place GitHub secrets in frontend storage.
