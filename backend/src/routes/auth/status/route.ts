import { getSettings } from "../../../lib/localDb.js";
import { isOidcConfigured } from "../../../lib/auth/oidc.js";
import { getDashboardAuthSession } from "../../../lib/auth/dashboardSession.js";

export async function GET(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");
    const settings = await getSettings();
    const token = req.cookies?.["9r_session"];
    const session = await getDashboardAuthSession(token);
    const requireLogin = process.env.DISABLE_DASHBOARD_AUTH !== "true" && settings?.requireLogin === true;
    const authMode = settings?.authMode || "password";
    const oidcName = String(session?.oidcName || "").trim();
    const oidcEmail = String(session?.oidcEmail || "").trim();
    const displayName = oidcName || oidcEmail || (session?.oidc ? "OIDC user" : "Password user");
    const loginMethod = session?.oidc ? "OIDC" : "Password";
    const initialPasswordConfigured = !!process.env.INITIAL_PASSWORD;

    return res.json({
      requireLogin,
      authMode,
      oidcConfigured: isOidcConfigured(settings),
      oidcLoginLabel: (settings.oidcLoginLabel || "Sign in with OIDC").trim() || "Sign in with OIDC",
      hasPassword: !!settings.password,
      initialPasswordConfigured,
      passwordConfigured: !!settings.password || initialPasswordConfigured,
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
