import type { ApplicationWithJob, Cv, QuestRecurrence, QuestDetectionSignal } from '@joblog/shared';

const BASE = '/api';

export interface UrlPasteUsage {
  date: string;
  count: number;
  warningAt: number;
  limit: number;
  remaining: number;
  shouldWarn: boolean;
  isBlocked: boolean;
}

export interface FromUrlMeta {
  usage: UrlPasteUsage;
  extensionUrl: string | null;
}

export type FromUrlResponse = Record<string, unknown> & Partial<FromUrlMeta>;

export interface FromUrlApplicationResponse extends FromUrlMeta {
  applicationId: string;
  jobPostingId: string;
  scrapeStatus: 'queued' | 'processing' | 'succeeded' | 'failed';
  cached?: boolean;
}

export interface LogoSearchResult {
  name: string;
  domain: string;
}

export interface AddressSearchResult {
  label: string;
  city: string | null;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
  type: string | null;
  classification: number | null;
}

export interface Platform {
  _id: string;
  userId: string;
  name: string;
  url: string;
  domain: string | null;
  faviconUrl: string | null;
  order: number;
  lastClickedAt: string | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Quest {
  _id: string;
  userId: string;
  key: string | null;
  title: string;
  recurrence: QuestRecurrence;
  target: number | null;
  detectionSignal: QuestDetectionSignal | null;
  enabled: boolean;
  order: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  detected: boolean;
  progress: number | null;
}

export interface Streak {
  current: number;
  longest: number;
  lastActiveDay: string | null;
  lastPerfectDay: string | null;
}

export interface SkillCount {
  skill: string;
  count: number;
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
      providerStatus: body.providerStatus,
      usage: body.usage,
      extensionUrl: body.extensionUrl,
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
    bulkStatus(ids: string[], status: string): Promise<{ ok: boolean; updated: number }> {
      return request('/applications', { method: 'PATCH', body: JSON.stringify({ bulkStatus: { ids, status } }) });
    },
    bulkDelete(ids: string[]): Promise<{ ok: boolean; deleted: number }> {
      return request('/applications', { method: 'PATCH', body: JSON.stringify({ bulkDelete: { ids } }) });
    },
  },
  jobPostings: {
    create(body: Record<string, unknown>): Promise<{ jobPostingId: string; cached: boolean }> {
      return request('/job-postings', { method: 'POST', body: JSON.stringify(body) });
    },
    getFromUrlUsage(): Promise<FromUrlMeta> {
      return request('/job-postings/from-url');
    },
    fromUrl(url: string): Promise<FromUrlResponse> {
      return request('/job-postings/from-url', { method: 'POST', body: JSON.stringify({ url }) });
    },
    createFromUrl(url: string): Promise<FromUrlApplicationResponse> {
      return request('/job-postings/from-url', { method: 'POST', body: JSON.stringify({ url }) });
    },
    retryFromUrl(applicationId: string): Promise<FromUrlApplicationResponse> {
      return request('/job-postings/from-url/retry', { method: 'POST', body: JSON.stringify({ applicationId }) });
    },
  },
  cvs: {
    list(): Promise<{ data: Omit<Cv, 'content'>[] }> {
      return request('/cvs');
    },
    create(body: { label: string; filename: string; content: string }): Promise<{ cvId: string }> {
      return request('/cvs', { method: 'POST', body: JSON.stringify(body) });
    },
    update(id: string, body: { label?: string; isDefault?: boolean }): Promise<{ ok: boolean }> {
      return request(`/cvs?id=${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/cvs?id=${id}`, { method: 'DELETE' });
    },
    skills(cvId: string): Promise<{ present: SkillCount[]; missing: SkillCount[]; analyzedCount: number }> {
      const qs = new URLSearchParams({ cvId });
      return request(`/cvs/skills?${qs.toString()}`);
    },
    resetAnalyses(cvId: string): Promise<{ deleted: number }> {
      const qs = new URLSearchParams({ cvId });
      return request(`/cvs/skills?${qs.toString()}`, { method: 'DELETE' });
    },
  },
  platforms: {
    list(): Promise<{ data: Platform[] }> {
      return request('/platforms');
    },
    create(body: { url: string; name: string; domain?: string | null; faviconUrl?: string | null }): Promise<{ platformId: string }> {
      return request('/platforms', { method: 'POST', body: JSON.stringify(body) });
    },
    update(id: string, body: { name?: string; url?: string }): Promise<{ ok: boolean }> {
      return request(`/platforms?id=${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    reorder(order: string[]): Promise<{ ok: boolean }> {
      return request('/platforms', { method: 'PATCH', body: JSON.stringify({ order }) });
    },
    markClicked(id: string): Promise<{ ok: boolean }> {
      return request(`/platforms?id=${id}`, { method: 'PATCH', body: JSON.stringify({ clicked: true }) });
    },
    markAllClicked(): Promise<{ ok: boolean }> {
      return request('/platforms', { method: 'PATCH', body: JSON.stringify({ clickAll: true }) });
    },
    setChecked(id: string, checked: boolean): Promise<{ ok: boolean }> {
      return request(`/platforms?id=${id}`, { method: 'PATCH', body: JSON.stringify({ checked }) });
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/platforms?id=${id}`, { method: 'DELETE' });
    },
    metadata(url: string): Promise<{ name: string; faviconUrl: string | null; domain: string }> {
      const qs = new URLSearchParams({ url });
      return request(`/platforms/metadata?${qs.toString()}`);
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
  addresses: {
    search(q: string, signal?: AbortSignal): Promise<{ data: AddressSearchResult[] }> {
      const qs = new URLSearchParams({ q });
      return request(`/addresses/search?${qs.toString()}`, { signal });
    },
  },
  stats: {
    get(): Promise<{ total: number; saved?: number; applied?: number; interview?: number; offer?: number; accepted?: number; rejected?: number; ghosted?: number; cancelled?: number }> {
      return request('/applications/stats');
    },
  },
  tasks: {
    list(dayStart: string, dayEnd: string): Promise<{ data: Quest[] }> {
      const qs = new URLSearchParams({ dayStart, dayEnd });
      return request(`/tasks?${qs.toString()}`);
    },
    activateCatalogQuest(key: string): Promise<{ questId: string }> {
      return request('/tasks', { method: 'POST', body: JSON.stringify({ key }) });
    },
    createCustom(body: { title: string; recurrence: QuestRecurrence; target?: number | null }): Promise<{ questId: string }> {
      return request('/tasks', { method: 'POST', body: JSON.stringify(body) });
    },
    update(id: string, body: { title?: string; recurrence?: QuestRecurrence; target?: number | null; enabled?: boolean }): Promise<{ ok: boolean }> {
      return request(`/tasks?id=${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    setCompleted(id: string, completed: boolean): Promise<{ ok: boolean }> {
      return request(`/tasks?id=${id}`, { method: 'PATCH', body: JSON.stringify({ completed }) });
    },
    reorder(order: string[]): Promise<{ ok: boolean }> {
      return request('/tasks', { method: 'PATCH', body: JSON.stringify({ order }) });
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/tasks?id=${id}`, { method: 'DELETE' });
    },
  },
  streak: {
    get(): Promise<Streak> {
      return request('/streak');
    },
    ping(today: string): Promise<Streak> {
      return request('/streak', { method: 'POST', body: JSON.stringify({ today }) });
    },
    markPerfect(today: string): Promise<Streak> {
      return request('/streak', { method: 'PATCH', body: JSON.stringify({ today }) });
    },
  },
};
