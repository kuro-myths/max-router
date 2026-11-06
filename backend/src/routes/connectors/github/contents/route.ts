import { githubFetch, safeGitHubError } from "../../../../lib/githubConnector.js";

function validRepoPart(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value) && value !== "." && value !== "..";
}
function validPath(value: unknown) {
  return typeof value === "string" && value.length <= 1000 && (value === "" || !value.split("/").some((part) => !part || part === "." || part === ".."));
}

export async function GET_handler(req, res) {
  const owner = String(req.query.owner || "");
  const repo = String(req.query.repo || "");
  const path = String(req.query.path || "");
  const ref = String(req.query.ref || "");
  if (!validRepoPart(owner) || !validRepoPart(repo) || !validPath(path)) return res.status(400).json({ error: "owner, repo, dan path tidak valid." });
  try {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const data = await githubFetch(`/repos/${owner}/${repo}/contents${path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : ""}${query}`);
    if (Array.isArray(data)) return res.json({ type: "directory", entries: data.map((item: any) => ({ name: item.name, path: item.path, type: item.type, size: item.size, sha: item.sha, htmlUrl: item.html_url })) });
    if (data.type !== "file") return res.status(400).json({ error: "Path bukan file atau direktori yang didukung." });
    if (data.size > 1_000_000) return res.status(413).json({ error: "File lebih besar dari batas editor 1 MB." });
    const content = data.encoding === "base64" ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8") : data.content;
    return res.json({ type: "file", name: data.name, path: data.path, sha: data.sha, size: data.size, content, htmlUrl: data.html_url });
  } catch (error) {
    const result = safeGitHubError(error);
    return res.status(result.status).json(result);
  }
}

export async function PUT_handler(req, res) {
  const { owner, repo, path, content, sha, branch, message } = req.body || {};
  if (!validRepoPart(owner) || !validRepoPart(repo) || !validPath(path) || typeof content !== "string" || content.length > 1_000_000 || typeof sha !== "string" || !sha) {
    return res.status(400).json({ error: "owner, repo, path, content (maks. 1 MB), dan sha wajib valid." });
  }
  try {
    const result = await githubFetch(`/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "PUT",
      body: JSON.stringify({ message: String(message || `Update ${path}`).slice(0, 200), content: Buffer.from(content, "utf8").toString("base64"), sha, ...(branch ? { branch: String(branch).slice(0, 255) } : {}) }),
    });
    return res.json({ success: true, commit: { sha: result.commit?.sha, url: result.commit?.html_url }, content: { sha: result.content?.sha, path: result.content?.path } });
  } catch (error) {
    const result = safeGitHubError(error);
    return res.status(result.status).json(result);
  }
}
