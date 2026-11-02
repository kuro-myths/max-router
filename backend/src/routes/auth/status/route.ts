import { getSettings } from "../../../lib/localDb.js";
import { isOidcConfigured } from "../../../lib/auth/oidc.js";
import { getDashboardAuthSession } from "../../../lib/auth/dashboardSession.js";

export async function GET(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");
    const settings = await getSettings();
    const token = req.cookies?.["9r_session"];
    const session = await getDashboardAuthSession(token);
    const googleLoginConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && String(process.env.GOOGLE_ALLOWED_EMAILS || "").trim());
    const requireLogin = googleLoginConfigured || (process.env.DISABLE_DASHBOARD_AUTH !== "true" && settings?.requireLogin !== false);
    const authMode = googleLoginConfigured ? "oidc" : (settings?.authMode || "password");
    const oidcName = String(session?.oidcName || "").trim();
    const oidcEmail = String(session?.oidcEmail || "").trim();
    const displayName = oidcName || oidcEmail || (session?.oidc ? "OIDC user" : "Password user");
    const loginMethod = session?.authProvider === "google" ? "Google" : session?.oidc ? "OIDC" : "Password";
    const initialPasswordConfigured = !!process.env.INITIAL_PASSWORD;

    return res.json({
      requireLogin,
      authMode,
      oidcConfigured: googleLoginConfigured || isOidcConfigured(settings),
      oidcLoginLabel: googleLoginConfigured ? "Masuk dengan Google" : (settings.oidcLoginLabel || "Sign in with OIDC").trim() || "Sign in with OIDC",
      hasPassword: googleLoginConfigured ? false : !!settings.password,
      initialPasswordConfigured,
      passwordConfigured: !googleLoginConfigured && (!!settings.password || initialPasswordConfigured),
      displayName,
      loginMethod,
      oidcName: oidcName || null,
      oidcEmail: oidcEmail || null,
      oidcLogin: !!session?.oidc,
      isLoggedIn: !!session,
      sessionState: token ? (session ? "valid" : "invalid") : "missing",
    });
  } catch (error) {
    console.error("[auth/status]", error?.message || error);
    return res.status(200).json({
      requireLogin: true,
      authMode: "password",
      oidcConfigured: false,
      oidcLoginLabel: "Sign in with OIDC",
      hasPassword: false,
      initialPasswordConfigured: false,
      passwordConfigured: false,
      displayName: "Password user",
      loginMethod: "Password",
      oidcName: null,
      oidcEmail: null,
      oidcLogin: false,
      isLoggedIn: false,
      sessionState: "error",
    });
  }
}
