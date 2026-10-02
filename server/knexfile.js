const env = require("./src/config/env");

// The connection and the migrations table are identical in every
// environment. Only NODE_ENV decides which one is active, so the CLI
// can run "migrate:latest" against a production deployment instead
// of failing with "Required configuration option 'client' is
// missing" for a configuration key that does not exist.
const connection = {
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
};

const migrations = {
  directory: "./database/migrations",
  tableName: "knex_migrations",
  extension: "js",
};

function createEnvironmentConfig() {
  return {
    client: "mysql2",
    connection,
    migrations,
  };
}

module.exports = {
  development: createEnvironmentConfig(),
  production: createEnvironmentConfig(),
};