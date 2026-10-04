const test = require("node:test");
const assert = require("node:assert/strict");

const migration = require(
  "../../database/migrations/20261003120000_add_video_remote_deleted_status"
);

function createKnexRecorder() {
  const recorded = {
    updates: [],
    tableChanges: [],
  };

  function knex(tableName) {
    return {
      where(criteria) {
        return {
          update(values) {
            recorded.updates.push({
              tableName,
              criteria,
              values,
            });
            return Promise.resolve(0);
          },
        };
      },
    };
  }

  knex.schema = {
    alterTable(tableName, callback) {
      const columns = [];
      const createBuilder = (operation) => {
        columns.push(operation);
        return {
          notNullable() {
            operation.notNullable = true;
            return this;
          },
          nullable() {
            operation.nullable = true;
            return this;
          },
          defaultTo(value) {
            operation.defaultValue = value;
            return this;
          },
          alter() {
            operation.alter = true;
            return this;
          },
        };
      };

      callback({
        enum(name, values) {
          return createBuilder({
            type: "enum",
            name,
            values,
          });
        },
        dateTime(name) {
          return createBuilder({
            type: "dateTime",
            name,
          });
        },
        dropColumn(name) {
          columns.push({
            type: "dropColumn",
            name,
          });
        },
      });

      recorded.tableChanges.push({
        tableName,
        columns,
      });
      return Promise.resolve();
    },
  };

  return { knex, recorded };
}

test("migration up adds DELETED and nullable remote_deleted_at without changing rows", async () => {
  const { knex, recorded } = createKnexRecorder();

  await migration.up(knex);

  assert.deepEqual(recorded.updates, []);
  assert.equal(recorded.tableChanges.length, 1);
  assert.equal(recorded.tableChanges[0].tableName, "videos");
  assert.deepEqual(recorded.tableChanges[0].columns, [
    {
      type: "enum",
      name: "upload_status",
      values: [
        "PENDING",
        "UPLOADING",
        "PROCESSING",
        "READY",
        "FAILED",
        "DELETED",
      ],
      notNullable: true,
      defaultValue: "READY",
      alter: true,
    },
    {
      type: "dateTime",
      name: "remote_deleted_at",
      nullable: true,
    },
  ]);
});

test("migration down maps DELETED to FAILED before restoring the prior enum and dropping the timestamp", async () => {
  const { knex, recorded } = createKnexRecorder();

  await migration.down(knex);

  assert.deepEqual(recorded.updates, [
    {
      tableName: "videos",
      criteria: { upload_status: "DELETED" },
      values: { upload_status: "FAILED" },
    },
  ]);
  assert.deepEqual(recorded.tableChanges[0].columns, [
    {
      type: "enum",
      name: "upload_status",
      values: [
        "PENDING",
        "UPLOADING",
        "PROCESSING",
        "READY",
        "FAILED",
      ],
      notNullable: true,
      defaultValue: "READY",
      alter: true,
    },
    {
      type: "dropColumn",
      name: "remote_deleted_at",
    },
  ]);
});