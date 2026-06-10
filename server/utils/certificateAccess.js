/**
 * Cohort certificate access windows — students & public verification.
 * Staff/admin downloads are not gated by these rules.
 */

function isCertificateWindowOpenForCohort(row) {
  if (!row) return true;
  // No cohort on the student — certificates remain accessible
  if (row.cohort_id == null) return true;
  const enabled = Number(row.cert_access_enabled || 0) === 1;
  if (!enabled) return false;
  const now = new Date();
  if (row.cert_access_start) {
    const start = new Date(row.cert_access_start);
    if (now < start) return false;
  }
  if (row.cert_access_end) {
    const end = new Date(row.cert_access_end);
    if (now > end) return false;
  }
  return true;
}

function isCertificatePublicAccessBlocked(row) {
  if (!row || row.cohort_id == null) return false;
  return !isCertificateWindowOpenForCohort(row);
}

module.exports = {
  isCertificateWindowOpenForCohort,
  isCertificatePublicAccessBlocked
};
