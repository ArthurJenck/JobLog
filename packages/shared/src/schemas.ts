import { z } from 'zod';
import {
  JOB_SOURCES,
  APPLICATION_STATUSES,
  CONTRACT_TYPES,
  REMOTE_TYPES,
  EVENT_TYPES,
  SCRAPE_METHODS,
  LOCATION_NORMALIZATION_STATUSES,
} from './constants.js';

export const SalarySchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.enum(['month', 'year']).nullable(),
});

export const LocationDetailsSchema = z.object({
  label: z.string(),
  city: z.string().nullable(),
  postcode: z.string().nullable(),
  citycode: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  type: z.string().nullable(),
  score: z.number().nullable(),
  source: z.literal('geoplateforme'),
  raw: z.record(z.unknown()).nullable(),
});

export const JobPostingSchema = z.object({
  _id: z.string(),
  url: z.string().url(),
  url_hash: z.string(),
  source: z.enum(JOB_SOURCES),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  location_details: LocationDetailsSchema.nullable().optional(),
  location_normalization_status: z.enum(LOCATION_NORMALIZATION_STATUSES).nullable().optional(),
  location_normalized_at: z.string().datetime().nullable().optional(),
  description: z.string().nullable(),
  contract_type: z.enum(CONTRACT_TYPES).nullable(),
  remote: z.enum(REMOTE_TYPES).nullable(),
  salary: SalarySchema.nullable(),
  requirements: z.array(z.string()).nullable(),
  keywords: z.array(z.string()).nullable(),
  company_website: z.string().nullable(),
  scrape_method: z.enum(SCRAPE_METHODS),
  scraped_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const JobPostingDraftSchema = JobPostingSchema.omit({
  _id: true,
  url_hash: true,
  scrape_method: true,
  scraped_at: true,
  created_at: true,
  updated_at: true,
}).partial({
  location: true,
  description: true,
  contract_type: true,
  remote: true,
  salary: true,
  requirements: true,
  keywords: true,
  company_website: true,
});

export const EventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  at: z.string().datetime(),
  meta: z.record(z.unknown()).nullable(),
});

export const ContactSchema = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const ReminderSchema = z.object({
  at: z.string().datetime().nullable(),
  frequencyDays: z.number().int().positive().default(7),
  maxCount: z.number().int().positive().default(3),
  sentCount: z.number().int().min(0).default(0),
  snoozedUntil: z.string().datetime().nullable(),
});

export const ApplicationSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  jobPostingId: z.string(),
  cvId: z.string().nullable(),
  status: z.enum(APPLICATION_STATUSES),
  appliedAt: z.string().datetime().nullable(),
  contact: ContactSchema.nullable(),
  notes: z.string().nullable(),
  events: z.array(EventSchema),
  reminder: ReminderSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const CvSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  label: z.string(),
  filename: z.string(),
  content: z.string(),
  content_hash: z.string(),
  uploadedAt: z.string().datetime(),
});

export const CvAnalysisSchema = z.object({
  _id: z.string(),
  cvHash: z.string(),
  jobPostingId: z.string(),
  keywords_matched: z.array(z.string()),
  keywords_missing: z.array(z.string()),
  insights: z.string(),
  generated_at: z.string().datetime(),
});

export const ApplicationWithJobSchema = ApplicationSchema.extend({
  jobPosting: JobPostingSchema,
});

export type Salary = z.infer<typeof SalarySchema>;
export type LocationDetails = z.infer<typeof LocationDetailsSchema>;
export type JobPosting = z.infer<typeof JobPostingSchema>;
export type JobPostingDraft = z.infer<typeof JobPostingDraftSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
export type Cv = z.infer<typeof CvSchema>;
export type CvAnalysis = z.infer<typeof CvAnalysisSchema>;
export type ApplicationWithJob = z.infer<typeof ApplicationWithJobSchema>;
