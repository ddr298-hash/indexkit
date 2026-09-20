export interface GithubConfig {
  owner: string;
  repo: string;
  token: string;
}

const API = "https://api.github.com";

async function githubRequest(path: string, config: GithubConfig, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}) as { message?: string });
  return data.message || `${fallback} (${res.status})`;
}

/** Creates or updates a repo-level Actions variable (e.g. NAVER_BLOG_ID). */
export async function setRepoVariable(config: GithubConfig, name: string, value: string): Promise<void> {
  const patchRes = await githubRequest(`/repos/${config.owner}/${config.repo}/actions/variables/${name}`, config, {
    method: "PATCH",
    body: JSON.stringify({ name, value }),
  });

  if (patchRes.status === 404) {
    const createRes = await githubRequest(`/repos/${config.owner}/${config.repo}/actions/variables`, config, {
      method: "POST",
      body: JSON.stringify({ name, value }),
    });
    if (!createRes.ok) throw new Error(await readError(createRes, "변수 생성 실패"));
    return;
  }

  if (!patchRes.ok) throw new Error(await readError(patchRes, "변수 업데이트 실패"));
}

/** Manually triggers a workflow_dispatch run for the given workflow file. */
export async function triggerWorkflow(config: GithubConfig, workflowFile: string, ref = "main"): Promise<void> {
  const res = await githubRequest(
    `/repos/${config.owner}/${config.repo}/actions/workflows/${workflowFile}/dispatches`,
    config,
    { method: "POST", body: JSON.stringify({ ref }) },
  );
  if (!res.ok) throw new Error(await readError(res, "워크플로우 실행 실패"));
}
