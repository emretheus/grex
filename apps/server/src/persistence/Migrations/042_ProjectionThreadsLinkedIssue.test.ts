import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const projectionThreadsColumnNames = (sql: SqlClient.SqlClient) =>
  sql<{ readonly name: string }>`
    SELECT name FROM pragma_table_info('projection_threads')
  `.pipe(Effect.map((rows) => rows.map((row) => row.name)));

layer("042_ProjectionThreadsLinkedIssue", (it) => {
  it.effect("adds the linked issue snapshot column", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 41 });

      const beforeColumns = yield* projectionThreadsColumnNames(sql);
      assert.notInclude(beforeColumns, "linked_issue_json");

      yield* runMigrations();

      const afterColumns = yield* projectionThreadsColumnNames(sql);
      assert.include(afterColumns, "linked_issue_json");
    }),
  );

  it.effect("is a no-op when the column already exists", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();
      yield* runMigrations();

      const columns = yield* projectionThreadsColumnNames(sql);
      assert.include(columns, "linked_issue_json");
    }),
  );
});
