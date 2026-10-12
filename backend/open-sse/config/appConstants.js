import { platform, arch } from "os";

// === Gemini CLI ===
export const GEMINI_CLI_VERSION = "0.34.0";
export const GEMINI_CLI_API_CLIENT = "google-genai-sdk/1.41.0 gl-node/v22.19.0";

// Map Node arch to Gemini CLI arch string (x64/x86/arm64/...)
function geminiCLIArch() {
  const a = arch();
  if (a === "ia32") return "x86";
  return a;
}

export function geminiCLIUserAgent(model = "unknown") {
  return `GeminiCLI/${GEMINI_CLI_VERSION}/${model || "unknown"} (${platform()}; ${geminiCLIArch()}; terminal)`;
}

// === GitHub Copilot ===
export const GITHUB_COPILOT = {
  VSCODE_VERSION: "1.110.0",
  COPILOT_CHAT_VERSION: "0.38.0",
  USER_AGENT: "GitHubCopilotChat/0.38.0",
  API_VERSION: "2025-04-01",
};

export const CLOUD_CODE_API = {
  loadCodeAssist: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
  onboardUser: "https://cloudcode-pa.googleapis.com/v1internal:onboardUser",
};
export const LOAD_CODE_ASSIST_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "google-api-nodejs-client/9.15.1",
  "X-Goog-Api-Client": GEMINI_CLI_API_CLIENT,
};
export const LOAD_CODE_ASSIST_METADATA = {
  ideType: 10,
  platform: 3,
  pluginType: 2,
};

export function getPlatformUserAgent() {
  const os = process.platform;
  const arch = process.arch;
  return `gemini-cli/9router ${os}/${arch}`;
}

export const CLIENT_METADATA = {
  ideType: 10,
  platform: process.platform === "win32" ? 5 : process.platform === "darwin" ? 2 : 3,
  pluginType: 2,
};

export const INTERNAL_REQUEST_HEADER = { name: "x-request-source", value: "local" };

// Suffix added to client tools when forwarding to Claude provider (anti-ban cloaking)
export const CLAUDE_TOOL_SUFFIX = "_ide";

// CC native default tools — these are Claude Code's own tools, kept as decoys
// Client tools matching these names are skipped (not renamed), others get _cc suffix
export const CC_DEFAULT_TOOLS = new Set([
  "Task",
  "TaskOutput",
  "TaskStop",
  "TaskCreate",
  "TaskGet",
  "TaskUpdate",
  "TaskList",
  "Bash",
  "Glob",
  "Grep",
  "Read",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "AskUserQuestion",
  "Skill",
  "EnterPlanMode",
  "ExitPlanMode",
]);

// System prompts
export const CLAUDE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";

// Proactive token refresh lead times per provider (ms)
export const REFRESH_LEAD_MS = {
  codex:       5 * 24 * 60 * 60 * 1000, // 5 days
  claude:       4 * 60 * 60 * 1000,     // 4 hours
  iflow:       24 * 60 * 60 * 1000,     // 24 hours
  qwen:        20 * 60 * 1000,          // 20 minutes
  "kimi-coding": 5 * 60 * 1000,         // 5 minutes
  antigravity:  5 * 60 * 1000,          // 5 minutes
};

// OAuth endpoints
export const OAUTH_ENDPOINTS = {
  google: {
    token: "https://oauth2.googleapis.com/token",
    auth: "https://accounts.google.com/o/oauth2/auth"
  },
  openai: {
    token: "https://auth.openai.com/oauth/token",
    auth: "https://auth.openai.com/oauth/authorize"
  },
  anthropic: {
    token: "https://api.anthropic.com/v1/oauth/token",
    auth: "https://api.anthropic.com/v1/oauth/authorize"
  },
  qwen: {
    token: "https://qwen.ai/api/v1/oauth2/token",
    auth: "https://qwen.ai/api/v1/oauth2/device/code"
  },
  iflow: {
    token: "https://iflow.cn/oauth/token",
    auth: "https://iflow.cn/oauth"
  },
  github: {
    token: "https://github.com/login/oauth/access_token",
    auth: "https://github.com/login/oauth/authorize",
    deviceCode: "https://github.com/login/device/code"
  }
};

// Generate Kimi OAuth custom headers
export function buildKimiHeaders() {
  return {
    "X-Msh-Platform": "9router",
    "X-Msh-Version": "2.1.2",
    "X-Msh-Device-Model": typeof process !== "undefined" ? `${process.platform} ${process.arch}` : "unknown",
    "X-Msh-Device-Id": `kimi-${Date.now()}`
  };
}

// Default system instruction for Antigravity-backed Gemini requests.
export const ANTIGRAVITY_DEFAULT_SYSTEM = "You are an AI coding assistant. Follow the user's request carefully, preserve existing project behavior, and provide accurate, actionable answers.";
