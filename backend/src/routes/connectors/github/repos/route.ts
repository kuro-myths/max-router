import { githubFetch, safeGitHubError } from "../../../../lib/githubConnector.js";

export async function GET_handler(req, res) {
  try {
    const page = Math.max(1, Math.min(100, Number(req.query.page) || 1));
    const perPage = Math.max(1, Math.min(100, Number(req.query.per_page) || 50));
    const type = ["all", "owner", "public", "private", "member"].includes(String(req.query.type)) ? String(req.query.type) : "all";
    const repos = await githubFetch(`/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=${perPage}&page=${page}`);
    const filtered = type === "all" ? repos : repos.filter((repo: any) => type === "private" ? repo.private : type === "public" ? !repo.private : type === "owner" ? repo.owner?.login === repo.permissions?.admin : true);
    return res.json({ repositories: filtered.map((repo: any) => ({
      id: repo.id, fullName: repo.full_name, name: repo.name, description: repo.description,
      private: repo.private, defaultBranch: repo.default_branch, htmlUrl: repo.html_url,
      updatedAt: repo.updated_at, permissions: repo.permissions,
    })) });
  } catch (error) {
    const result = safeGitHubError(error);
    return res.status(result.status).json(result);
  }
}
