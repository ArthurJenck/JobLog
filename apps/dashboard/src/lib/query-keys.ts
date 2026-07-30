import type { api } from '@/lib/api';

type ApplicationListParams = NonNullable<Parameters<typeof api.applications.list>[0]>;

export const qk = {
  session: ['session'] as const,
  user: ['user'] as const,
  applications: {
    all: ['applications'] as const,
    list: (params?: ApplicationListParams) => ['applications', 'list', params] as const,
    detail: (id: string) => ['applications', 'detail', id] as const,
  },
  jobPostings: {
    all: ['jobPostings'] as const,
    fromUrlUsage: ['jobPostings', 'from-url', 'usage'] as const,
  },
  cvs: {
    all: ['cvs'] as const,
    skills: (cvId: string) => ['cvs', 'skills', cvId] as const,
  },
  platforms: {
    all: ['platforms'] as const,
    metadata: (url: string) => ['platforms', 'metadata', url] as const,
  },
  analyses: (cvId: string, applicationId: string) => ['analyses', cvId, applicationId] as const,
  logos: (q: string) => ['logos', q] as const,
  addresses: (q: string) => ['addresses', q] as const,
  stats: ['stats'] as const,
  tasks: (dayKey: string) => ['tasks', dayKey] as const,
  tasksAll: ['tasks'] as const,
  streak: ['streak'] as const,
  pushSettings: ['push', 'settings'] as const,
} as const;
