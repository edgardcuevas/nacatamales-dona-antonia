const AppError = require("../../errors/app-error");

function validateLoginInput(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new AppError(
      400,
      "INVALID_LOGIN_INPUT",
      "Email and password are required"
    );
  }

  const { email, password } = body;

  if (
    typeof email !== "string" ||
    email.trim() === ""
  ) {
    throw new AppError(
      400,
      "INVALID_EMAIL",
      "A valid email is required"
    );
  }

  if (
    typeof password !== "string" ||
    password.length === 0
  ) {
    throw new AppError(
      400,
      "INVALID_PASSWORD",
      "Password is required"
    );
  }

  return {
    email: email.trim().toLowerCase(),
    password,
  };
}

module.exports = {
  validateLoginInput,
};