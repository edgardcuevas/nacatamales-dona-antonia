const AppError = require("../../errors/app-error");

const mediaRepository = require(
  "../media/media.repository"
);
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

function createMediaNotFoundError() {
  return new AppError(
    404,
    "MEDIA_NOT_FOUND",
    "The requested media does not exist"
  );
}

function createMediaInactiveError() {
  return new AppError(
    409,
    "MEDIA_INACTIVE",
    "The selected media is inactive"
  );
}

function createInvalidMediaResourceTypeError() {
  return new AppError(
    400,
    "INVALID_MEDIA_RESOURCE_TYPE",
    "The selected media must be an image"
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

function isActiveRecord(value) {
  return value === true || value === 1;
}

function toOptionalDimension(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const dimension = Number(value);
  if (
    !Number.isSafeInteger(dimension) ||
    dimension < 0
  ) {
    throw new Error("Invalid media dimension record");
  }

  return dimension;
}

function toImage(category) {
  if (
    category.image_id === null ||
    category.image_id === undefined
  ) {
    return null;
  }

  const id = Number(category.image_id);
  if (
    !Number.isSafeInteger(id) ||
    id < 1
  ) {
    throw new Error("Invalid category image record");
  }

  return {
    id,
    url: category.image_url,
    altText: category.image_alt_text ?? null,
    width: toOptionalDimension(category.image_width),
    height: toOptionalDimension(category.image_height),
  };
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
    image: toImage(category),
  };
}

function toAdminCategory(category) {
  const id = Number(category.id);
  const sortOrder = Number(category.sort_order);
  const imageMediaId =
    category.image_media_id === null ||
    category.image_media_id === undefined
      ? null
      : Number(category.image_media_id);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0 ||
    (imageMediaId !== null &&
      (!Number.isSafeInteger(imageMediaId) ||
        imageMediaId < 1))
  ) {
    throw new Error("Invalid administrative category record");
  }

  return {
    id,
    name: category.name,
    slug: category.slug,
    description: category.description ?? null,
    sortOrder,
    imageMediaId,
    image: toImage(category),
    isActive: isActiveRecord(category.is_active),
    createdAt: category.created_at ?? null,
    updatedAt: category.updated_at ?? null,
  };
}

async function validateImageReference(imageMediaId) {
  if (
    imageMediaId === null ||
    imageMediaId === undefined
  ) {
    return;
  }

  const media =
    await mediaRepository.findMediaById(imageMediaId);

  if (!media) {
    throw createMediaNotFoundError();
  }

  if (!isActiveRecord(media.is_active)) {
    throw createMediaInactiveError();
  }

  if (media.resource_type !== "IMAGE") {
    throw createInvalidMediaResourceTypeError();
  }
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
  await validateImageReference(input.imageMediaId);

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
  if (Object.hasOwn(updates, "imageMediaId")) {
    await validateImageReference(updates.imageMediaId);
  }

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
    isActiveRecord(category.is_active);

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
