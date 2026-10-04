// Constants for the maintenance tool that marks local videos as
// DELETED when their remote YouTube resource is gone. The tool is a
// local transition only: it never contacts the provider and never
// removes a row.

const REMOTE_DELETION_ENVIRONMENTS = Object.freeze([
  "development",
  "test",
]);

// production is refused on purpose. Reaching real production data
// needs a separate, explicitly authorized mechanism that does not
// exist yet.
const REMOTE_DELETION_REFUSED_ENVIRONMENTS = Object.freeze([
  "production",
]);

const REMOTE_DELETION_REJECTIONS = Object.freeze({
  RECORD_NOT_FOUND: "RECORD_NOT_FOUND",
  PROVIDER_NOT_YOUTUBE: "PROVIDER_NOT_YOUTUBE",
  EXTERNAL_ID_MISSING: "EXTERNAL_ID_MISSING",
  UNKNOWN_UPLOAD_STATUS: "UNKNOWN_UPLOAD_STATUS",
  DELETED_WITHOUT_TIMESTAMP: "DELETED_WITHOUT_TIMESTAMP",
  SCHEMA_MISSING_REMOTE_DELETED_AT:
    "SCHEMA_MISSING_REMOTE_DELETED_AT",
  SCHEMA_MISSING_DELETED_STATUS:
    "SCHEMA_MISSING_DELETED_STATUS",
});

const REMOTE_DELETION_OUTCOMES = Object.freeze({
  ELIGIBLE: "ELIGIBLE",
  ALREADY_DELETED: "ALREADY_DELETED",
});

// A single maintenance run is expected to touch a handful of rows.
// The cap keeps a mistyped list from rewriting the whole table.
const MAX_REMOTE_DELETION_IDS = 20;

// The schema support probe only looks at these two columns: without
// remote_deleted_at and without DELETED in the upload_status enum the
// transition cannot be expressed at all.
const REMOTE_DELETION_SCHEMA_COLUMNS = Object.freeze([
  "upload_status",
  "remote_deleted_at",
]);

const REMOTE_DELETION_CONFIRMATION_PHRASE =
  "MARK_REMOTE_DELETED";

const REMOTE_DELETION_OPERATION = "MARK_VIDEOS_REMOTE_DELETED";

// No persistent audit table exists in this project yet, so the tool
// emits a structured, sanitized record on stdout instead.
const REMOTE_DELETION_ACTOR = "SYSTEM";

const EXIT_CODES = Object.freeze({
  OK: 0,
  INVALID_INPUT: 1,
  UNSAFE_CONFIGURATION: 2,
  RECORDS_NOT_ELIGIBLE: 3,
  TRANSACTION_FAILURE: 4,
});

const EXIT_CODE_DESCRIPTIONS = Object.freeze({
  0: "dry-run completed or changes were committed",
  1: "invalid argument or validation failure",
  2: "unsafe configuration, nothing was written",
  3: "records not found or not eligible, nothing was written",
  4: "transactional failure, everything was rolled back",
});

module.exports = {
  REMOTE_DELETION_ENVIRONMENTS,
  REMOTE_DELETION_REFUSED_ENVIRONMENTS,
  REMOTE_DELETION_REJECTIONS,
  REMOTE_DELETION_OUTCOMES,
  MAX_REMOTE_DELETION_IDS,
  REMOTE_DELETION_SCHEMA_COLUMNS,
  REMOTE_DELETION_CONFIRMATION_PHRASE,
  REMOTE_DELETION_OPERATION,
  REMOTE_DELETION_ACTOR,
  EXIT_CODES,
  EXIT_CODE_DESCRIPTIONS,
};