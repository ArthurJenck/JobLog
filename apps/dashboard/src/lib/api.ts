import type { ApplicationWithJob, Cv } from '@joblog/shared';

const BASE = '/api';

export interface LogoSearchResult {
  name: string;
  domain: string;
}

export interface AnalysisResult {
  keywords_matched: string[];
  keywords_missing: string[];
  requirements?: { keyword: string; present: boolean; evidence: string | null }[];
  insights: string;
  cached?: boolean;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), {
      status: res.status,
      code: typeof body.code === 'string' ? body.code : undefined,
    });
  }
  return res.json() as Promise<T>;
}

export const api = {
  applications: {
    list(params?: {
      status?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      sort?: string;
      dir?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }): Promise<{ data: ApplicationWithJob[]; total: number; page: number; pageSize: number }> {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.search) qs.set('search', params.search);
      if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
      if (params?.dateTo) qs.set('dateTo', params.dateTo);
      if (params?.sort) qs.set('sort', params.sort);
      if (params?.dir) qs.set('dir', params.dir);
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize));
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
    deleteEvent(id: string, event: { type: string; at: string }): Promise<{ ok: boolean }> {
      return request(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ deleteEvent: event }) });
    },
    updateEventDate(id: string, event: { type: string; at: string; newAt: string }): Promise<{ ok: boolean }> {
      return request(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ updateEventDate: event }) });
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/applications/${id}`, { method: 'DELETE' });
    },
    cancelAll(excludeId?: string): Promise<{ ok: boolean }> {
      return request('/applications', { method: 'PATCH', body: JSON.stringify({ cancelAll: true, excludeId }) });
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
    update(id: string, body: { label: string }): Promise<{ ok: boolean }> {
      return request(`/cvs?id=${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/cvs?id=${id}`, { method: 'DELETE' });
    },
  },
  analyses: {
    getCached(params: { cvId: string; applicationId: string }): Promise<{ analysis: AnalysisResult | null }> {
      const qs = new URLSearchParams({ cvId: params.cvId, applicationId: params.applicationId });
      return request(`/analyses?${qs.toString()}`);
    },
    create(body: { cvId: string; applicationId: string; force?: boolean; jobDescription?: string }): Promise<AnalysisResult> {
      return request('/analyses', { method: 'POST', body: JSON.stringify(body) });
    },
  },
  logos: {
    search(q: string): Promise<{ data: LogoSearchResult[] }> {
      const qs = new URLSearchParams({ q });
      return request(`/logos/search?${qs.toString()}`);
    },
  },
  stats: {
    get(): Promise<{ total: number; saved?: number; applied?: number; interview?: number; offer?: number; accepted?: number; rejected?: number; ghosted?: number; cancelled?: number }> {
      return request('/applications/stats');
    },
  },
};
