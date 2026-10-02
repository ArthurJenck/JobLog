import { ObjectId } from 'mongodb';
import { getCollection } from '../../lib/db.js';
import { ApiError } from '../../lib/http/errors.js';

export async function loadApplicationWithJob(userId: string, applicationId: ObjectId) {
  const applications = await getCollection('applications');
  const application = await applications.findOne({ _id: applicationId, userId });
  if (!application) throw ApiError.notFound('Candidature introuvable');

  const jobPostingId = String(application.jobPostingId ?? '');
  const jobPosting = ObjectId.isValid(jobPostingId)
    ? await (await getCollection('job_postings')).findOne({
        _id: new ObjectId(jobPostingId),
        userId,
      })
    : null;

  return {
    ...application,
    _id: application._id.toString(),
    jobPosting: jobPosting
      ? { ...jobPosting, _id: jobPosting._id.toString() }
      : null,
  };
}
