import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Backfill migration: normalize linked-issue storage from a single object to an
 * array everywhere it was persisted.
 *
 * 1. projection_threads.linked_issue_json — wraps a legacy single-object value
 *    into a one-element array so the column consistently holds JSON arrays.
 *
 * 2. orchestration_events — rewrites thread.created / thread.meta-updated
 *    payloads that carry the old "linkedIssue" key (single object or null) to
 *    use "linkedIssues" (array), so the contract decoder never meets the legacy
 *    key at runtime.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // ── 1. Backfill projection_threads ───────────────────────────────────
  const threadRows = yield* sql<{ thread_id: string; linked_issue_json: string | null }>`
    SELECT thread_id, linked_issue_json
    FROM projection_threads
    WHERE linked_issue_json IS NOT NULL
  `;

  for (const row of threadRows) {
    if (row.linked_issue_json == null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.linked_issue_json);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) {
      const normalized = JSON.stringify([parsed]);
      yield* sql`
        UPDATE projection_threads
        SET linked_issue_json = ${normalized}
        WHERE thread_id = ${row.thread_id}
      `;
    }
  }

  // ── 2. Backfill orchestration_events ─────────────────────────────────
  const eventRows = yield* sql<{ sequence: number; payload_json: string }>`
    SELECT sequence, payload_json
    FROM orchestration_events
    WHERE type IN ('thread.created', 'thread.meta-updated')
      AND payload_json LIKE '%"linkedIssue"%'
  `;

  for (const row of eventRows) {
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(row.payload_json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      payload = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(payload, "linkedIssue")) continue;

    const legacyValue = payload["linkedIssue"];
    const linkedIssues = legacyValue != null ? [legacyValue] : [];
    const { linkedIssue: _drop, ...rest } = payload;
    const updated = JSON.stringify({ ...rest, linkedIssues });

    yield* sql`
      UPDATE orchestration_events
      SET payload_json = ${updated}
      WHERE sequence = ${row.sequence}
    `;
  }
});
