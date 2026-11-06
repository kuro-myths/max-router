import { githubFetch, safeGitHubError } from "../../../../lib/githubConnector.js";

export async function POST_handler(req, res) {
  const { owner, repo, branch, from } = req.body || {};
  if (![owner, repo, branch].every((v) => typeof v === "string" && /^[A-Za-z0-9_.\/-]{1,200}$/.test(v)) || branch.includes("..")) {
    return res.status(400).json({ error: "owner, repo, dan nama branch tidak valid." });
  }
  try {
    const base = await githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(String(from || "main"))}`);
    const result = await githubFetch(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
    });
    return res.status(201).json({ success: true, branch: result.ref, sha: result.object?.sha });
  } catch (error) {
    const result = safeGitHubError(error);
    return res.status(result.status).json(result);
  }
}
