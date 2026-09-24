const {
  successResponse,
} = require("../../shared/http-response");

const {
  listPublicProducts,
  getPublicProductBySlug,
  listAdministrativeProducts,
  getProductById,
  createProduct,
  updateProduct,
  changeProductStatus,
  changeProductAvailability,
} = require("./product.service");

async function listPublicProductsController(
  request,
  response
) {
  const data = await listPublicProducts(
    request.productListQuery
  );

  return successResponse(
    response,
    200,
    data,
    "Products retrieved successfully"
  );
}

async function getPublicProductController(
  request,
  response
) {
  const product =
    await getPublicProductBySlug(
      request.productSlug
    );

  return successResponse(
    response,
    200,
    { product },
    "Product retrieved successfully"
  );
}

async function listAdministrativeProductsController(
  request,
  response
) {
  const data = await listAdministrativeProducts(
    request.adminProductListQuery
  );

  return successResponse(
    response,
    200,
    data,
    "Administrative products retrieved successfully"
  );
}

async function getAdministrativeProductController(
  request,
  response
) {
  const product = await getProductById(
    request.productId
  );

  return successResponse(
    response,
    200,
    { product },
    "Administrative product retrieved successfully"
  );
}

async function createProductController(
  request,
  response
) {
  const product = await createProduct(
    request.productInput
  );

  return successResponse(
    response,
    201,
    { product },
    "Product created successfully"
  );
}

async function updateProductController(
  request,
  response
) {
  const product = await updateProduct({
    productId: request.productId,
    updates: request.productUpdates,
  });

  return successResponse(
    response,
    200,
    { product },
    "Product updated successfully"
  );
}

async function changeProductStatusController(
  request,
  response
) {
  const product = await changeProductStatus({
    productId: request.productId,
    isActive: request.productStatus.isActive,
  });

  return successResponse(
    response,
    200,
    { product },
    "Product status updated successfully"
  );
}

async function changeProductAvailabilityController(
  request,
  response
) {
  const product = await changeProductAvailability({
    productId: request.productId,
    isAvailable:
      request.productAvailability.isAvailable,
  });

  return successResponse(
    response,
    200,
    { product },
    "Product availability updated successfully"
  );
}

module.exports = {
  listPublicProductsController,
  getPublicProductController,
  listAdministrativeProductsController,
  getAdministrativeProductController,
  createProductController,
  updateProductController,
  changeProductStatusController,
  changeProductAvailabilityController,
};
