// Domain logic for the local DELETED transition. It never contacts
// YouTube and never deletes a row: it only flips the local state of a
// record whose remote resource is already gone. This module is free of
// any CLI dependency so it can be exercised with doubles.

const {
  REMOTE_DELETION_OUTCOMES,
  REMOTE_DELETION_REJECTIONS,
} = require("./video.remote-deletion.constants");
const {
  VIDEO_PROVIDERS,
  VIDEO_UPLOAD_STATUSES,
} = require("./video.constants");

const remoteDeletionRepository =
  require("./video.remote-deletion.repository");

// A rejection aborts the whole run. Nothing is written when one is
// raised, so a mistyped id can never leave the table half updated.
class RemoteDeletionRejectionError extends Error {
  constructor(rejections, kind) {
    super(
      "Remote deletion preconditions were not met"
    );
    this.name =
      "RemoteDeletionRejectionError";
    this.rejections = rejections;
    this.kind = kind;
  }
}

function createSchemaRejectionError(
  rejections
) {
  return new RemoteDeletionRejectionError(
    rejections,
    "SCHEMA"
  );
}

function createRecordRejectionError(
  rejections
) {
  return new RemoteDeletionRejectionError(
    rejections,
    "RECORD"
  );
}

function isActiveRecord(value) {
  return value === true || value === 1;
}

// Classification per record. The order matters: identity is checked
// before the state, so a record that is not a YouTube video is never
// silently treated as one.
function classifyVideo(video) {
  if (!video) {
    return {
      rejection:
        REMOTE_DELETION_REJECTIONS.RECORD_NOT_FOUND,
    };
  }

  if (
    !VIDEO_PROVIDERS.includes(video.provider)
  ) {
    return {
      rejection:
        REMOTE_DELETION_REJECTIONS
          .PROVIDER_NOT_YOUTUBE,
    };
  }

  if (
    typeof video.external_id !== "string" ||
    video.external_id.trim() === ""
  ) {
    return {
      rejection:
        REMOTE_DELETION_REJECTIONS
          .EXTERNAL_ID_MISSING,
    };
  }

  if (
    !VIDEO_UPLOAD_STATUSES.includes(
      video.upload_status
    )
  ) {
    return {
      rejection:
        REMOTE_DELETION_REJECTIONS
          .UNKNOWN_UPLOAD_STATUS,
    };
  }

  if (video.upload_status === "DELETED") {
    // Policy: a DELETED row without a timestamp is an inconsistent
    // state. The tool refuses it instead of inventing a deletion date,
    // because a fabricated remote_deleted_at would be
    // indistinguishable from a real one.
    if (
      video.remote_deleted_at === null ||
      video.remote_deleted_at === undefined
    ) {
      return {
        rejection:
          REMOTE_DELETION_REJECTIONS
            .DELETED_WITHOUT_TIMESTAMP,
      };
    }

    // Policy: the original deletion date is never overwritten. The
    // only repair allowed is deactivating a row that is somehow still
    // active.
    return {
      outcome:
        REMOTE_DELETION_OUTCOMES.ALREADY_DELETED,
      needsDeactivation:
        isActiveRecord(video.is_active),
    };
  }

  return {
    outcome: REMOTE_DELETION_OUTCOMES.ELIGIBLE,
    needsDeactivation: false,
  };
}

function assertSchemaSupport(schema) {
  const rejections = [];

  if (!schema.hasRemoteDeletedAt) {
    rejections.push({
      videoId: null,
      code: REMOTE_DELETION_REJECTIONS
        .SCHEMA_MISSING_REMOTE_DELETED_AT,
    });
  }

  if (!schema.enumAdmitsDeleted) {
    rejections.push({
      videoId: null,
      code: REMOTE_DELETION_REJECTIONS
        .SCHEMA_MISSING_DELETED_STATUS,
    });
  }

  if (rejections.length > 0) {
    throw createSchemaRejectionError(rejections);
  }
}

