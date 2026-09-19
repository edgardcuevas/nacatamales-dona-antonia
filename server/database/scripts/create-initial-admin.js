const pool = require("../../src/database/pool");

const {
  USER_ROLES,
} = require("../../src/modules/users/user.constants");

const {
  hashPassword,
} = require("../../src/modules/users/password.service");

const {
  createUser,
} = require("../../src/modules/users/user.service");

async function createInitialAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || email.trim() === "") {
    throw new Error(
      "Environment variable INITIAL_ADMIN_EMAIL is required."
    );
  }

  if (!password || password.length < 12) {
    throw new Error(
      "INITIAL_ADMIN_PASSWORD must contain at least 12 characters."
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await createUser({
    email,
    passwordHash,
    role: USER_ROLES.ADMIN,
  });

  console.log(
    `Initial ADMIN user created successfully with ID ${user.id}.`
  );
}

async function run() {
  try {
    await createInitialAdmin();
  } catch (error) {
    console.error(
      "Unable to create the initial ADMIN user:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void run();