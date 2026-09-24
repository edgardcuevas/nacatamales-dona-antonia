const AppError = require("../../errors/app-error");

const categoryRepository = require(
  "./category.repository"
);

function createCategoryNotFoundError() {
  return new AppError(
    404,
    "CATEGORY_NOT_FOUND",
    "The requested category does not exist"
  );
}

function createCategoryNameDuplicateError() {
  return new AppError(
    409,
    "CATEGORY_NAME_ALREADY_EXISTS",
    "A category with this name already exists"
  );
}

function createCategorySlugDuplicateError() {
  return new AppError(
    409,
    "CATEGORY_SLUG_ALREADY_EXISTS",
    "A category with this slug already exists"
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

  if (message.includes("categories_name_unique")) {
    return "name";
  }

  if (message.includes("categories_slug_unique")) {
    return "slug";
  }

  return null;
}

function rethrowCategoryWriteError(error) {
  const duplicateKey = getDuplicateKey(error);

  if (duplicateKey === "name") {
    throw createCategoryNameDuplicateError();
  }

  if (duplicateKey === "slug") {
    throw createCategorySlugDuplicateError();
  }

  throw error;
}

function toPublicCategory(category) {
  const id = Number(category.id);
  const sortOrder = Number(category.sort_order);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0
  ) {
    throw new Error("Invalid public category record");
  }

  return {
    id,
    name: category.name,
    slug: category.slug,
    description: category.description ?? null,
    sortOrder,
  };
}

function toAdminCategory(category) {
  return {
    id: Number(category.id),
    name: category.name,
    slug: category.slug,
    description: category.description ?? null,
    sortOrder: Number(category.sort_order),
    isActive:
      category.is_active === true ||
      category.is_active === 1,
    createdAt: category.created_at ?? null,
    updatedAt: category.updated_at ?? null,
  };
}

async function listPublicCategories() {
  const categories =
    await categoryRepository.listPublicCategories();

  return categories.map(toPublicCategory);
}

async function getPublicCategoryBySlug(slug) {
  const category =
    await categoryRepository.findPublicCategoryBySlug(
      slug
    );

  if (!category) {
    throw createCategoryNotFoundError();
  }

  return toPublicCategory(category);
}

async function listAdministrativeCategories(filters) {
  const { categories, totalItems } =
    await categoryRepository.listCategories(filters);

  return {
    categories: categories.map(toAdminCategory),
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

async function getCategoryById(categoryId) {
  const category =
    await categoryRepository.findCategoryById(
      categoryId
    );

  if (!category) {
    throw createCategoryNotFoundError();
  }

  return toAdminCategory(category);
}

async function createCategory(input) {
  let created;

  try {
    created = await categoryRepository.createCategory(
      input
    );
  } catch (error) {
    rethrowCategoryWriteError(error);
  }

  return getCategoryById(created.id);
}

async function updateCategory({
  categoryId,
  updates,
}) {
  const updated =
    await categoryRepository.updateCategoryById({
      categoryId,
      updates,
    }).catch(rethrowCategoryWriteError);

  if (!updated) {
    const existing =
      await categoryRepository.findCategoryById(
        categoryId
      );

    if (!existing) {
      throw createCategoryNotFoundError();
    }
  }

  return getCategoryById(categoryId);
}

async function changeCategoryStatus({
  categoryId,
  isActive,
}) {
  const category =
    await categoryRepository.findCategoryById(
      categoryId
    );

  if (!category) {
    throw createCategoryNotFoundError();
  }

  const currentIsActive =
    category.is_active === true ||
    category.is_active === 1;

  if (currentIsActive !== isActive) {
    const updated =
      await categoryRepository.updateCategoryStatusById({
        categoryId,
        isActive,
      });

    if (!updated) {
      throw createCategoryNotFoundError();
    }
  }

  return getCategoryById(categoryId);
}

module.exports = {
  listPublicCategories,
  getPublicCategoryBySlug,
  listAdministrativeCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  changeCategoryStatus,
};
