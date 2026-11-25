import { getProjectUpdateFileMap } from './updateBundle';

export interface GitHubPushOptions {
  repoInput: string;
  token: string;
  branch?: string;
  commitMessage?: string;
  onProgress?: (msg: string) => void;
}

export interface GitHubPushResult {
  ok: boolean;
  message: string;
  commitUrl?: string;
  actionsUrl?: string;
  branch?: string;
  fileCount?: number;
  workflowSkipped?: boolean;
}

export function parseGitHubRepoInput(raw: string): { owner: string; repo: string } | null {
  const cleaned = raw.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!cleaned) return null;

  const urlMatch = cleaned.match(/github\.com[/:]([^/\s]+)\/([^/\s?#]+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  const shortMatch = cleaned.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}

async function ghRequest<T = any>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const errMsg = json?.message || text || `HTTP ${res.status}`;
    const error = new Error(errMsg) as Error & { status?: number; payload?: any };
    error.status = res.status;
    error.payload = json;
    throw error;
  }

  return json as T;
}

export async function pushProjectUpdateToGitHub(
  options: GitHubPushOptions
): Promise<GitHubPushResult> {
  const parsed = parseGitHubRepoInput(options.repoInput);
  if (!parsed) {
    return {
      ok: false,
      message: 'Tên repo không hợp lệ. Nhập dạng "username/ten-repo" hoặc dán link GitHub repo.',
    };
  }

  const token = options.token.trim();
  if (!token || token.length < 10) {
    return {
      ok: false,
      message: 'Vui lòng nhập GitHub Personal Access Token (PAT) hợp lệ.',
    };
  }

  const { owner, repo } = parsed;
  const { onProgress } = options;

  try {
    onProgress?.(`Đang kiểm tra repository ${owner}/${repo}...`);
    const repoInfo = await ghRequest<{ default_branch?: string; permissions?: { push?: boolean } }>(
      `/repos/${owner}/${repo}`,
      token
    );

    if (repoInfo?.permissions && repoInfo.permissions.push === false) {
      return {
        ok: false,
        message: 'Token này chỉ có quyền đọc, không có quyền ghi (push) vào repository.',
      };
    }

    const targetBranch = (options.branch || '').trim() || repoInfo.default_branch || 'main';

    // 1. Get HEAD commit SHA (or initialize empty repo if needed)
    let headCommitSha = '';
    let baseTreeSha: string | undefined;

    try {
      const refData = await ghRequest<{ object: { sha: string } }>(
        `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
        token
      );
      headCommitSha = refData.object.sha;
      const commitData = await ghRequest<{ tree: { sha: string } }>(
        `/repos/${owner}/${repo}/git/commits/${headCommitSha}`,
        token
      );
      baseTreeSha = commitData.tree.sha;
    } catch (refErr: any) {
      if (refErr?.status === 404 || refErr?.status === 409) {
        onProgress?.(`Kho ${owner}/${repo} chưa có nhánh ${targetBranch}, đang khởi tạo nhánh...`);
        const initContentB64 = btoa('# Pydroid 3 Web\n');
        const initRes = await ghRequest<{ commit: { sha: string } }>(
          `/repos/${owner}/${repo}/contents/README.md`,
          token,
          {
            method: 'PUT',
            body: JSON.stringify({
              message: 'Initialize repository',
              content: initContentB64,
              branch: targetBranch,
            }),
          }
        );
        headCommitSha = initRes.commit.sha;
        const commitData = await ghRequest<{ tree: { sha: string } }>(
          `/repos/${owner}/${repo}/git/commits/${headCommitSha}`,
          token
        );
        baseTreeSha = commitData.tree.sha;
      } else {
        throw refErr;
      }
    }

    // 2. Load snapshot of all current source files
    onProgress?.('Đang thu thập toàn bộ mã nguồn mới nhất...');
    const snapshot = await getProjectUpdateFileMap(true);

    interface UploadFileItem {
      path: string;
      content: string;
      encoding: 'utf-8' | 'base64';
    }

    const allFiles: UploadFileItem[] = [
      ...Object.entries(snapshot.textFiles).map(([path, content]) => ({
        path,
        content,
        encoding: 'utf-8' as const,
      })),
      ...Object.entries(snapshot.binaryBase64Files).map(([path, content]) => ({
        path,
        content,
        encoding: 'base64' as const,
      })),
    ].sort((a, b) => a.path.localeCompare(b.path));

    // 3. Upload blobs in parallel batches of 6
    const treeEntries: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
      sha: string;
    }> = [];

    const BATCH_SIZE = 6;
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      onProgress?.(
        `Đang tải tệp lên GitHub (${Math.min(i + batch.length, allFiles.length)}/${allFiles.length})...`
      );
      const uploaded = await Promise.all(
        batch.map(async (file) => {
          const blob = await ghRequest<{ sha: string }>(
            `/repos/${owner}/${repo}/git/blobs`,
            token,
            {
              method: 'POST',
              body: JSON.stringify({
                content: file.content,
                encoding: file.encoding,
              }),
            }
          );
          return {
            path: file.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blob.sha,
          };
        })
      );
      treeEntries.push(...uploaded);
    }

    const commitMsg =
      (options.commitMessage || '').trim() ||
      `Update Pydroid 3 Web source (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`;

    const commitAndUpdateRef = async (
      entries: typeof treeEntries
    ): Promise<{ sha: string; html_url?: string }> => {
      onProgress?.('Đang tạo cây thư mục Git & commit cập nhật...');
      const tree = await ghRequest<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, token, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: entries,
        }),
      });

      const commit = await ghRequest<{ sha: string; html_url?: string }>(
        `/repos/${owner}/${repo}/git/commits`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            message: commitMsg,
            tree: tree.sha,
            parents: headCommitSha ? [headCommitSha] : [],
          }),
        }
      );

      onProgress?.(`Đang cập nhật nhánh ${targetBranch}...`);
      await ghRequest(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(targetBranch)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          sha: commit.sha,
          force: false,
        }),
      });

      return commit;
    };

    let finalCommit: { sha: string; html_url?: string };
    let workflowSkipped = false;
    let pushedCount = treeEntries.length;

    try {
      finalCommit = await commitAndUpdateRef(treeEntries);
    } catch (pushErr: any) {
      const msg = String(pushErr?.message || '').toLowerCase();
      const isWorkflowScopeError =
        pushErr?.status === 403 ||
        pushErr?.status === 422 ||
        msg.includes('workflow') ||
        msg.includes('refusing to allow');

      if (!isWorkflowScopeError) {
        throw pushErr;
      }

      // Token does not have `workflow` scope: retry committing all source/config files without `.github/workflows/`
      onProgress?.(
        'Token chưa bật quyền "workflow" — đang đẩy trước toàn bộ src/, cấu hình & icon...'
      );
      const nonWorkflowEntries = treeEntries.filter(
        (item) => !item.path.startsWith('.github/workflows/')
      );
      pushedCount = nonWorkflowEntries.length;
      workflowSkipped = true;
      finalCommit = await commitAndUpdateRef(nonWorkflowEntries);

      // Try manually dispatching existing build-apk.yml on the repo if workflow_dispatch is already enabled
      try {
        await ghRequest(
          `/repos/${owner}/${repo}/actions/workflows/build-apk.yml/dispatches`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({ ref: targetBranch }),
          }
        );
      } catch {
        // Repo will still trigger on push if workflow already listens to this branch
      }
    }

    const actionsUrl = `https://github.com/${owner}/${repo}/actions`;
    const commitUrl =
      finalCommit.html_url || `https://github.com/${owner}/${repo}/commit/${finalCommit.sha}`;

    if (workflowSkipped) {
      return {
        ok: true,
        workflowSkipped: true,
        branch: targetBranch,
        fileCount: pushedCount,
        commitUrl,
        actionsUrl,
        message: `Đã đẩy ${pushedCount} tệp mã nguồn mới lên nhánh "${targetBranch}"! Lưu ý: Token chưa có quyền "workflow" nên file .github/workflows/build-apk.yml cũ chưa được ghi đè (nếu Actions không tự chạy, hãy cấp thêm quyền "workflow" cho Token rồi bấm đẩy lại).`,
      };
    }

    return {
      ok: true,
      workflowSkipped: false,
      branch: targetBranch,
      fileCount: pushedCount,
      commitUrl,
      actionsUrl,
      message: `Đã đẩy thành công ${pushedCount} tệp (gồm src/, icon & build-apk.yml) lên nhánh "${targetBranch}"! GitHub Actions sẽ tự động biên dịch APK mới.`,
    };
  } catch (err: any) {
    const rawMsg = String(err?.message || err || 'Lỗi kết nối GitHub');
    let friendly = rawMsg;
    if (err?.status === 401 || rawMsg.toLowerCase().includes('bad credentials')) {
      friendly = 'GitHub Token không hợp lệ hoặc đã hết hạn (401).';
    } else if (err?.status === 404) {
      friendly = `Không tìm thấy repo "${owner}/${repo}" hoặc Token chưa có quyền truy cập repo này (404).`;
    } else if (err?.status === 403) {
      friendly = `Token thiếu quyền ghi repo hoặc đã vượt giới hạn API GitHub (${rawMsg}).`;
    }
    return {
      ok: false,
      message: friendly,
    };
  }
}
