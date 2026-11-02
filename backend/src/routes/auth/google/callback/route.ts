import {
  exchangeOidcCode,
  fetchOidcDiscovery,
  verifyOidcIdToken,
} from "../../../../lib/auth/oidc.js";
import { setDashboardAuthCookie, shouldUseSecureCookie } from "../../../../lib/auth/dashboardSession.js";

function baseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return `${req.protocol}://${req.get("host")}`;
}

function clearGoogleCookies(res) {
  const options = { httpOnly: true, secure: shouldUseSecureCookie(req), sameSite: "lax", path: "/api/auth/google" };
  for (const name of ["google_oauth_state", "google_oauth_nonce", "google_oauth_verifier"]) {
    res.clearCookie(name, options);
  }
}

export async function GET_handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const fail = (reason) => {
    clearGoogleCookies(res);
    return res.redirect(`/login?error=${encodeURIComponent(reason)}`);
  };
  try {
    const { code, state, error } = req.query || {};
    if (error) return fail("google_login_cancelled");
    const expectedState = req.cookies?.google_oauth_state;
    const nonce = req.cookies?.google_oauth_nonce;
    const verifier = req.cookies?.google_oauth_verifier;
    if (!code || !state || !expectedState || !nonce || !verifier || state !== expectedState) {
      return fail("google_oauth_state_invalid");
    }

    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
    const allowed = String(process.env.GOOGLE_ALLOWED_EMAILS || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (!clientId || !clientSecret || allowed.length === 0) return fail("google_login_not_configured");

    const discovery = await fetchOidcDiscovery("https://accounts.google.com");
    const redirectUri = `${baseUrl(req)}/api/auth/google/callback`;
    const tokens = await exchangeOidcCode({
      tokenEndpoint: discovery.token_endpoint,
      clientId,
      clientSecret,
      code: String(code),
      redirectUri,
      codeVerifier: verifier,
    });
    if (!tokens.id_token) return fail("google_id_token_missing");

    const claims = await verifyOidcIdToken({
      idToken: tokens.id_token,
      issuer: discovery.issuer || "https://accounts.google.com",
      audience: clientId,
      jwksUri: discovery.jwks_uri,
      nonce,
    });
    const email = String(claims.email || "").trim().toLowerCase();
    if (!email || claims.email_verified !== true) return fail("google_email_not_verified");
    if (!allowed.includes(email)) return fail("google_account_not_allowed");

    clearGoogleCookies(res);
    await setDashboardAuthCookie(res, req, {
      authProvider: "google",
      googleSub: claims.sub,
      oidc: true,
      oidcSub: claims.sub,
      oidcEmail: email,
      oidcName: claims.name || claims.given_name || email,
    });
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("[auth/google/callback]", error?.message || error);
    return fail("google_login_failed");
  }
}
