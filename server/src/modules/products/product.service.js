const AppError = require("../../errors/app-error");

const categoryRepository = require(
  "../categories/category.repository"
);
const productRepository = require(
  "./product.repository"
);

function createProductNotFoundError() {
  return new AppError(
    404,
    "PRODUCT_NOT_FOUND",
    "The requested product does not exist"
  );
}

function createCategoryNotFoundError() {
  return new AppError(
    404,
    "CATEGORY_NOT_FOUND",
    "The requested category does not exist"
  );
}

function createCategoryInactiveError() {
  return new AppError(
    409,
    "CATEGORY_INACTIVE",
    "The selected category is inactive"
  );
}

function createProductNameDuplicateError() {
  return new AppError(
    409,
    "PRODUCT_NAME_ALREADY_EXISTS",
    "A product with this name already exists"
  );
}

function createProductSlugDuplicateError() {
  return new AppError(
    409,
    "PRODUCT_SLUG_ALREADY_EXISTS",
    "A product with this slug already exists"
  );
}

function getDuplicateKey(error) {
  if (error?.code !== "ER_DUP_ENTRY") {
    return null;
  }

  const message = [
    error.sqlMessage,
    error.message,
  ]
    .filter(Boolean)
    .join(" ");

  if (message.includes("products_name_unique")) {
    return "name";
  }

  if (message.includes("products_slug_unique")) {
    return "slug";
  }

  return null;
}

function rethrowProductWriteError(error) {
  const duplicateKey = getDuplicateKey(error);

  if (duplicateKey === "name") {
    throw createProductNameDuplicateError();
  }

  if (duplicateKey === "slug") {
    throw createProductSlugDuplicateError();
  }

  throw error;
}

function assertProductId(productId) {
  if (
    !Number.isSafeInteger(productId) ||
    productId < 1
  ) {
    throw createProductNotFoundError();
  }
}

function isActiveRecord(value) {
  return value === true || value === 1;
}

function normalizePrice(price) {
  if (price === null || price === undefined) {
    return null;
  }

  if (typeof price === "number") {
    return price.toFixed(2);
  }

  if (
    typeof price !== "string" ||
    !/^\d+\.\d{2}$/.test(price)
  ) {
    throw new Error("Invalid product price record");
  }

  return price;
}

function getCategoryDto(product) {
  return {
    id: Number(product.category_id),
    name: product.category_name,
    slug: product.category_slug,
  };
}

function toPublicProduct(product) {
  const id = Number(product.id);
  const categoryId = Number(product.category_id);
  const sortOrder = Number(product.sort_order);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(categoryId) ||
    categoryId < 1 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0
  ) {
    throw new Error("Invalid public product record");
  }

  return {
    id,
    name: product.name,
    slug: product.slug,
    description: product.description ?? null,
    price: normalizePrice(product.price),
    isAvailable: isActiveRecord(product.is_available),
    sortOrder,
    category: getCategoryDto(product),
  };
}

function toAdminProduct(product) {
  return {
    id: Number(product.id),
    categoryId: Number(product.category_id),
    name: product.name,
    slug: product.slug,
    description: product.description ?? null,
    price: normalizePrice(product.price),
    isAvailable: isActiveRecord(product.is_available),
    isActive: isActiveRecord(product.is_active),
    sortOrder: Number(product.sort_order),
    category: getCategoryDto(product),
    createdAt: product.created_at ?? null,
    updatedAt: product.updated_at ?? null,
  };
}

async function listPublicProducts(filters) {
  const { products, totalItems } =
    await productRepository.listPublicProducts(
      filters
    );

  return {
    products: products.map(toPublicProduct),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(totalItems / filters.limit),
    },
  };
}

async function getPublicProductBySlug(slug) {
  const product =
    await productRepository.findPublicProductBySlug(
      slug
    );

  if (!product) {
    throw createProductNotFoundError();
  }

  return toPublicProduct(product);
}

async function ensureActiveCategory(categoryId) {
  const category =
    await categoryRepository.findCategoryById(
      categoryId
    );

  if (!category) {
    throw createCategoryNotFoundError();
  }

  if (!isActiveRecord(category.is_active)) {
    throw createCategoryInactiveError();
  }
}

async function listAdministrativeProducts(filters) {
  const { products, totalItems } =
    await productRepository.listProducts(filters);

  return {
    products: products.map(toAdminProduct),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(totalItems / filters.limit),
    },
  };
}

async function getProductById(productId) {
  assertProductId(productId);
  const product =
    await productRepository.findProductById(
      productId
    );

  if (!product) {
    throw createProductNotFoundError();
  }

  return toAdminProduct(product);
}

async function createProduct(input) {
  await ensureActiveCategory(input.categoryId);

  let created;
  try {
    created = await productRepository.createProduct(
      input
    );
  } catch (error) {
    rethrowProductWriteError(error);
  }

  return getProductById(created.id);
}

async function updateProduct({
  productId,
  updates,
}) {
  assertProductId(productId);
  const current =
    await productRepository.findProductById(
      productId
    );

  if (!current) {
    throw createProductNotFoundError();
  }

  if (
    Object.hasOwn(updates, "categoryId")
  ) {
    await ensureActiveCategory(updates.categoryId);
  }

  let updated;
  try {
    updated = await productRepository.updateProductById({
      productId,
      updates,
    });
  } catch (error) {
    rethrowProductWriteError(error);
  }

  if (!updated) {
    throw createProductNotFoundError();
  }

  return getProductById(productId);
}

async function changeProductStatus({
  productId,
  isActive,
}) {
  assertProductId(productId);
  const current =
    await productRepository.findProductById(
      productId
    );

  if (!current) {
    throw createProductNotFoundError();
  }

  if (isActiveRecord(current.is_active) !== isActive) {
    const updated =
      await productRepository.updateProductStatusById({
        productId,
        isActive,
      });

    if (!updated) {
      throw createProductNotFoundError();
    }
  }

  return getProductById(productId);
}

async function changeProductAvailability({
  productId,
  isAvailable,
}) {
  assertProductId(productId);
  const current =
    await productRepository.findProductById(
      productId
    );

  if (!current) {
    throw createProductNotFoundError();
  }

  if (
    isActiveRecord(current.is_available) !==
    isAvailable
  ) {
    const updated =
      await productRepository.updateProductAvailabilityById({
        productId,
        isAvailable,
      });

    if (!updated) {
      throw createProductNotFoundError();
    }
  }

  return getProductById(productId);
}

module.exports = {
  listPublicProducts,
  getPublicProductBySlug,
  listAdministrativeProducts,
  getProductById,
  createProduct,
  updateProduct,
  changeProductStatus,
  changeProductAvailability,
};
