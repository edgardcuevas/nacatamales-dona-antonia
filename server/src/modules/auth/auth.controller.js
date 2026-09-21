const {
  successResponse,
} = require("../../shared/http-response");

const {
  validateLoginInput,
} = require("./auth.validator");

const {
  login,
} = require("./auth.service");

async function loginController(request, response) {
  const credentials = validateLoginInput(request.body);

  const result = await login(credentials);

  return successResponse(
    response,
    200,
    result,
    "Login successful"
  );
}

module.exports = {
  loginController,
};