function buildPlan({
  videoIds,
  rows,
}) {
  const foundById = new Map(
    rows.map((row) => [Number(row.id), row])
  );

  const entries = [];
  const rejections = [];
  const eligible = [];
  const alreadyDeleted = [];

  for (const videoId of videoIds) {
    const video = foundById.get(videoId) ?? null;
    const verdict = classifyVideo(video);

    if (verdict.rejection) {
      rejections.push({
        videoId,
        code: verdict.rejection,
      });
      continue;
    }

    const entry = {
      videoId,
      outcome: verdict.outcome,
      needsDeactivation: verdict.needsDeactivation,
    };
    entries.push(entry);

    if (
      verdict.outcome ===
      REMOTE_DELETION_OUTCOMES.ELIGIBLE
    ) {
      eligible.push(entry);
    } else {
      alreadyDeleted.push(entry);
    }
  }

  return {
    entries,
    rejections,
    eligible,
    alreadyDeleted,
  };
}

async function readPlan({
  videoIds,
  executor,
}) {
  const schema =
    await remoteDeletionRepository
      .getSchemaSupport({ executor });

  assertSchemaSupport(schema);

  const rows =
    await remoteDeletionRepository
      .findVideosByIds({
        videoIds,
        executor,
      });

  return {
    schema,
    ...buildPlan({ videoIds, rows }),
  };
}

// Read-only. Executes no UPDATE and opens no transaction, so it is
// safe to run as often as needed.
async function planRemoteDeletions({
  videoIds,
  pool,
}) {
  return readPlan({ videoIds, executor: pool });
}

function summarize({
  videoIds,
  plan,
  mode,
  modifiedIds,
  transaction,
  deletedAt,
}) {
  return {
    mode,
    requestedCount: videoIds.length,
    requestedIds: [...videoIds],
    eligibleCount: plan.eligible.length,
    alreadyDeletedCount: plan.alreadyDeleted.length,
    modifiedCount: modifiedIds.length,
    modifiedIds: [...modifiedIds],
    rejections: plan.rejections,
    // One logical timestamp is computed per run and reused for every
    // row, so a batch is internally consistent. It is only exposed in
    // apply mode, and never in dry-run.
    deletedAt: deletedAt ?? null,
    transaction,
  };
}

// Writes inside a single transaction. A failure anywhere rolls the
// whole batch back, so there is never a partial marking.
async function applyRemoteDeletions({
  videoIds,
  pool,
  now = () => new Date(),
}) {
  const connection = await pool.getConnection();
  const deletedAt = now();
  const modifiedIds = [];
  let committed = false;

  try {
    await connection.beginTransaction();

    const plan = await readPlan({
      videoIds,
      executor: connection,
    });

    if (plan.rejections.length > 0) {
      throw createRecordRejectionError(
        plan.rejections
      );
    }

    for (const entry of plan.eligible) {
      const updated =
        await remoteDeletionRepository
          .markRemoteDeleted({
            videoId: entry.videoId,
            remoteDeletedAt: deletedAt,
            executor: connection,
          });

      if (!updated) {
        throw new Error(
          "Remote deletion update matched no row"
        );
      }

      modifiedIds.push(entry.videoId);
    }

    for (const entry of plan.alreadyDeleted) {
      if (!entry.needsDeactivation) {
        continue;
      }

      const updated =
        await remoteDeletionRepository
          .deactivateRemoteDeletedVideo({
            videoId: entry.videoId,
            executor: connection,
          });

      if (!updated) {
        throw new Error(
          "Remote deletion repair matched no row"
        );
      }

      modifiedIds.push(entry.videoId);
    }

    await connection.commit();
    committed = true;

    return summarize({
      videoIds,
      plan,
      mode: "apply",
      modifiedIds,
      transaction: "committed",
      deletedAt,
    });
  } catch (error) {
    if (!committed) {
      try {
        await connection.rollback();
      } catch {
        // The rollback failure must not mask the original cause.
      }
    }

    error.transaction = committed
      ? "committed"
      : "rolled_back";

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  RemoteDeletionRejectionError,
  classifyVideo,
  planRemoteDeletions,
  applyRemoteDeletions,
  summarize,
};