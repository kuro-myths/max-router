import { githubFetch, safeGitHubError } from "../../../../lib/githubConnector.js";

export async function GET_handler(req, res) {
  const owner = String(req.query.owner || "");
  const repo = String(req.query.repo || "");
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) return res.status(400).json({ error: "owner/repo tidak valid." });
  try {
    const pulls = await githubFetch(`/repos/${owner}/${repo}/pulls?state=open&per_page=30`);
    return res.json({ pullRequests: pulls.map((p: any) => ({ number: p.number, title: p.title, state: p.state, draft: p.draft, url: p.html_url, head: p.head?.ref, base: p.base?.ref })) });
  } catch (error) {
    const result = safeGitHubError(error);
    return res.status(result.status).json(result);
  }
}

export async function POST_handler(req, res) {
  const { owner, repo, title, body, head, base, draft } = req.body || {};
  if (![owner, repo, title, head, base].every((v) => typeof v === "string" && v.trim()) || !/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    return res.status(400).json({ error: "owner, repo, title, head, dan base wajib diisi." });
  }
  try {
    const pr = await githubFetch(`/repos/${owner}/${repo}/pulls`, {
      method: "POST", body: JSON.stringify({ title: String(title).slice(0, 256), body: String(body || "").slice(0, 60000), head, base, draft: Boolean(draft) }),
    });
    return res.status(201).json({ success: true, number: pr.number, url: pr.html_url, state: pr.state });
  } catch (error) {
    const result = safeGitHubError(error);
    return res.status(result.status).json(result);
  }
}
