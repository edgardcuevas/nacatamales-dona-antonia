const env = require("./src/config/env");

module.exports = {
  development: {
    client: "mysql2",

    connection: {
      host: env.database.host,
      port: env.database.port,
      database: env.database.name,
      user: env.database.user,
      password: env.database.password,
    },

    migrations: {
      directory: "./database/migrations",
      tableName: "knex_migrations",
      extension: "js",
    },
  },
};