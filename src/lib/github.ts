import sodium from "libsodium-wrappers";

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

/**
 * Creates or updates a repo secret. GitHub requires the value to be
 * encrypted client-side with the repo's public key (libsodium sealed box)
 * before it's sent — plaintext secrets aren't accepted by the API.
 */
export async function setRepoSecret(config: GithubConfig, name: string, value: string): Promise<void> {
  const keyRes = await githubRequest(`/repos/${config.owner}/${config.repo}/actions/secrets/public-key`, config);
  if (!keyRes.ok) throw new Error(await readError(keyRes, "저장소 공개키 조회 실패"));
  const { key, key_id } = (await keyRes.json()) as { key: string; key_id: string };

  await sodium.ready;
  const messageBytes = sodium.from_string(value);
  const keyBytes = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  const encryptedValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

  const putRes = await githubRequest(`/repos/${config.owner}/${config.repo}/actions/secrets/${name}`, config, {
    method: "PUT",
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id }),
  });
  if (!putRes.ok) throw new Error(await readError(putRes, "시크릿 저장 실패"));
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

/**
 * Enables GitHub Pages with the "GitHub Actions" build source if not already
 * enabled, and returns its public URL. Fails with a clear message if the
 * repo is private (GitHub Pages isn't available for private repos on the
 * free plan) — call setRepoVisibility("public") first if the user opted in.
 */
export async function enablePages(config: GithubConfig): Promise<string> {
  const getRes = await githubRequest(`/repos/${config.owner}/${config.repo}/pages`, config);
  if (getRes.ok) {
    const data = (await getRes.json()) as { html_url: string };
    return data.html_url;
  }

  const postRes = await githubRequest(`/repos/${config.owner}/${config.repo}/pages`, config, {
    method: "POST",
    body: JSON.stringify({ build_type: "workflow" }),
  });
  if (!postRes.ok) throw new Error(await readError(postRes, "GitHub Pages 활성화 실패"));
  const data = (await postRes.json()) as { html_url: string };
  return data.html_url;
}

/** Read-only lookup of the Pages URL — returns null if Pages isn't enabled yet, without creating it. */
export async function getPagesUrl(config: GithubConfig): Promise<string | null> {
  const res = await githubRequest(`/repos/${config.owner}/${config.repo}/pages`, config);
  if (!res.ok) return null;
  const data = (await res.json()) as { html_url: string };
  return data.html_url;
}

export async function getRepoVisibility(config: GithubConfig): Promise<"public" | "private"> {
  const res = await githubRequest(`/repos/${config.owner}/${config.repo}`, config);
  if (!res.ok) throw new Error(await readError(res, "저장소 정보 조회 실패"));
  const data = (await res.json()) as { visibility: "public" | "private" };
  return data.visibility;
}

export async function setRepoVisibility(config: GithubConfig, visibility: "public" | "private"): Promise<void> {
  const res = await githubRequest(`/repos/${config.owner}/${config.repo}`, config, {
    method: "PATCH",
    body: JSON.stringify({ visibility }),
  });
  if (!res.ok) throw new Error(await readError(res, "저장소 공개 설정 변경 실패"));
}
