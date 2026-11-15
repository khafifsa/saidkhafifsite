/** Minimal GitHub REST/GraphQL client used by the admin panel (runs in the browser). */
import { toBase64 } from '../lib/docx/convert';

export class GitHubError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail || `GitHub ${status}`);
  }
}

export interface TreeEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  sha: string | null;
}

export interface Change {
  /** path inside the repository, e.g. "content/lectures/l-1.json" */
  path: string;
  /** new content, or null to delete the file */
  content: Uint8Array | string | null;
  /** label shown while uploading (big files) */
  label?: string;
}

export type Progress = (info: { label: string; ratio: number }) => void;

export class GitHub {
  readonly owner: string;
  readonly name: string;

  constructor(
    private token: string,
    readonly repo: string,
    readonly branch: string,
    private api = 'https://api.github.com',
  ) {
    const [owner, name] = repo.split('/');
    this.owner = owner ?? '';
    this.name = name ?? '';
  }

  private headers(json: boolean, accept = 'application/vnd.github+json'): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.token}`, Accept: accept };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async request<T>(method: string, path: string, body?: unknown, accept?: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.api + path, {
        method,
        headers: this.headers(body !== undefined, accept),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new GitHubError(0, 'network');
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { message?: string }).message ?? '';
      } catch {
        /* ignore */
      }
      throw new GitHubError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    if (accept?.includes('raw')) return (await res.text()) as T;
    return (await res.json()) as T;
  }

  repoInfo() {
    return this.request<{ default_branch: string; permissions?: { push?: boolean; admin?: boolean }; html_url: string; private: boolean }>(
      'GET',
      `/repos/${this.repo}`,
    );
  }

  async headSha(): Promise<string> {
    const ref = await this.request<{ object: { sha: string } }>('GET', `/repos/${this.repo}/git/ref/heads/${encodeURIComponent(this.branch)}`);
    return ref.object.sha;
  }

  async treeOf(commitSha: string): Promise<string> {
    const commit = await this.request<{ tree: { sha: string } }>('GET', `/repos/${this.repo}/git/commits/${commitSha}`);
    return commit.tree.sha;
  }

  /** Upload one blob; uses XHR for large files so we can show progress. */
  createBlob(bytes: Uint8Array, onProgress?: (ratio: number) => void): Promise<string> {
    const content = toBase64(bytes);
    if (!onProgress || bytes.length < 512 * 1024) {
      return this.request<{ sha: string }>('POST', `/repos/${this.repo}/git/blobs`, { content, encoding: 'base64' }).then((r) => r.sha);
    }
    const body = JSON.stringify({ content, encoding: 'base64' });
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.api}/repos/${this.repo}/git/blobs`);
      for (const [k, v] of Object.entries(this.headers(true))) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve((JSON.parse(xhr.responseText) as { sha: string }).sha);
          } catch {
            reject(new GitHubError(xhr.status, 'bad response'));
          }
        } else {
          let detail = '';
          try {
            detail = (JSON.parse(xhr.responseText) as { message?: string }).message ?? '';
          } catch {
            /* ignore */
          }
          reject(new GitHubError(xhr.status, detail));
        }
      };
      xhr.onerror = () => reject(new GitHubError(0, 'network'));
      xhr.send(body);
    });
  }

  /**
   * Writes several files in a single commit (Git Data API).
   * Blobs are uploaded once; tree/commit/ref are retried if someone else pushed meanwhile.
   */
  async commit(changes: Change[], message: string, progress?: Progress): Promise<string> {
    const entries: TreeEntry[] = [];
    const enc = new TextEncoder();
    const uploads = changes.filter((c) => c.content !== null);
    let done = 0;
    for (const change of changes) {
      if (change.content === null) {
        entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const bytes = typeof change.content === 'string' ? enc.encode(change.content) : change.content;
      const label = change.label ?? 'حفظ البيانات';
      progress?.({ label, ratio: done / Math.max(1, uploads.length) });
      const sha = await this.createBlob(bytes, (r) => progress?.({ label, ratio: (done + r) / Math.max(1, uploads.length) }));
      done++;
      entries.push({ path: change.path, mode: '100644', type: 'blob', sha });
    }
    progress?.({ label: 'نشر التغييرات', ratio: 1 });
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.headSha();
      const baseTree = await this.treeOf(head);
      const tree = await this.request<{ sha: string }>('POST', `/repos/${this.repo}/git/trees`, { base_tree: baseTree, tree: entries });
      const commit = await this.request<{ sha: string }>('POST', `/repos/${this.repo}/git/commits`, {
        message,
        tree: tree.sha,
        parents: [head],
      });
      try {
        await this.request('PATCH', `/repos/${this.repo}/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha: commit.sha, force: false });
        return commit.sha;
      } catch (e) {
        lastError = e;
        if (e instanceof GitHubError && (e.status === 422 || e.status === 409)) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  graphql<T>(query: string, variables: Record<string, unknown>): Promise<{ data: T; errors?: { message: string }[] }> {
    return this.request('POST', '/graphql', { query, variables });
  }

  raw(path: string): Promise<string> {
    const p = path.split('/').map(encodeURIComponent).join('/');
    return this.request<string>('GET', `/repos/${this.repo}/contents/${p}?ref=${encodeURIComponent(this.branch)}`, undefined, 'application/vnd.github.raw+json');
  }

  async treeSize(prefix: string): Promise<number> {
    const head = await this.headSha();
    const tree = await this.request<{ tree: { path: string; type: string; size?: number }[] }>(
      'GET',
      `/repos/${this.repo}/git/trees/${await this.treeOf(head)}?recursive=1`,
    );
    return tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith(prefix)).reduce((sum, t) => sum + (t.size ?? 0), 0);
  }

  compare(base: string, head: string) {
    return this.request<{ status: 'ahead' | 'behind' | 'identical' | 'diverged' }>('GET', `/repos/${this.repo}/compare/${base}...${head}`);
  }

  runsFor(sha: string) {
    return this.request<{ workflow_runs: { status: string; conclusion: string | null; html_url: string }[] }>(
      'GET',
      `/repos/${this.repo}/actions/runs?head_sha=${sha}&per_page=5`,
    );
  }
}

export function describeError(e: unknown): string {
  if (e instanceof GitHubError) {
    switch (e.status) {
      case 0:
        return 'تعذّر الاتصال بالإنترنت. تحقّق من الشبكة ثم أعد المحاولة.';
      case 401:
        return 'مفتاح الدخول غير صحيح أو انتهت صلاحيته. سجّل الدخول من جديد.';
      case 403:
        return /rate limit/i.test(e.detail)
          ? 'تم تجاوز عدد الطلبات المسموح به مؤقتاً. انتظر بضع دقائق ثم أعد المحاولة.'
          : 'لا يملك مفتاح الدخول صلاحية الكتابة على مستودع الموقع.';
      case 404:
        return 'المستودع غير موجود، أو أن مفتاح الدخول لا يملك صلاحية الوصول إليه.';
      case 409:
      case 422:
        return /too large|size/i.test(e.detail)
          ? 'الملف كبير جداً بالنسبة لخادم GitHub. حاول ضغطه ثم أعد المحاولة.'
          : 'تعذّر الحفظ بسبب تعارض مؤقت. أعد المحاولة.';
      case 413:
        return 'الملف كبير جداً. حاول ضغطه (مثلاً بموقع لضغط ملفات PDF) ثم أعد رفعه.';
      default:
        return `حدث خطأ غير متوقع (${e.status}). أعد المحاولة بعد قليل.`;
    }
  }
  return (e as Error)?.message || 'حدث خطأ غير متوقع.';
}
