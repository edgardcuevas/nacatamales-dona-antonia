const pool = require("../../src/database/pool");

const userRepository = require(
  "../../src/modules/users/user.repository"
);

const {
  hashPassword,
} = require(
  "../../src/modules/users/password.service"
);

async function resetAdminPassword() {
  const email = process.env.RESET_ADMIN_EMAIL;
  const password = process.env.RESET_ADMIN_PASSWORD;

  if (!email || email.trim() === "") {
    throw new Error(
      "Environment variable RESET_ADMIN_EMAIL is required."
    );
  }

  if (!password || password.length < 12) {
    throw new Error(
      "RESET_ADMIN_PASSWORD must contain at least 12 characters."
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await userRepository.findUserByEmail(
    normalizedEmail
  );

  if (!user || user.role !== "ADMIN") {
    throw new Error(
      "The specified ADMIN user does not exist."
    );
  }

  const passwordHash = await hashPassword(password);

  const passwordWasUpdated =
    await userRepository.updatePasswordHashById(
      user.id,
      passwordHash
    );

  if (!passwordWasUpdated) {
    throw new Error(
      "The ADMIN password could not be updated."
    );
  }

  console.log(
    "ADMIN password updated successfully."
  );
}

async function run() {
  try {
    await resetAdminPassword();
  } catch (error) {
    console.error(
      "Unable to update the ADMIN password:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void run();