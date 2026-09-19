const {
  errorResponse,
} = require("../shared/http-response");

function notFoundHandler(request, response) {
  return errorResponse(
    response,
    404,
    "ROUTE_NOT_FOUND",
    "The requested route does not exist"
  );
}

module.exports = notFoundHandler;