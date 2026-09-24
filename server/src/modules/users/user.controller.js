const {
  successResponse,
} = require("../../shared/http-response");

const {
  listAdministrativeUsers,
  getUserById,
  createAdministrativeUser,
  changeUserRole,
  changeUserStatus,
  resetUserPassword,
  revokeUserSessions,
} = require("./user.service");

async function listUsersController(
  request,
  response
) {
  const data =
    await listAdministrativeUsers(
      request.userListQuery
    );

  return successResponse(
    response,
    200,
    data,
    "Administrative users retrieved successfully"
  );
}

async function getUserController(request, response) {
  const user = await getUserById(request.userId);

  return successResponse(
    response,
    200,
    { user },
    "Administrative user retrieved successfully"
  );
}

async function createUserController(
  request,
  response
) {
  const user =
    await createAdministrativeUser(
      request.userInput
    );

  return successResponse(
    response,
    201,
    { user },
    "Administrative user created successfully"
  );
}

async function changeUserRoleController(
  request,
  response
) {
  const user = await changeUserRole({
    userId: request.userId,
    role: request.roleInput.role,
  });

  return successResponse(
    response,
    200,
    { user },
    "User role updated successfully"
  );
}

async function changeUserStatusController(
  request,
  response
) {
  const user = await changeUserStatus({
    userId: request.userId,
    isActive: request.statusInput.isActive,
    actorId: request.currentUser.id,
  });

  return successResponse(
    response,
    200,
    { user },
    "User status updated successfully"
  );
}

async function resetUserPasswordController(
  request,
  response
) {
  await resetUserPassword({
    userId: request.userId,
    password: request.passwordInput.password,
  });

  return successResponse(
    response,
    200,
    null,
    "User password reset successfully"
  );
}

async function revokeUserSessionsController(
  request,
  response
) {
  await revokeUserSessions(request.userId);

  return successResponse(
    response,
    200,
    null,
    "User sessions revoked successfully"
  );
}

module.exports = {
  listUsersController,
  getUserController,
  createUserController,
  changeUserRoleController,
  changeUserStatusController,
  resetUserPasswordController,
  revokeUserSessionsController,
};
