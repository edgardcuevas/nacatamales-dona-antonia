function successResponse(response, statusCode, data = null, message = null) {
  return response.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function errorResponse(response, statusCode, code, message) {
  return response.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

module.exports = {
  successResponse,
  errorResponse,
};