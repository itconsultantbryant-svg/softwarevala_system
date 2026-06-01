import React, { useState } from 'react';

/**
 * Toolbar for bulk approve / reject actions on academy lists.
 */
const AcademyBulkBar = ({
  selectedCount,
  onClear,
  onBulkApprove,
  onBulkReject,
  onBulkEndorse,
  onBulkFinalApprove,
  showApprove = true,
  showReject = true,
  showEndorse = false,
  showFinalApprove = false,
  approveLabel = 'Approve selected',
  rejectLabel = 'Reject selected'
}) => {
  const [busy, setBusy] = useState(false);

  if (selectedCount === 0) return null;

  const run = async (fn) => {
    if (!fn || busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="alert alert-secondary d-flex flex-wrap align-items-center gap-2 mb-3 py-2">
      <span className="fw-semibold">{selectedCount} selected</span>
      {showApprove && onBulkApprove && (
        <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => run(onBulkApprove)}>
          {approveLabel}
        </button>
      )}
      {showReject && onBulkReject && (
        <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(onBulkReject)}>
          {rejectLabel}
        </button>
      )}
      {showEndorse && onBulkEndorse && (
        <button type="button" className="btn btn-sm btn-info" disabled={busy} onClick={() => run(onBulkEndorse)}>
          Endorse selected
        </button>
      )}
      {showFinalApprove && onBulkFinalApprove && (
        <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => run(onBulkFinalApprove)}>
          Final approve selected
        </button>
      )}
      <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" disabled={busy} onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
};

export default AcademyBulkBar;
