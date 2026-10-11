import m001 from "./001-initial.js";
import m002 from "./002-composite-unique.js";
import m003 from "./003-remove-legacy-providers.js";
import m004 from "./004-email-center.js";
import m005 from "./005-rename-atria-key.js";

export const MIGRATIONS = [m001, m002, m003, m004, m005].sort((a, b) => a.version - b.version);
export function latestVersion() { return MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0; }
