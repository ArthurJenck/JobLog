import type { ApplicationWithJob, Cv } from '@joblog/shared';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export const api = {
  applications: {
    list(params?: { status?: string; search?: string }): Promise<{ data: ApplicationWithJob[]; total: number }> {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.search) qs.set('search', params.search);
      return request(`/applications?${qs}`);
    },
    get(id: string): Promise<ApplicationWithJob> {
      return request(`/applications/${id}`);
    },
    create(body: { jobPostingId: string; status?: string; cvId?: string | null }): Promise<{ applicationId: string }> {
      return request('/applications', { method: 'POST', body: JSON.stringify(body) });
    },
    patch(id: string, body: Record<string, unknown>): Promise<{ ok: boolean }> {
      return request(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    addEvent(id: string, event: { type: string; at?: string; meta?: Record<string, unknown> | null }): Promise<{ ok: boolean }> {
      return request(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ event }) });
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/applications/${id}`, { method: 'DELETE' });
    },
  },
  jobPostings: {
    create(body: Record<string, unknown>): Promise<{ jobPostingId: string; cached: boolean }> {
      return request('/job-postings', { method: 'POST', body: JSON.stringify(body) });
    },
    fromUrl(url: string): Promise<Record<string, unknown>> {
      return request('/job-postings/from-url', { method: 'POST', body: JSON.stringify({ url }) });
    },
  },
  cvs: {
    list(): Promise<{ data: Omit<Cv, 'content'>[] }> {
      return request('/cvs');
    },
    create(body: { label: string; filename: string; content: string }): Promise<{ cvId: string }> {
      return request('/cvs', { method: 'POST', body: JSON.stringify(body) });
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/cvs?id=${id}`, { method: 'DELETE' });
    },
  },
  analyses: {
    create(body: { cvId: string; applicationId: string; force?: boolean }): Promise<{ keywords_matched: string[]; keywords_missing: string[]; insights: string; cached?: boolean }> {
      return request('/analyses', { method: 'POST', body: JSON.stringify(body) });
    },
  },
  stats: {
    get(): Promise<{ total: number; saved?: number; applied?: number; interview?: number; offer?: number; rejected?: number; ghosted?: number }> {
      return request('/applications/stats');
    },
  },
};
