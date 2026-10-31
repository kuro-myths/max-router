import fs from "node:fs";
import path from "path";
import os from "os";

const APP_NAME = "9router-v3";

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  // Runtime serverless (Vercel dsb.): hanya /tmp yang writable, home bersifat read-only.
  if (process.env.VERCEL) return path.join("/tmp", APP_NAME);
  const homeDir = path.join(os.homedir(), "." + APP_NAME);
  try {
    fs.mkdirSync(homeDir, { recursive: true });
    return homeDir;
  } catch {
    return path.join(os.tmpdir(), APP_NAME);
  }
}

export function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return defaultDir();
  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") {
      console.warn(`[DATA_DIR] '${configured}' not writable → fallback ~/.${APP_NAME}`);
      return defaultDir();
    }
    throw e;
  }
}

export const DATA_DIR = getDataDir();
