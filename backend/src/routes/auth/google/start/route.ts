import crypto from "node:crypto";
import { fetchOidcDiscovery, buildOidcAuthorizationUrl, createPkcePair } from "../../../../lib/auth/oidc.js";
import { shouldUseSecureCookie } from "../../../../lib/auth/dashboardSession.js";

function baseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return `${req.protocol}://${req.get("host")}`;
}

export async function GET_handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const allowed = String(process.env.GOOGLE_ALLOWED_EMAILS || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!clientId || !clientSecret || allowed.length === 0) {
    return res.redirect("/login?error=google_login_not_configured");
  }

  try {
    const discovery = await fetchOidcDiscovery("https://accounts.google.com");
    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(32).toString("base64url");
    const { verifier, challenge } = createPkcePair();
    const redirectUri = `${baseUrl(req)}/api/auth/google/callback`;
    const authUrl = buildOidcAuthorizationUrl({
      authorizationEndpoint: discovery.authorization_endpoint,
      clientId,
      redirectUri,
      scopes: "openid email profile",
      state,
      nonce,
      codeChallenge: challenge,
    });
    const cookieOptions = {
      httpOnly: true,
      secure: shouldUseSecureCookie(req),
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: 10 * 60 * 1000,
    };
    res.cookie("google_oauth_state", state, cookieOptions);
    res.cookie("google_oauth_nonce", nonce, cookieOptions);
    res.cookie("google_oauth_verifier", verifier, cookieOptions);
    return res.redirect(authUrl);
  } catch (error) {
    console.error("[auth/google/start]", error?.message || error);
    return res.redirect("/login?error=google_login_start_failed");
  }
}
