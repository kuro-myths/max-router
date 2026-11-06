import { getAdapter } from "../../../../../lib/db/driver.js";
import { saveGitHubConnection } from "../../../../../lib/githubConnector.js";

export async function GET_handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const url = new URL("http://localhost" + req.originalUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return res.redirect("/dashboard/connectors?github_error=" + encodeURIComponent(oauthError));
    if (!code || !state) return res.redirect("/dashboard/connectors?github_error=oauth_parameters_missing");

    const db = await getAdapter();
    const row = await db.get("SELECT value FROM kv WHERE scope=? AND key=?", ["githubOAuth", state]);
    if (!row?.value) return res.redirect("/dashboard/connectors?github_error=invalid_or_expired_state");
    await db.run("DELETE FROM kv WHERE scope=? AND key=?", ["githubOAuth", state]);
    const stateData = JSON.parse(row.value);
    if (Date.now() - Number(stateData.createdAt || 0) > 10 * 60 * 1000) {
      return res.redirect("/dashboard/connectors?github_error=oauth_state_expired");
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: stateData.redirectUri,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || "Gagal menukar kode OAuth GitHub.");
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    const user = await userResponse.json();
    if (!userResponse.ok || !user.login) throw new Error("Tidak dapat memverifikasi akun GitHub.");

    await saveGitHubConnection({
      token: tokenData.access_token,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      scopes: tokenResponse.headers.get("x-oauth-scopes") || tokenData.scope || "",
    });
    return res.redirect("/dashboard/connectors?github_connected=1");
  } catch (error: any) {
    console.error("[github/oauth/callback]", error?.message || error);
    return res.redirect("/dashboard/connectors?github_error=" + encodeURIComponent(error?.message || "oauth_failed"));
  }
}
