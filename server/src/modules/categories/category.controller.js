const {
  successResponse,
} = require("../../shared/http-response");

const {
  listPublicCategories,
  getPublicCategoryBySlug,
  listAdministrativeCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  changeCategoryStatus,
} = require("./category.service");

async function listPublicCategoriesController(
  request,
  response
) {
  const categories =
    await listPublicCategories();

  return successResponse(
    response,
    200,
    { categories },
    "Categories retrieved successfully"
  );
}

async function getPublicCategoryController(
  request,
  response
) {
  const category =
    await getPublicCategoryBySlug(
      request.categorySlug
    );

  return successResponse(
    response,
    200,
    { category },
    "Category retrieved successfully"
  );
}

async function listAdministrativeCategoriesController(
  request,
  response
) {
  const data =
    await listAdministrativeCategories(
      request.categoryListQuery
    );

  return successResponse(
    response,
    200,
    data,
    "Administrative categories retrieved successfully"
  );
}

async function getAdministrativeCategoryController(
  request,
  response
) {
  const category = await getCategoryById(
    request.categoryId
  );

  return successResponse(
    response,
    200,
    { category },
    "Administrative category retrieved successfully"
  );
}

async function createCategoryController(
  request,
  response
) {
  const category = await createCategory(
    request.categoryInput
  );

  return successResponse(
    response,
    201,
    { category },
    "Category created successfully"
  );
}

async function updateCategoryController(
  request,
  response
) {
  const category = await updateCategory({
    categoryId: request.categoryId,
    updates: request.categoryUpdates,
  });

  return successResponse(
    response,
    200,
    { category },
    "Category updated successfully"
  );
}

async function changeCategoryStatusController(
  request,
  response
) {
  const category = await changeCategoryStatus({
    categoryId: request.categoryId,
    isActive: request.categoryStatus.isActive,
  });

  return successResponse(
    response,
    200,
    { category },
    "Category status updated successfully"
  );
}

module.exports = {
  listPublicCategoriesController,
  getPublicCategoryController,
  listAdministrativeCategoriesController,
  getAdministrativeCategoryController,
  createCategoryController,
  updateCategoryController,
  changeCategoryStatusController,
};
