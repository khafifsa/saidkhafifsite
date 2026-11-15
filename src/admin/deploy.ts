/** Tracks whether the latest saved change is already live on the public site. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG, siteUrl } from './config';
import type { GitHub } from './github';

export type DeployState =
  | { status: 'idle' }
  | { status: 'pending'; sha: string; since: number }
  | { status: 'live'; sha: string }
  | { status: 'failed'; sha: string; url?: string }
  | { status: 'slow'; sha: string };

const KEY = 'admin.pending';
const TIMEOUT = 12 * 60 * 1000;

export function useDeploy(gh: GitHub | null) {
  const [state, setState] = useState<DeployState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { sha: string; since: number } | null;
      if (saved && Date.now() - saved.since < TIMEOUT) return { status: 'pending', ...saved };
    } catch {
      /* ignore */
    }
    return { status: 'idle' };
  });
  const timer = useRef<number>(0);

  const track = useCallback((sha: string) => {
    const since = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify({ sha, since }));
    } catch {
      /* ignore */
    }
    setState({ status: 'pending', sha, since });
  }, []);

  useEffect(() => {
    if (state.status !== 'pending' || !gh) return;
    const { sha, since } = state;
    let stopped = false;
    const finish = (next: DeployState) => {
      if (stopped) return;
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      setState(next);
    };
    const check = async () => {
      if (stopped) return;
      if (Date.now() - since > TIMEOUT) return finish({ status: 'slow', sha });
      try {
        const res = await fetch(`${siteUrl('build-info.json')}?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const info = (await res.json()) as { sha?: string };
          if (info.sha === sha) return finish({ status: 'live', sha });
          if (info.sha) {
            const cmp = await gh.compare(sha, info.sha).catch(() => null);
            if (cmp && (cmp.status === 'ahead' || cmp.status === 'identical')) return finish({ status: 'live', sha });
          }
        }
      } catch {
        /* site not reachable yet */
      }
      try {
        const runs = await gh.runsFor(sha);
        const failed = runs.workflow_runs.find((r) => r.conclusion === 'failure');
        if (failed) return finish({ status: 'failed', sha, url: failed.html_url });
      } catch {
        /* token may not have Actions permission — ignore */
      }
      timer.current = window.setTimeout(check, 9000);
    };
    timer.current = window.setTimeout(check, 4000);
    return () => {
      stopped = true;
      clearTimeout(timer.current);
    };
  }, [state, gh]);

  const dismiss = useCallback(() => setState({ status: 'idle' }), []);
  return { state, track, dismiss, actionsUrl: `https://github.com/${CONFIG.repo}/actions` };
}
