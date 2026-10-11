import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

export default {
  version: 5,
  name: "rename-atria-generic-connection",
  up(db) {
    const rows = db.all("SELECT id, name, data, updatedAt FROM providerConnections");
    const now = new Date().toISOString();
    for (const row of rows) {
      const data = parseJson(row.data, {}) || {};
      const details = data.providerSpecificData || {};
      const baseUrl = String(details.baseUrl || data.baseUrl || "").trim();
      let host = "";
      try { host = new URL(baseUrl).hostname.toLowerCase(); } catch {}
      if (!/(^|\\.)atria-asi\\.ai$/.test(host)) continue;

      const currentName = String(row.name || data.name || "").trim();
      if (currentName && !/^(key|api key|kunci)(\\s*#?\\s*\\d+)?$/i.test(currentName)) continue;

      const nextData = {
        ...data,
        name: "Atria",
        providerSpecificData: { ...details, nodeName: "Atria" },
      };
      db.run(
        "UPDATE providerConnections SET name = ?, data = ?, updatedAt = ? WHERE id = ?",
        ["Atria", stringifyJson(nextData), now, row.id],
      );
    }
  },
};
