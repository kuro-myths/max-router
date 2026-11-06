import { githubFetch, safeGitHubError } from "../../../../lib/githubConnector.js";

export async function GET_handler(req, res) {
  const owner = String(req.query.owner || "");
  const repo = String(req.query.repo || "");
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) return res.status(400).json({ error: "owner/repo tidak valid." });
  try {
    const result = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=100`);
    return res.json({ branches: result.map((item: any) => ({ name: item.name, protected: item.protected, sha: item.commit?.sha })) });
  } catch (error) {
    const result = safeGitHubError(error);
    return res.status(result.status).json(result);
  }
}

export async function POST_handler(req, res) {
  const { owner, repo, branch, from } = req.body || {};
  if (![owner, repo, branch].every((v) => typeof v === "string" && /^[A-Za-z0-9_.\/-]{1,200}$/.test(v)) || branch.includes("..")) {
    return res.status(400).json({ error: "owner, repo, dan nama branch tidak valid." });
  }
  try {
    const base = await githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(String(from || "HEAD"))}`);
    const result = await githubFetch(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
    });
    return res.status(201).json({ success: true, branch: result.ref, sha: result.object?.sha });
  } catch (error) {
    const result = safeGitHubError(error);
    return res.status(result.status).json(result);
  }
}
