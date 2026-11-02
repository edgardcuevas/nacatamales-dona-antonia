const { isDeepStrictEqual } = require("node:util");
const AppError = require("../../errors/app-error");

const productService = require(
  "../products/product.service"
);
const announcementService = require(
  "../announcements/announcement.service"
);
const videoService = require(
  "../videos/video.service"
);
const categoryService = require(
  "../categories/category.service"
);
const notificationService = require(
  "../notification/notification.service"
);
const photosService = require(
  "../photos/photos.service"
);
const mediaService = require(
  "../media/media.service"
);
const mediaRepository = require(
  "../media/media.repository"
);
const settingsService = require(
  "../settings/settings.service"
);
const userService = require("../users/user.service");
const {
  USER_ROLE_VALUES,
} = require("../users/user.constants");
const {
  parseUpdateSettingsBody,
} = require("../settings/settings.validator");
const youtubeService = require(
  "../youtube/youtube.service"
);
const {
  MAX_NAME_LENGTH: MAX_CATEGORY_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH:
    MAX_CATEGORY_DESCRIPTION_LENGTH,
  MAX_SORT_ORDER: MAX_CATEGORY_SORT_ORDER,
} = require("../categories/category.constants");
const {
  ANNOUNCEMENT_TYPES,
  MAX_TITLE_LENGTH: MAX_ANNOUNCEMENT_TITLE_LENGTH,
  MAX_CONTENT_LENGTH: MAX_ANNOUNCEMENT_CONTENT_LENGTH,
  MAX_SORT_ORDER: MAX_ANNOUNCEMENT_SORT_ORDER,
} = require("../announcements/announcement.constants");
const {
  MAX_CAPTION_LENGTH: MAX_PHOTO_CAPTION_LENGTH,
  MAX_SORT_ORDER: MAX_PHOTO_SORT_ORDER,
} = require("../photos/photos.constants");
const {
  ISO_DATE_PATTERN,
} = require("../announcements/announcement.validator");
const {
  MAX_TITLE_LENGTH: MAX_VIDEO_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH: MAX_VIDEO_DESCRIPTION_LENGTH,
} = require("../videos/video.constants");
const {
  MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS,
} = require("./assistant.constants");

function isPlainObject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function toIsoString(value) {
  const date =
    value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid assistant action update timestamp");
  }

  return date.toISOString();
}

function validateProductAvailabilityArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.productId) ||
    value.productId < 1 ||
    typeof value.isAvailable !== "boolean"
  ) {
    return null;
  }

  return {
    productId: value.productId,
    isAvailable: value.isAvailable,
  };
}

const setProductAvailability = {
  name: "set_product_availability",
  mode: "write",
  targetType: "product",
  description:
    "Prepara el cambio de disponibilidad de un producto para que el usuario lo confirme.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "integer" },
      isAvailable: { type: "boolean" },
    },
    required: ["productId", "isAvailable"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateProductAvailabilityArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.productId,
  getTargetById: (productId) =>
    productService.getProductById(productId),
  getTargetLabel: (product) => product.name,
  getSnapshot: (product) => ({
    isAvailable: product.isAvailable,
    updatedAt: toIsoString(product.updatedAt),
  }),
  createSummary: ({ target, arguments: argumentsValue }) =>
    `Marcar «${target.name}» como ${
      argumentsValue.isAvailable
        ? "disponible"
        : "no disponible"
    }`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "isAvailable",
      from: target.isAvailable,
      to: argumentsValue.isAvailable,
    },
  ],
  getWarnings: ({ target, arguments: argumentsValue }) =>
    target.isAvailable === argumentsValue.isAvailable
      ? ["El producto ya está en ese estado."]
      : [],
  execute: ({ targetId, arguments: argumentsValue }) =>
    productService.changeProductAvailability({
      productId: targetId,
      isAvailable: argumentsValue.isAvailable,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.name,
    },
    isAvailable: domainResult.isAvailable,
  }),
  toAssistantMessage: ({ result }) =>
    `El producto «${result.target.label}» ahora está ${
      result.isAvailable ? "disponible" : "no disponible"
    }.`,
};

function validateAnnouncementStatusArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.announcementId) ||
    value.announcementId < 1 ||
    typeof value.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    announcementId: value.announcementId,
    isActive: value.isActive,
  };
}

const setAnnouncementActive = {
  name: "set_announcement_active",
  mode: "write",
  targetType: "announcement",
  description:
    "Prepara la publicación u ocultación de un aviso para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      announcementId: { type: "integer" },
      isActive: { type: "boolean" },
    },
    required: ["announcementId", "isActive"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateAnnouncementStatusArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.announcementId,
  getTargetById: (announcementId) =>
    announcementService.getAnnouncementById(announcementId),
  getTargetLabel: (announcement) => announcement.title,
  getSnapshot: (announcement) => ({
    isActive: announcement.isActive,
    updatedAt: toIsoString(announcement.updatedAt),
  }),
  createSummary: ({ target, arguments: argumentsValue }) =>
    `${argumentsValue.isActive ? "Publicar" : "Ocultar"} el aviso «${target.title}»`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "isActive",
      from: target.isActive,
      to: argumentsValue.isActive,
    },
  ],
  getWarnings: ({ target, arguments: argumentsValue }) => {
    if (target.isActive === argumentsValue.isActive) {
      return ["El aviso ya está en ese estado."];
    }

    return argumentsValue.isActive
      ? [
          "Si las notificaciones push están configuradas, publicar el aviso puede enviar una notificación a los suscriptores.",
        ]
      : [];
  },
  execute: ({ targetId, arguments: argumentsValue }) =>
    announcementService.changeAnnouncementStatus({
      announcementId: targetId,
      isActive: argumentsValue.isActive,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.title,
    },
    isActive: domainResult.isActive,
  }),
  toAssistantMessage: ({ result }) =>
    `El aviso «${result.target.label}» ahora está ${
      result.isActive ? "publicado" : "oculto"
    }.`,
};

function getVideoProposalRejectionMessage({
  target,
  arguments: argumentsValue,
}) {
  if (
    !argumentsValue.isActive ||
    target.uploadStatus === "READY"
  ) {
    return null;
  }

  if (target.uploadStatus === "DELETED") {
    return "Este video fue eliminado de YouTube y no se puede publicar. Sí podés ocultarlo.";
  }

  return "Solo se pueden publicar videos cuando la carga está lista. Sí podés ocultarlo mientras tanto.";
}

const setVideoActive = {
  name: "set_video_active",
  mode: "write",
  targetType: "video",
  description:
    "Prepara la publicación u ocultación de un video para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      videoId: { type: "integer" },
      isActive: { type: "boolean" },
    },
    required: ["videoId", "isActive"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: (value) => {
    if (
      !isPlainObject(value) ||
      Object.keys(value).length !== 2 ||
      !Number.isSafeInteger(value.videoId) ||
      value.videoId < 1 ||
      typeof value.isActive !== "boolean"
    ) {
      return null;
    }

    return {
      videoId: value.videoId,
      isActive: value.isActive,
    };
  },
  getTargetId: (argumentsValue) =>
    argumentsValue.videoId,
  getTargetById: (videoId) =>
    videoService.getVideoById(videoId),
  getTargetLabel: (video) => video.title,
  getSnapshot: (video) => ({
    isActive: video.isActive,
    uploadStatus: video.uploadStatus,
    updatedAt: toIsoString(video.updatedAt),
  }),
  createSummary: ({ target, arguments: argumentsValue }) =>
    `${argumentsValue.isActive ? "Publicar" : "Ocultar"} el video «${target.title}»`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "isActive",
      from: target.isActive,
      to: argumentsValue.isActive,
    },
  ],
  getWarnings: () => [],
  getProposalRejectionMessage:
    getVideoProposalRejectionMessage,
  execute: ({ targetId, arguments: argumentsValue }) =>
    videoService.changeVideoStatus({
      videoId: targetId,
      isActive: argumentsValue.isActive,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.title,
    },
    isActive: domainResult.isActive,
  }),
  toAssistantMessage: ({ result }) =>
    `El video «${result.target.label}» ahora está ${
      result.isActive ? "publicado" : "oculto"
    }.`,
};

function validateUpdateVideoArguments(value) {
  if (
    !isPlainObject(value) ||
    !Number.isSafeInteger(value.videoId) ||
    value.videoId < 1
  ) {
    return null;
  }

  const result = { videoId: value.videoId };
  let hasUpdate = false;

  if (Object.hasOwn(value, "title")) {
    if (
      typeof value.title !== "string" ||
      value.title.trim() === "" ||
      value.title.trim().length > MAX_VIDEO_TITLE_LENGTH
    ) {
      return null;
    }

    result.title = value.title.trim();
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "description")) {
    if (
      value.description !== null &&
      (typeof value.description !== "string" ||
        value.description.length > MAX_VIDEO_DESCRIPTION_LENGTH)
    ) {
      return null;
    }

    result.description = value.description;
    hasUpdate = true;
  }

  return hasUpdate ? result : null;
}

function getVideoUpdateRejectionMessage({ target }) {
  if (target.uploadStatus === "DELETED") {
    return "Este video fue removido de YouTube y no se puede editar. Solo se puede ocultar.";
  }

  return null;
}

const updateVideo = {
  name: "update_video",
  mode: "write",
  targetType: "video",
  description:
    "Prepara la edición del título y la descripción de un video para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      videoId: { type: "integer" },
      title: { type: "string" },
      description: { type: "string" },
    },
    required: ["videoId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateUpdateVideoArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.videoId,
  getTargetById: (videoId) =>
    videoService.getVideoById(videoId),
  getTargetLabel: (video) => video.title,
  getSnapshot: (video) => ({
    title: video.title,
    description: video.description,
    updatedAt: toIsoString(video.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Actualizar el video «${target.title}»`,
  getChanges: ({ target, arguments: argumentsValue }) => {
    const changes = [];

    if (Object.hasOwn(argumentsValue, "title")) {
      changes.push({
        field: "title",
        from: target.title,
        to: argumentsValue.title,
      });
    }

    if (Object.hasOwn(argumentsValue, "description")) {
      changes.push({
        field: "description",
        from: target.description,
        to: argumentsValue.description,
      });
    }

    return changes;
  },
  getWarnings: ({ target, arguments: argumentsValue }) => {
    if (
      !Object.hasOwn(argumentsValue, "title") &&
      !Object.hasOwn(argumentsValue, "description")
    ) {
      return ["No hay cambios para guardar en este video."];
    }

    if (target.uploadStatus === "DELETED") {
      return ["Este video se eliminó de YouTube y ya no se puede editar."];
    }

    return [];
  },
  getProposalRejectionMessage:
    getVideoUpdateRejectionMessage,
  execute: ({ targetId, arguments: argumentsValue }) =>
    videoService.updateVideo({
      videoId: targetId,
      updates: {
        ...(Object.hasOwn(argumentsValue, "title")
          ? { title: argumentsValue.title }
          : {}),
        ...(Object.hasOwn(argumentsValue, "description")
          ? { description: argumentsValue.description }
          : {}),
      },
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.title,
    },
    updated: true,
  }),
  toAssistantMessage: ({ result }) =>
    `El video «${result.target.label}» se actualizó.`,
};

function validateRestoreVideoThumbnailArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.videoId) ||
    value.videoId < 1
  ) {
    return null;
  }

  return { videoId: value.videoId };
}

function getVideoThumbnailRestoreRejectionMessage({
  target,
}) {
  if (target.uploadStatus === "DELETED") {
    return "Este video fue removido de YouTube y no se puede restaurar su miniatura.";
  }

  if (target.provider !== "YOUTUBE") {
    return "Solo se puede restaurar la miniatura de videos de YouTube.";
  }

  return null;
}

const restoreVideoThumbnail = {
  name: "restore_video_thumbnail",
  mode: "write",
  targetType: "video",
  description:
    "Prepara la restauración de la miniatura original de YouTube para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      videoId: { type: "integer" },
    },
    required: ["videoId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateRestoreVideoThumbnailArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.videoId,
  getTargetById: (videoId) =>
    videoService.getVideoById(videoId),
  getTargetLabel: (video) => video.title,
  getSnapshot: (video) => ({
    thumbnailSource: video.thumbnailSource,
    thumbnailUrl: video.thumbnailUrl,
    updatedAt: toIsoString(video.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Restaurar la miniatura de YouTube del video «${target.title}»`,
  getChanges: ({ target }) => [
    {
      field: "thumbnailSource",
      from: target.thumbnailSource,
      to: "YOUTUBE_DEFAULT",
    },
  ],
  getWarnings: ({ target }) =>
    target.thumbnailSource === "YOUTUBE_DEFAULT"
      ? ["La miniatura de YouTube ya está activa para este video."]
      : ["Se volverá a usar la miniatura original de YouTube y dejará de usarse la elegida manualmente."],
  getProposalRejectionMessage:
    getVideoThumbnailRestoreRejectionMessage,
  execute: ({ targetId }) =>
    youtubeService.revertVideoThumbnail(targetId),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.video.id,
      label: domainResult.video.title,
    },
    thumbnailSource: domainResult.video.thumbnailSource,
    thumbnailUrl: domainResult.thumbnailUrl,
  }),
  toAssistantMessage: ({ result }) =>
    `La miniatura de YouTube del video «${result.target.label}» se restauró.`,
};

function validateCategoryStatusArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.categoryId) ||
    value.categoryId < 1 ||
    typeof value.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    categoryId: value.categoryId,
    isActive: value.isActive,
  };
}

const setCategoryActive = {
  name: "set_category_active",
  mode: "write",
  targetType: "category",
  description:
    "Prepara la activación u ocultación de una categoría para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      categoryId: { type: "integer" },
      isActive: { type: "boolean" },
    },
    required: ["categoryId", "isActive"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateCategoryStatusArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.categoryId,
  getTargetById: (categoryId) =>
    categoryService.getCategoryById(categoryId),
  getTargetLabel: (category) => category.name,
  getSnapshot: (category) => ({
    isActive: category.isActive,
    updatedAt: toIsoString(category.updatedAt),
  }),
  createSummary: ({ target, arguments: argumentsValue }) =>
    `${argumentsValue.isActive ? "Mostrar" : "Ocultar"} la categoría «${target.name}»`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "isActive",
      from: target.isActive,
      to: argumentsValue.isActive,
    },
  ],
  getWarnings: ({ target, arguments: argumentsValue }) => {
    if (target.isActive === argumentsValue.isActive) {
      return ["La categoría ya está en ese estado."];
    }

    return target.isActive && !argumentsValue.isActive
      ? [
          "Al ocultar esta categoría, sus productos dejarán de mostrarse en el menú. Los productos no se borran ni se modifican.",
        ]
      : [];
  },
  execute: ({ targetId, arguments: argumentsValue }) =>
    categoryService.changeCategoryStatus({
      categoryId: targetId,
      isActive: argumentsValue.isActive,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.name,
    },
    isActive: domainResult.isActive,
  }),
  toAssistantMessage: ({ result }) =>
    `La categoría «${result.target.label}» ahora está ${
      result.isActive ? "visible" : "oculta"
    }.`,
};

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidCategorySortOrder(value) {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_CATEGORY_SORT_ORDER
  );
}

function validateCreateCategoryArguments(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    value.name.trim().length > MAX_CATEGORY_NAME_LENGTH ||
    slugify(value.name) === ""
  ) {
    return null;
  }

  const result = { name: value.name.trim() };

  if (Object.hasOwn(value, "description")) {
    if (
      value.description !== null &&
      (typeof value.description !== "string" ||
        value.description.length >
          MAX_CATEGORY_DESCRIPTION_LENGTH)
    ) {
      return null;
    }
    result.description = value.description;
  }

  if (Object.hasOwn(value, "sortOrder")) {
    if (!isValidCategorySortOrder(value.sortOrder)) {
      return null;
    }
    result.sortOrder = value.sortOrder;
  }

  if (Object.hasOwn(value, "imageMediaId")) {
    if (
      value.imageMediaId !== null &&
      (!Number.isSafeInteger(value.imageMediaId) ||
        value.imageMediaId < 1)
    ) {
      return null;
    }
    result.imageMediaId = value.imageMediaId;
  }

  return result;
}

function validateUpdateCategoryArguments(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    !Number.isSafeInteger(value.categoryId) ||
    value.categoryId < 1
  ) {
    return null;
  }

  const result = { categoryId: value.categoryId };
  let hasUpdate = false;

  if (Object.hasOwn(value, "name")) {
    if (
      typeof value.name !== "string" ||
      value.name.trim() === "" ||
      value.name.trim().length > MAX_CATEGORY_NAME_LENGTH ||
      slugify(value.name) === ""
    ) {
      return null;
    }
    result.name = value.name.trim();
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "description")) {
    if (
      value.description !== null &&
      (typeof value.description !== "string" ||
        value.description.length >
          MAX_CATEGORY_DESCRIPTION_LENGTH)
    ) {
      return null;
    }
    result.description = value.description;
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "sortOrder")) {
    if (!isValidCategorySortOrder(value.sortOrder)) {
      return null;
    }
    result.sortOrder = value.sortOrder;
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "imageMediaId")) {
    if (
      value.imageMediaId !== null &&
      (!Number.isSafeInteger(value.imageMediaId) ||
        value.imageMediaId < 1)
    ) {
      return null;
    }
    result.imageMediaId = value.imageMediaId;
    hasUpdate = true;
  }

  if (!hasUpdate) {
    return null;
  }

  return result;
}

function validateDeleteCategoryArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.categoryId) ||
    value.categoryId < 1
  ) {
    return null;
  }

  return { categoryId: value.categoryId };
}

const createCategoryAction = {
  name: "create_category",
  mode: "write",
  targetType: "category",
  createsTarget: true,
  description:
    "Prepara la creación de una categoría para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      sortOrder: { type: "integer" },
      imageMediaId: { type: "integer" },
    },
    required: ["name"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateCreateCategoryArguments,
  getTargetId: () => 0,
  getTargetById: () => null,
  getTargetLabel: (_target, argumentsValue) =>
    argumentsValue.name,
  getSnapshot: () => null,
  createSummary: ({ arguments: argumentsValue }) =>
    `Crear la categoría «${argumentsValue.name}»`,
  getChanges: ({ arguments: argumentsValue }) => {
    const changes = [
      { field: "name", from: null, to: argumentsValue.name },
    ];

    for (const field of [
      "description",
      "sortOrder",
      "imageMediaId",
    ]) {
      if (Object.hasOwn(argumentsValue, field)) {
        changes.push({
          field,
          from: null,
          to: argumentsValue[field],
        });
      }
    }

    return changes;
  },
  getWarnings: () => [],
  execute: ({ arguments: argumentsValue }) =>
    categoryService.createCategory({
      name: argumentsValue.name,
      slug: slugify(argumentsValue.name),
      description: argumentsValue.description ?? null,
      sortOrder: argumentsValue.sortOrder ?? 0,
      imageMediaId: argumentsValue.imageMediaId ?? null,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.name,
    },
    created: true,
  }),
  toAssistantMessage: ({ result }) =>
    `La categoría «${result.target.label}» se creó.`,
};

const updateCategoryAction = {
  name: "update_category",
  mode: "write",
  targetType: "category",
  description:
    "Prepara la actualización de una categoría para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      categoryId: { type: "integer" },
      name: { type: "string" },
      description: { type: "string" },
      sortOrder: { type: "integer" },
      imageMediaId: { type: "integer" },
    },
    required: ["categoryId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateUpdateCategoryArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.categoryId,
  getTargetById: (categoryId) =>
    categoryService.getCategoryById(categoryId),
  getTargetLabel: (category) => category.name,
  getSnapshot: (category) => ({
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    imageMediaId: category.imageMediaId,
    updatedAt: toIsoString(category.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Actualizar la categoría «${target.name}»`,
  getChanges: ({ target, arguments: argumentsValue }) => {
    const changes = [];

    for (const field of [
      "name",
      "description",
      "sortOrder",
      "imageMediaId",
    ]) {
      if (Object.hasOwn(argumentsValue, field)) {
        changes.push({
          field,
          from: target[field],
          to: argumentsValue[field],
        });
      }
    }

    return changes;
  },
  getWarnings: () => [],
  execute: ({ targetId, arguments: argumentsValue }) => {
    const updates = {};

    for (const field of [
      "name",
      "description",
      "sortOrder",
      "imageMediaId",
    ]) {
      if (Object.hasOwn(argumentsValue, field)) {
        updates[field] = argumentsValue[field];
      }
    }

    if (Object.hasOwn(updates, "name")) {
      updates.slug = slugify(updates.name);
    }

    return categoryService.updateCategory({
      categoryId: targetId,
      updates,
    });
  },
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.name,
    },
    updated: true,
  }),
  toAssistantMessage: ({ result }) =>
    `La categoría «${result.target.label}» se actualizó.`,
};

const deleteCategoryAction = {
  name: "delete_category",
  mode: "write",
  targetType: "category",
  description:
    "Prepara el borrado de una categoría para que el usuario lo confirme.",
  parameters: {
    type: "object",
    properties: {
      categoryId: { type: "integer" },
    },
    required: ["categoryId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateDeleteCategoryArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.categoryId,
  getTargetById: (categoryId) =>
    categoryService.getCategoryById(categoryId),
  getTargetLabel: (category) => category.name,
  getSnapshot: (category) => ({
    name: category.name,
    updatedAt: toIsoString(category.updatedAt),
  }),
  // The service repeats this count right before deleting, so a product
  // created in between still answers 409 CATEGORY_HAS_PRODUCTS.
  getProposalRejectionMessage: async ({ target }) => {
    const data =
      await productService.listAdministrativeProducts({
        page: 1,
        limit: 1,
        categoryId: target.id,
        sortBy: "sortOrder",
        sortOrder: "asc",
      });
    const productCount = data.pagination.totalItems;

    if (productCount === 0) {
      return null;
    }

    return `«${target.name}» tiene ${productCount} producto${
      productCount === 1 ? "" : "s"
    }. Movelos a otra categoría o desactivala.`;
  },
  createSummary: ({ target }) =>
    `Borrar la categoría «${target.name}»`,
  getChanges: () => [],
  getWarnings: ({ target }) => [
    `Se borrará la categoría «${target.name}». No se puede deshacer; la imagen de la galería se conserva.`,
  ],
  execute: ({ targetId }) =>
    categoryService.deleteCategory(targetId),
  toResult: ({ target }) => ({
    target: {
      id: target.id,
      label: target.name,
    },
    deleted: true,
  }),
  toAssistantMessage: ({ result }) =>
    `La categoría «${result.target.label}» se borró.`,
};

function validateCreateProductArguments(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    !Number.isSafeInteger(value.categoryId) ||
    value.categoryId < 1
  ) {
    return null;
  }

  if (typeof value.name !== "string" || value.name.trim() === "") {
    return null;
  }

  const result = {
    categoryId: value.categoryId,
    name: value.name.trim(),
  };

  if (Object.hasOwn(value, "description")) {
    result.description =
      value.description === null
        ? null
        : String(value.description).trim();
  }

  if (Object.hasOwn(value, "price")) {
    if (
      value.price !== null &&
      (typeof value.price !== "number" ||
        !Number.isFinite(value.price) ||
        value.price < 0)
    ) {
      return null;
    }
    result.price = value.price ?? null;
  }

  if (Object.hasOwn(value, "sortOrder")) {
    if (
      !Number.isSafeInteger(value.sortOrder) ||
      value.sortOrder < 0
    ) {
      return null;
    }
    result.sortOrder = value.sortOrder;
  }

  if (Object.hasOwn(value, "imageMediaId")) {
    if (
      value.imageMediaId !== null &&
      (!Number.isSafeInteger(value.imageMediaId) ||
        value.imageMediaId < 1)
    ) {
      return null;
    }
    result.imageMediaId = value.imageMediaId ?? null;
  }

  return result;
}

function validateUpdateProductArguments(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    !Number.isSafeInteger(value.productId) ||
    value.productId < 1
  ) {
    return null;
  }

  const result = { productId: value.productId };
  let hasUpdate = false;

  if (Object.hasOwn(value, "categoryId")) {
    if (
      !Number.isSafeInteger(value.categoryId) ||
      value.categoryId < 1
    ) {
      return null;
    }
    result.categoryId = value.categoryId;
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "name")) {
    if (
      typeof value.name !== "string" ||
      value.name.trim() === ""
    ) {
      return null;
    }
    result.name = value.name.trim();
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "description")) {
    result.description =
      value.description === null
        ? null
        : String(value.description).trim();
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "price")) {
    if (
      value.price !== null &&
      (typeof value.price !== "number" ||
        !Number.isFinite(value.price) ||
        value.price < 0)
    ) {
      return null;
    }
    result.price = value.price;
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "sortOrder")) {
    if (
      !Number.isSafeInteger(value.sortOrder) ||
      value.sortOrder < 0
    ) {
      return null;
    }
    result.sortOrder = value.sortOrder;
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "imageMediaId")) {
    if (
      value.imageMediaId !== null &&
      (!Number.isSafeInteger(value.imageMediaId) ||
        value.imageMediaId < 1)
    ) {
      return null;
    }
    result.imageMediaId = value.imageMediaId;
    hasUpdate = true;
  }

  if (!hasUpdate) {
    return null;
  }

  return result;
}

function validateProductActiveArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.productId) ||
    value.productId < 1 ||
    typeof value.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    productId: value.productId,
    isActive: value.isActive,
  };
}

function validateDeleteProductArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.productId) ||
    value.productId < 1
  ) {
    return null;
  }

  return { productId: value.productId };
}

const createProduct = {
  name: "create_product",
  mode: "write",
  targetType: "product",
  createsTarget: true,
  description:
    "Prepara la creación de un producto para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      categoryId: { type: "integer" },
      name: { type: "string" },
      description: { type: "string" },
      price: { type: "number" },
      sortOrder: { type: "integer" },
      imageMediaId: { type: "integer" },
    },
    required: ["categoryId", "name"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateCreateProductArguments,
  getTargetId: () => 0,
  getTargetById: () => null,
  getTargetLabel: (_target, argumentsValue) =>
    argumentsValue.name,
  getSnapshot: () => null,
  createSummary: ({ arguments: argumentsValue }) =>
    `Crear el producto «${argumentsValue.name}»`,
  getChanges: ({ arguments: argumentsValue }) => {
    const changes = [
      { field: "name", from: null, to: argumentsValue.name },
      {
        field: "categoryId",
        from: null,
        to: argumentsValue.categoryId,
      },
    ];
    if (
      argumentsValue.price !== null &&
      argumentsValue.price !== undefined
    ) {
      changes.push({
        field: "price",
        from: null,
        to: argumentsValue.price,
      });
    }
    return changes;
  },
  getWarnings: () => [],
  execute: ({ arguments: argumentsValue }) => {
    const slug = slugify(argumentsValue.name);
    return productService.createProduct({
      categoryId: argumentsValue.categoryId,
      name: argumentsValue.name,
      slug,
      description:
        argumentsValue.description ?? null,
      price: argumentsValue.price ?? null,
      isAvailable: true,
      sortOrder: argumentsValue.sortOrder ?? 0,
      imageMediaId:
        argumentsValue.imageMediaId ?? null,
    });
  },
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.name,
    },
    created: true,
  }),
  toAssistantMessage: ({ result }) =>
    `El producto «${result.target.label}» se creó.`,
};

const updateProduct = {
  name: "update_product",
  mode: "write",
  targetType: "product",
  description:
    "Prepara la actualización de un producto para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "integer" },
      categoryId: { type: "integer" },
      name: { type: "string" },
      description: { type: "string" },
      price: { type: "number" },
      sortOrder: { type: "integer" },
      imageMediaId: { type: "integer" },
    },
    required: ["productId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateUpdateProductArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.productId,
  getTargetById: (productId) =>
    productService.getProductById(productId),
  getTargetLabel: (product) => product.name,
  getSnapshot: (product) => ({
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    price: product.price,
    sortOrder: product.sortOrder,
    imageMediaId: product.imageMediaId,
    updatedAt: toIsoString(product.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Actualizar el producto «${target.name}»`,
  getChanges: ({ target, arguments: argumentsValue }) => {
    const changes = [];
    if (Object.hasOwn(argumentsValue, "categoryId")) {
      changes.push({
        field: "categoryId",
        from: target.categoryId,
        to: argumentsValue.categoryId,
      });
    }
    if (Object.hasOwn(argumentsValue, "name")) {
      changes.push({
        field: "name",
        from: target.name,
        to: argumentsValue.name,
      });
    }
    if (Object.hasOwn(argumentsValue, "description")) {
      changes.push({
        field: "description",
        from: target.description,
        to: argumentsValue.description,
      });
    }
    if (Object.hasOwn(argumentsValue, "price")) {
      changes.push({
        field: "price",
        from: target.price,
        to: argumentsValue.price,
      });
    }
    if (Object.hasOwn(argumentsValue, "sortOrder")) {
      changes.push({
        field: "sortOrder",
        from: target.sortOrder,
        to: argumentsValue.sortOrder,
      });
    }
    if (Object.hasOwn(argumentsValue, "imageMediaId")) {
      changes.push({
        field: "imageMediaId",
        from: target.imageMediaId,
        to: argumentsValue.imageMediaId,
      });
    }
    return changes;
  },
  getWarnings: () => [],
  execute: ({ targetId, arguments: argumentsValue }) => {
    const updates = {};
    if (Object.hasOwn(argumentsValue, "categoryId")) {
      updates.categoryId = argumentsValue.categoryId;
    }
    if (Object.hasOwn(argumentsValue, "name")) {
      updates.name = argumentsValue.name;
      updates.slug = slugify(argumentsValue.name);
    }
    if (Object.hasOwn(argumentsValue, "description")) {
      updates.description = argumentsValue.description;
    }
    if (Object.hasOwn(argumentsValue, "price")) {
      updates.price = argumentsValue.price;
    }
    if (Object.hasOwn(argumentsValue, "sortOrder")) {
      updates.sortOrder = argumentsValue.sortOrder;
    }
    if (Object.hasOwn(argumentsValue, "imageMediaId")) {
      updates.imageMediaId = argumentsValue.imageMediaId;
    }
    return productService.updateProduct({
      productId: targetId,
      updates,
    });
  },
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.name,
    },
    updated: true,
  }),
  toAssistantMessage: ({ result }) =>
    `El producto «${result.target.label}» se actualizó.`,
};

const setProductActive = {
  name: "set_product_active",
  mode: "write",
  targetType: "product",
  description:
    "Prepara la activación u ocultación de un producto para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "integer" },
      isActive: { type: "boolean" },
    },
    required: ["productId", "isActive"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateProductActiveArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.productId,
  getTargetById: (productId) =>
    productService.getProductById(productId),
  getTargetLabel: (product) => product.name,
  getSnapshot: (product) => ({
    isActive: product.isActive,
    updatedAt: toIsoString(product.updatedAt),
  }),
  createSummary: ({ target, arguments: argumentsValue }) =>
    `${argumentsValue.isActive ? "Mostrar" : "Ocultar"} el producto «${target.name}»`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "isActive",
      from: target.isActive,
      to: argumentsValue.isActive,
    },
  ],
  getWarnings: () => [],
  execute: ({ targetId, arguments: argumentsValue }) =>
    productService.changeProductStatus({
      productId: targetId,
      isActive: argumentsValue.isActive,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.name,
    },
    isActive: domainResult.isActive,
  }),
  toAssistantMessage: ({ result }) =>
    `El producto «${result.target.label}» ahora está ${
      result.isActive ? "activo" : "inactivo"
    }.`,
};

const deleteProduct = {
  name: "delete_product",
  mode: "write",
  targetType: "product",
  description:
    "Prepara el borrado de un producto para que el usuario lo confirme.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "integer" },
    },
    required: ["productId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateDeleteProductArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.productId,
  getTargetById: (productId) =>
    productService.getProductById(productId),
  getTargetLabel: (product) => product.name,
  getSnapshot: (product) => ({
    name: product.name,
    updatedAt: toIsoString(product.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Borrar el producto «${target.name}»`,
  getChanges: () => [],
  getWarnings: ({ target }) => [
    `Se borrará el producto «${target.name}» de la categoría «${target.category?.name ?? "sin categoría"}». La imagen de la galería se conserva.`,
  ],
  execute: ({ targetId }) =>
    productService.deleteProduct(targetId),
  toResult: ({ target }) => ({
    target: {
      id: target.id,
      label: target.name,
    },
    deleted: true,
  }),
  toAssistantMessage: ({ result }) =>
    `El producto «${result.target.label}» se borró.`,
};

// Bulk actions act on a whole category, so the pending action's target is the
// category and the snapshot is its identity plus the product count: if a
// product is added or removed while the card is open, confirming answers
// CONFLICT instead of changing a set the user never saw.
async function getCategoryProductsTarget(categoryId) {
  const category =
    await categoryService.getCategoryById(categoryId);
  const data =
    await productService.listAdministrativeProducts({
      page: 1,
      limit:
        MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS + 1,
      categoryId,
      sortBy: "name",
      sortOrder: "asc",
    });

  return {
    id: category.id,
    name: category.name,
    productCount: data.pagination.totalItems,
    productNames: data.products
      .slice(0, MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS)
      .map((product) => product.name),
  };
}

function countProductsLabel(count) {
  return `${count} producto${count === 1 ? "" : "s"}`;
}

function stateLabel(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function bulkStateMessage({ result, suffix }) {
  if (result.appliedCount === 0) {
    return `Ningún producto de «${result.target.label}» cambió: ya estaban como ${suffix}.`;
  }

  const pending =
    result.productCount - result.appliedCount;
  const pendingNote =
    pending > 0
      ? ` (${countProductsLabel(pending)} ya ${
          pending === 1 ? "estaba" : "estaban"
        } así)`
      : "";

  return `Se ${
    result.appliedCount === 1
      ? "actualizó"
      : "actualizaron"
  } ${countProductsLabel(result.appliedCount)} de «${result.target.label}» como ${suffix}${pendingNote}.`;
}

function getBulkProductChanges(target) {
  return [
    {
      field: "productCount",
      from: 0,
      to: target.productCount,
    },
    {
      field: "productNames",
      from: [],
      to: target.productNames,
    },
  ];
}

function getBulkProductWarnings(target, extraWarnings = []) {
  if (target.productCount === 0) {
    return [
      `La categoría «${target.name}» no tiene productos, así que no se va a cambiar nada.`,
    ];
  }

  const warnings = [...extraWarnings];

  if (
    target.productCount > target.productNames.length
  ) {
    warnings.push(
      `Se listan los primeros ${target.productNames.length} de ${countProductsLabel(target.productCount)}.`
    );
  }

  return warnings;
}

function validateMoveProductsArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.fromCategoryId) ||
    value.fromCategoryId < 1 ||
    !Number.isSafeInteger(value.toCategoryId) ||
    value.toCategoryId < 1
  ) {
    return null;
  }

  return {
    fromCategoryId: value.fromCategoryId,
    toCategoryId: value.toCategoryId,
  };
}

function validateCategoryProductsStateArguments(
  value,
  stateField
) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.categoryId) ||
    value.categoryId < 1 ||
    typeof value[stateField] !== "boolean"
  ) {
    return null;
  }

  return {
    categoryId: value.categoryId,
    [stateField]: value[stateField],
  };
}

const moveProductsToCategory = {
  name: "move_products_to_category",
  mode: "write",
  targetType: "category",
  description:
    "Prepara el traslado de todos los productos de una categoría a otra para que el usuario lo confirme.",
  parameters: {
    type: "object",
    properties: {
      fromCategoryId: { type: "integer" },
      toCategoryId: { type: "integer" },
    },
    required: ["fromCategoryId", "toCategoryId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateMoveProductsArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.fromCategoryId,
  getTargetById: async (fromCategoryId, argumentsValue) => {
    const target =
      await getCategoryProductsTarget(fromCategoryId);
    const destination =
      await categoryService.getCategoryById(
        argumentsValue.toCategoryId
      );

    return {
      ...target,
      destination: {
        id: destination.id,
        name: destination.name,
        isActive: destination.isActive,
      },
    };
  },
  getTargetLabel: (target) => target.name,
  getSnapshot: (target) => ({
    categoryId: target.id,
    productCount: target.productCount,
    destinationId: target.destination.id,
    destinationName: target.destination.name,
  }),
  getProposalRejectionMessage: ({
    target,
    arguments: argumentsValue,
  }) => {
    if (
      argumentsValue.fromCategoryId ===
      argumentsValue.toCategoryId
    ) {
      return "La categoría de origen y la de destino son la misma.";
    }

    if (!target.destination.isActive) {
      return `La categoría «${target.destination.name}» está oculta. Mostrala primero para poder mover productos ahí.`;
    }

    return null;
  },
  createSummary: ({ target }) =>
    `Mover ${countProductsLabel(target.productCount)} de «${target.name}» a «${target.destination.name}»`,
  getChanges: ({ target }) => [
    {
      field: "categoryId",
      from: target.name,
      to: target.destination.name,
    },
    ...getBulkProductChanges(target),
  ],
  getWarnings: ({ target }) =>
    getBulkProductWarnings(target),
  execute: ({ targetId, arguments: argumentsValue }) =>
    productService.moveProductsToCategory({
      fromCategoryId: targetId,
      toCategoryId: argumentsValue.toCategoryId,
    }),
  toResult: ({ target, domainResult }) => ({
    target: {
      id: target.id,
      label: target.name,
    },
    destination: {
      id: target.destination.id,
      label: target.destination.name,
    },
    appliedCount: domainResult.appliedCount,
    productCount: target.productCount,
  }),
  toAssistantMessage: ({ result }) =>
    result.appliedCount === 0
      ? `No se movió ningún producto desde «${result.target.label}».`
      : `Se ${
          result.appliedCount === 1
            ? "movió"
            : "movieron"
        } ${countProductsLabel(result.appliedCount)} de «${result.target.label}» a «${result.destination.label}».`,
};

const setProductsAvailability = {
  name: "set_products_availability",
  mode: "write",
  targetType: "category",
  description:
    "Prepara el cambio de disponibilidad de todos los productos de una categoría para que el usuario lo confirme.",
  parameters: {
    type: "object",
    properties: {
      categoryId: { type: "integer" },
      isAvailable: { type: "boolean" },
    },
    required: ["categoryId", "isAvailable"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: (value) =>
    validateCategoryProductsStateArguments(
      value,
      "isAvailable"
    ),
  getTargetId: (argumentsValue) =>
    argumentsValue.categoryId,
  getTargetById: (categoryId) =>
    getCategoryProductsTarget(categoryId),
  getTargetLabel: (target) => target.name,
  getSnapshot: (target) => ({
    categoryId: target.id,
    productCount: target.productCount,
  }),
  createSummary: ({ target, arguments: argumentsValue }) =>
    `Marcar ${countProductsLabel(target.productCount)} de «${target.name}» como ${stateLabel(
      target.productCount,
      argumentsValue.isAvailable
        ? "disponible"
        : "no disponible",
      argumentsValue.isAvailable
        ? "disponibles"
        : "no disponibles"
    )}`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "productsAvailability",
      from: null,
      to: argumentsValue.isAvailable,
    },
    ...getBulkProductChanges(target),
  ],
  getWarnings: ({ target }) =>
    getBulkProductWarnings(target),
  execute: ({ targetId, arguments: argumentsValue }) =>
    productService.changeProductsAvailabilityByCategory({
      categoryId: targetId,
      isAvailable: argumentsValue.isAvailable,
    }),
  toResult: ({ target, domainResult }) => ({
    target: {
      id: target.id,
      label: target.name,
    },
    isAvailable: domainResult.isAvailable,
    appliedCount: domainResult.appliedCount,
    productCount: target.productCount,
  }),
  toAssistantMessage: ({ result }) => {
    const suffix = result.isAvailable
      ? "disponibles"
      : "no disponibles";

    return bulkStateMessage({
      result,
      suffix,
    });
  },
};

const setProductsActive = {
  name: "set_products_active",
  mode: "write",
  targetType: "category",
  description:
    "Prepara la activación u ocultación de todos los productos de una categoría para que el usuario lo confirme.",
  parameters: {
    type: "object",
    properties: {
      categoryId: { type: "integer" },
      isActive: { type: "boolean" },
    },
    required: ["categoryId", "isActive"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: (value) =>
    validateCategoryProductsStateArguments(
      value,
      "isActive"
    ),
  getTargetId: (argumentsValue) =>
    argumentsValue.categoryId,
  getTargetById: (categoryId) =>
    getCategoryProductsTarget(categoryId),
  getTargetLabel: (target) => target.name,
  getSnapshot: (target) => ({
    categoryId: target.id,
    productCount: target.productCount,
  }),
  createSummary: ({ target, arguments: argumentsValue }) =>
    `${argumentsValue.isActive ? "Mostrar" : "Ocultar"} ${countProductsLabel(target.productCount)} de «${target.name}»`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "productsActive",
      from: null,
      to: argumentsValue.isActive,
    },
    ...getBulkProductChanges(target),
  ],
  getWarnings: ({ target, arguments: argumentsValue }) =>
    getBulkProductWarnings(
      target,
      argumentsValue.isActive
        ? []
        : [
            "Los productos dejan de verse en el menú, pero no se borran ni se modifican.",
          ]
    ),
  execute: ({ targetId, arguments: argumentsValue }) =>
    productService.changeProductsStatusByCategory({
      categoryId: targetId,
      isActive: argumentsValue.isActive,
    }),
  toResult: ({ target, domainResult }) => ({
    target: {
      id: target.id,
      label: target.name,
    },
    isActive: domainResult.isActive,
    appliedCount: domainResult.appliedCount,
    productCount: target.productCount,
  }),
  toAssistantMessage: ({ result }) =>
    bulkStateMessage({
      result,
      suffix: result.isActive ? "visibles" : "ocultos",
    }),
};

// Los argumentos se guardan como JSON en la accion pendiente, asi que las
// fechas viajan como string ISO y se convierten a Date recien al ejecutar.
const INVALID_ANNOUNCEMENT_ARGUMENTS = Symbol(
  "invalid-announcement-arguments"
);

function parseAnnouncementDate(value) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return INVALID_ANNOUNCEMENT_ARGUMENTS;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return INVALID_ANNOUNCEMENT_ARGUMENTS;
  }

  return value;
}

function toAnnouncementDate(value) {
  return value === null || value === undefined
    ? null
    : new Date(value);
}

function validateAnnouncementCommonArguments(value, result) {
  if (Object.hasOwn(value, "type")) {
    if (
      typeof value.type !== "string" ||
      !ANNOUNCEMENT_TYPES.includes(value.type)
    ) {
      return null;
    }
    result.type = value.type;
  }

  for (const field of ["startsAt", "endsAt"]) {
    if (Object.hasOwn(value, field)) {
      const parsed = parseAnnouncementDate(value[field]);
      if (parsed === INVALID_ANNOUNCEMENT_ARGUMENTS) {
        return null;
      }
      result[field] = parsed;
    }
  }

  if (Object.hasOwn(value, "sortOrder")) {
    if (
      !Number.isSafeInteger(value.sortOrder) ||
      value.sortOrder < 0 ||
      value.sortOrder > MAX_ANNOUNCEMENT_SORT_ORDER
    ) {
      return null;
    }
    result.sortOrder = value.sortOrder;
  }

  if (Object.hasOwn(value, "imageMediaId")) {
    if (
      value.imageMediaId !== null &&
      (!Number.isSafeInteger(value.imageMediaId) ||
        value.imageMediaId < 1)
    ) {
      return null;
    }
    result.imageMediaId = value.imageMediaId;
  }

  return result;
}

function validateCreateAnnouncementArguments(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  if (typeof value.title !== "string") {
    return null;
  }

  const title = value.title.trim();
  if (
    title === "" ||
    title.length > MAX_ANNOUNCEMENT_TITLE_LENGTH
  ) {
    return null;
  }

  if (typeof value.content !== "string") {
    return null;
  }

  const content = value.content.trim();
  if (
    content === "" ||
    content.length > MAX_ANNOUNCEMENT_CONTENT_LENGTH
  ) {
    return null;
  }

  const result = validateAnnouncementCommonArguments(value, {
    title,
    content,
  });

  if (!result) {
    return null;
  }

  if (
    Object.hasOwn(result, "startsAt") &&
    Object.hasOwn(result, "endsAt") &&
    result.startsAt !== null &&
    result.endsAt !== null &&
    new Date(result.endsAt) <= new Date(result.startsAt)
  ) {
    return null;
  }

  if (Object.hasOwn(value, "isActive")) {
    if (typeof value.isActive !== "boolean") {
      return null;
    }
    result.isActive = value.isActive;
  }

  return result;
}

function validateUpdateAnnouncementArguments(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    !Number.isSafeInteger(value.announcementId) ||
    value.announcementId < 1
  ) {
    return null;
  }

  const result = {
    announcementId: value.announcementId,
  };
  let hasUpdate = false;

  if (Object.hasOwn(value, "title")) {
    if (typeof value.title !== "string") {
      return null;
    }
    const title = value.title.trim();
    if (
      title === "" ||
      title.length > MAX_ANNOUNCEMENT_TITLE_LENGTH
    ) {
      return null;
    }
    result.title = title;
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "content")) {
    if (typeof value.content !== "string") {
      return null;
    }
    const content = value.content.trim();
    if (
      content === "" ||
      content.length > MAX_ANNOUNCEMENT_CONTENT_LENGTH
    ) {
      return null;
    }
    result.content = content;
    hasUpdate = true;
  }

  if (
    !validateAnnouncementCommonArguments(value, result)
  ) {
    return null;
  }

  for (const field of [
    "type",
    "startsAt",
    "endsAt",
    "sortOrder",
    "imageMediaId",
  ]) {
    if (Object.hasOwn(value, field)) {
      hasUpdate = true;
    }
  }

  if (!hasUpdate) {
    return null;
  }

  if (
    Object.hasOwn(result, "startsAt") &&
    Object.hasOwn(result, "endsAt") &&
    result.startsAt !== null &&
    result.endsAt !== null &&
    new Date(result.endsAt) <= new Date(result.startsAt)
  ) {
    return null;
  }

  return result;
}

function validateDeleteAnnouncementArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.announcementId) ||
    value.announcementId < 1
  ) {
    return null;
  }

  return { announcementId: value.announcementId };
}

function getAnnouncementScheduleRejectionMessage({
  target,
  arguments: argumentsValue,
}) {
  const startsAt = Object.hasOwn(
    argumentsValue,
    "startsAt"
  )
    ? argumentsValue.startsAt
    : target.startsAt;
  const endsAt = Object.hasOwn(argumentsValue, "endsAt")
    ? argumentsValue.endsAt
    : target.endsAt;
  const start =
    startsAt === null ? null : new Date(startsAt);
  const end = endsAt === null ? null : new Date(endsAt);

  if (start !== null && end !== null && end <= start) {
    return "La fecha de fin debe ser posterior a la fecha de inicio.";
  }

  if (end !== null && end <= new Date()) {
    return "La fecha de fin ya pasó: elegí una fecha futura o dejá el aviso sin fecha de fin.";
  }

  return null;
}

const createAnnouncement = {
  name: "create_announcement",
  mode: "write",
  targetType: "announcement",
  createsTarget: true,
  description:
    "Prepara la creación de un aviso para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      content: { type: "string" },
      type: { type: "string" },
      startsAt: { type: "string" },
      endsAt: { type: "string" },
      sortOrder: { type: "integer" },
      imageMediaId: { type: "integer" },
      isActive: { type: "boolean" },
    },
    required: ["title", "content"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateCreateAnnouncementArguments,
  getTargetId: () => 0,
  getTargetById: () => null,
  getTargetLabel: (_target, argumentsValue) =>
    argumentsValue.title,
  getSnapshot: () => null,
  createSummary: ({ arguments: argumentsValue }) =>
    `Crear el aviso «${argumentsValue.title}»`,
  getChanges: ({ arguments: argumentsValue }) => {
    const changes = [
      {
        field: "title",
        from: null,
        to: argumentsValue.title,
      },
      {
        field: "content",
        from: null,
        to: argumentsValue.content,
      },
      {
        field: "type",
        from: null,
        to: argumentsValue.type ?? "INFO",
      },
    ];

    if (Object.hasOwn(argumentsValue, "startsAt")) {
      changes.push({
        field: "startsAt",
        from: null,
        to: argumentsValue.startsAt,
      });
    }
    if (Object.hasOwn(argumentsValue, "endsAt")) {
      changes.push({
        field: "endsAt",
        from: null,
        to: argumentsValue.endsAt,
      });
    }
    if (Object.hasOwn(argumentsValue, "isActive")) {
      changes.push({
        field: "isActive",
        from: null,
        to: argumentsValue.isActive,
      });
    }

    return changes;
  },
  getWarnings: ({ arguments: argumentsValue }) => {
    const warnings = [];

    if (argumentsValue.isActive === true) {
      warnings.push(
        "Publicar el aviso puede enviar una notificación push a los suscriptores si están configuradas."
      );
    }

    if (
      typeof argumentsValue.startsAt === "string" &&
      new Date(argumentsValue.startsAt) > new Date()
    ) {
      warnings.push(
        "El aviso queda programado: no será visible en el sitio hasta la fecha de inicio."
      );
    }

    return warnings;
  },
  execute: async ({ arguments: argumentsValue }) => {
    const created =
      await announcementService.createAnnouncement({
        title: argumentsValue.title,
        content: argumentsValue.content,
        type: argumentsValue.type ?? "INFO",
        startsAt: toAnnouncementDate(
          argumentsValue.startsAt
        ),
        endsAt: toAnnouncementDate(argumentsValue.endsAt),
        sortOrder: argumentsValue.sortOrder ?? 0,
        imageMediaId: argumentsValue.imageMediaId ?? null,
      });

    // La API crea todo como borrador; publicar es un segundo paso, igual
    // que en el panel. Si esa llamada falla el aviso ya existe como
    // borrador y la ejecución se reporta como fallida.
    if (argumentsValue.isActive === true) {
      return announcementService.changeAnnouncementStatus({
        announcementId: created.id,
        isActive: true,
      });
    }

    return created;
  },
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.title,
    },
    isActive: domainResult.isActive,
  }),
  toAssistantMessage: ({ result }) =>
    result.isActive
      ? `El aviso «${result.target.label}» se creó y quedó publicado.`
      : `El aviso «${result.target.label}» se creó como borrador.`,
};

const updateAnnouncement = {
  name: "update_announcement",
  mode: "write",
  targetType: "announcement",
  description:
    "Prepara la actualización de un aviso para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      announcementId: { type: "integer" },
      title: { type: "string" },
      content: { type: "string" },
      type: { type: "string" },
      startsAt: { type: "string" },
      endsAt: { type: "string" },
      sortOrder: { type: "integer" },
      imageMediaId: { type: "integer" },
    },
    required: ["announcementId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateUpdateAnnouncementArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.announcementId,
  getTargetById: (announcementId) =>
    announcementService.getAnnouncementById(announcementId),
  getTargetLabel: (announcement) => announcement.title,
  getSnapshot: (announcement) => ({
    title: announcement.title,
    content: announcement.content,
    type: announcement.type,
    startsAt: announcement.startsAt,
    endsAt: announcement.endsAt,
    sortOrder: announcement.sortOrder,
    imageMediaId: announcement.imageMediaId,
    isActive: announcement.isActive,
    updatedAt: toIsoString(announcement.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Actualizar el aviso «${target.title}»`,
  getChanges: ({ target, arguments: argumentsValue }) => {
    const changes = [];

    if (Object.hasOwn(argumentsValue, "title")) {
      changes.push({
        field: "title",
        from: target.title,
        to: argumentsValue.title,
      });
    }
    if (Object.hasOwn(argumentsValue, "content")) {
      changes.push({
        field: "content",
        from: target.content,
        to: argumentsValue.content,
      });
    }
    if (Object.hasOwn(argumentsValue, "type")) {
      changes.push({
        field: "type",
        from: target.type,
        to: argumentsValue.type,
      });
    }
    if (Object.hasOwn(argumentsValue, "startsAt")) {
      changes.push({
        field: "startsAt",
        from: target.startsAt,
        to: argumentsValue.startsAt,
      });
    }
    if (Object.hasOwn(argumentsValue, "endsAt")) {
      changes.push({
        field: "endsAt",
        from: target.endsAt,
        to: argumentsValue.endsAt,
      });
    }
    if (Object.hasOwn(argumentsValue, "sortOrder")) {
      changes.push({
        field: "sortOrder",
        from: target.sortOrder,
        to: argumentsValue.sortOrder,
      });
    }
    if (Object.hasOwn(argumentsValue, "imageMediaId")) {
      changes.push({
        field: "imageMediaId",
        from: target.imageMediaId,
        to: argumentsValue.imageMediaId,
      });
    }

    return changes;
  },
  getWarnings: () => [],
  getProposalRejectionMessage:
    getAnnouncementScheduleRejectionMessage,
  execute: ({ targetId, arguments: argumentsValue }) => {
    const updates = {};

    if (Object.hasOwn(argumentsValue, "title")) {
      updates.title = argumentsValue.title;
    }
    if (Object.hasOwn(argumentsValue, "content")) {
      updates.content = argumentsValue.content;
    }
    if (Object.hasOwn(argumentsValue, "type")) {
      updates.type = argumentsValue.type;
    }
    if (Object.hasOwn(argumentsValue, "startsAt")) {
      updates.startsAt = toAnnouncementDate(
        argumentsValue.startsAt
      );
    }
    if (Object.hasOwn(argumentsValue, "endsAt")) {
      updates.endsAt = toAnnouncementDate(
        argumentsValue.endsAt
      );
    }
    if (Object.hasOwn(argumentsValue, "sortOrder")) {
      updates.sortOrder = argumentsValue.sortOrder;
    }
    if (Object.hasOwn(argumentsValue, "imageMediaId")) {
      updates.imageMediaId = argumentsValue.imageMediaId;
    }

    return announcementService.updateAnnouncement({
      announcementId: targetId,
      updates,
    });
  },
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.title,
    },
    updated: true,
  }),
  toAssistantMessage: ({ result }) =>
    `El aviso «${result.target.label}» se actualizó.`,
};

const deleteAnnouncement = {
  name: "delete_announcement",
  mode: "write",
  targetType: "announcement",
  description:
    "Prepara el borrado de un aviso para que el usuario lo confirme.",
  parameters: {
    type: "object",
    properties: {
      announcementId: { type: "integer" },
    },
    required: ["announcementId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateDeleteAnnouncementArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.announcementId,
  getTargetById: (announcementId) =>
    announcementService.getAnnouncementById(announcementId),
  getTargetLabel: (announcement) => announcement.title,
  getSnapshot: (announcement) => ({
    title: announcement.title,
    isActive: announcement.isActive,
    updatedAt: toIsoString(announcement.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Borrar el aviso «${target.title}»`,
  getChanges: () => [],
  getWarnings: ({ target }) => [
    `Se borrará el aviso «${target.title}»${
      target.isActive
        ? ", que está publicado y dejará de verse en el sitio"
        : ""
    }. La imagen de la galería se conserva.`,
  ],
  execute: ({ targetId }) =>
    announcementService.deleteAnnouncement(targetId),
  toResult: ({ target }) => ({
    target: {
      id: target.id,
      label: target.title,
    },
    deleted: true,
  }),
  toAssistantMessage: ({ result }) =>
    `El aviso «${result.target.label}» se borró.`,
};

function validateNotifyAnnouncementArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.announcementId) ||
    value.announcementId < 1
  ) {
    return null;
  }

  return { announcementId: value.announcementId };
}

// El envio real es del servicio de notificaciones. Estas comprobaciones solo
// evitan ofrecer una tarjeta que el servidor rechazaria con 409/503.
function getAnnouncementNotificationRejectionMessage({
  target,
}) {
  if (!notificationService.getPublicKeyConfig().enabled) {
    return "Las notificaciones push no están configuradas en el servidor, así que este aviso no se puede notificar.";
  }

  const now = new Date();

  if (!target.isActive) {
    return "El aviso está oculto: publicalo antes de enviar la notificación.";
  }

  if (
    target.startsAt !== null &&
    new Date(target.startsAt) > now
  ) {
    return "El aviso todavía no empezó: esperá a su fecha de inicio para notificarlo.";
  }

  if (
    target.endsAt !== null &&
    new Date(target.endsAt) <= now
  ) {
    return "El aviso ya terminó: actualizá sus fechas antes de notificarlo.";
  }

  return null;
}

const notifyAnnouncement = {
  name: "notify_announcement",
  mode: "write",
  targetType: "announcement",
  description:
    "Prepara el envío de la notificación push de un aviso publicado para que el usuario lo confirme.",
  parameters: {
    type: "object",
    properties: {
      announcementId: { type: "integer" },
    },
    required: ["announcementId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateNotifyAnnouncementArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.announcementId,
  getTargetById: (announcementId) =>
    announcementService.getAnnouncementById(announcementId),
  getTargetLabel: (announcement) => announcement.title,
  getSnapshot: (announcement) => ({
    title: announcement.title,
    isActive: announcement.isActive,
    startsAt: announcement.startsAt,
    endsAt: announcement.endsAt,
    notifiedAt: announcement.notifiedAt,
    updatedAt: toIsoString(announcement.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Notificar el aviso «${target.title}»`,
  getChanges: () => [],
  getWarnings: ({ target }) => [
    target.notifiedAt
      ? "Este aviso ya se notificó antes; se enviará de nuevo a todos los suscriptores."
      : "Se enviará una notificación push a todos los suscriptores. No se puede deshacer.",
  ],
  getProposalRejectionMessage:
    getAnnouncementNotificationRejectionMessage,
  execute: ({ targetId }) =>
    notificationService.resendAnnouncement(targetId),
  toResult: ({ target, domainResult }) => ({
    target: {
      id: target.id,
      label: target.title,
    },
    sent: domainResult.sent,
    failed: domainResult.failed,
    removed: domainResult.removed,
  }),
  toAssistantMessage: ({ result }) => {
    const sent = `${result.sent} enviada${
      result.sent === 1 ? "" : "s"
    }`;
    const failed =
      result.failed > 0
        ? ` y ${result.failed} con error`
        : "";

    return `Se envió la notificación del aviso «${result.target.label}»: ${sent}${failed}.`;
  },
};

// La galeria es la unica fuente de imagenes de la foto: no se sube nada
// desde el chat, solo se elige una imagen existente por su id.
const INVALID_PHOTO_ARGUMENTS = Symbol(
  "invalid-photo-arguments"
);

function parsePhotoCaption(value) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return INVALID_PHOTO_ARGUMENTS;
  }

  const caption = value.trim();
  if (caption.length > MAX_PHOTO_CAPTION_LENGTH) {
    return INVALID_PHOTO_ARGUMENTS;
  }

  return caption === "" ? null : caption;
}

function isValidPhotoSortOrder(value) {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PHOTO_SORT_ORDER
  );
}

function isValidPhotoImageId(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function validateCreatePhotoArguments(value) {
  if (
    !isPlainObject(value) ||
    !isValidPhotoImageId(value.imageMediaId)
  ) {
    return null;
  }

  const result = {
    imageMediaId: value.imageMediaId,
  };

  if (Object.hasOwn(value, "caption")) {
    const caption = parsePhotoCaption(value.caption);
    if (caption === INVALID_PHOTO_ARGUMENTS) {
      return null;
    }
    result.caption = caption;
  }

  if (Object.hasOwn(value, "sortOrder")) {
    if (!isValidPhotoSortOrder(value.sortOrder)) {
      return null;
    }
    result.sortOrder = value.sortOrder;
  }

  return result;
}

function validateUpdatePhotoArguments(value) {
  if (
    !isPlainObject(value) ||
    !isValidPhotoImageId(value.photoId)
  ) {
    return null;
  }

  const result = {
    photoId: value.photoId,
  };
  let hasUpdate = false;

  if (Object.hasOwn(value, "caption")) {
    const caption = parsePhotoCaption(value.caption);
    if (caption === INVALID_PHOTO_ARGUMENTS) {
      return null;
    }
    result.caption = caption;
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "imageMediaId")) {
    if (!isValidPhotoImageId(value.imageMediaId)) {
      return null;
    }
    result.imageMediaId = value.imageMediaId;
    hasUpdate = true;
  }

  if (Object.hasOwn(value, "sortOrder")) {
    if (!isValidPhotoSortOrder(value.sortOrder)) {
      return null;
    }
    result.sortOrder = value.sortOrder;
    hasUpdate = true;
  }

  return hasUpdate ? result : null;
}

function validatePhotoStatusArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !isValidPhotoImageId(value.photoId) ||
    typeof value.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    photoId: value.photoId,
    isActive: value.isActive,
  };
}

function validateDeletePhotoArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !isValidPhotoImageId(value.photoId)
  ) {
    return null;
  }

  return { photoId: value.photoId };
}

function getPhotoLabel(photo) {
  return photo.caption ?? `Imagen #${photo.image.id}`;
}

// La propuesta se rechaza antes de la tarjeta cuando la imagen no existe o
// no sirve, en vez de dejar que el borrado/creado falle al confirmar.
async function getPhotoCreationRejectionMessage({
  arguments: argumentsValue,
}) {
  let media;

  try {
    media = await mediaService.getMediaById(
      argumentsValue.imageMediaId
    );
  } catch (error) {
    if (
      error instanceof AppError &&
      error.statusCode === 404
    ) {
      return "No existe una imagen de la galería con ese id. Pedile al usuario que la suba desde Administración → Galería y buscala después con search_media.";
    }

    throw error;
  }

  if (!media.isActive) {
    return "Esa imagen está desactivada en la galería: activala antes de publicarla en Día a día.";
  }

  if (media.resourceType !== "IMAGE") {
    return "El archivo elegido no es una imagen: elegí una imagen de la galería.";
  }

  return null;
}

const createPhoto = {
  name: "create_photo",
  mode: "write",
  targetType: "photo",
  createsTarget: true,
  description:
    "Prepara la publicación de una imagen de la galería en Día a día para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      imageMediaId: { type: "integer" },
      caption: { type: "string" },
      sortOrder: { type: "integer" },
    },
    required: ["imageMediaId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateCreatePhotoArguments,
  getTargetId: () => 0,
  getTargetById: () => null,
  getTargetLabel: (_target, argumentsValue) =>
    argumentsValue.caption ??
    `Imagen #${argumentsValue.imageMediaId}`,
  getSnapshot: () => null,
  createSummary: ({ arguments: argumentsValue }) =>
    argumentsValue.caption
      ? `Publicar en Día a día la foto «${argumentsValue.caption}»`
      : `Publicar en Día a día la imagen #${argumentsValue.imageMediaId}`,
  getChanges: ({ arguments: argumentsValue }) => {
    const changes = [
      {
        field: "imageMediaId",
        from: null,
        to: argumentsValue.imageMediaId,
      },
    ];

    if (Object.hasOwn(argumentsValue, "caption")) {
      changes.push({
        field: "caption",
        from: null,
        to: argumentsValue.caption,
      });
    }
    if (Object.hasOwn(argumentsValue, "sortOrder")) {
      changes.push({
        field: "sortOrder",
        from: null,
        to: argumentsValue.sortOrder,
      });
    }

    // La foto se crea publicada, igual que en el panel.
    changes.push({
      field: "isActive",
      from: null,
      to: true,
    });

    return changes;
  },
  getWarnings: () => [],
  getProposalRejectionMessage:
    getPhotoCreationRejectionMessage,
  execute: ({ arguments: argumentsValue }) =>
    photosService.createPhoto({
      caption: argumentsValue.caption ?? null,
      imageMediaId: argumentsValue.imageMediaId,
      sortOrder: argumentsValue.sortOrder ?? 0,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: getPhotoLabel(domainResult),
    },
    isActive: domainResult.isActive,
  }),
  toAssistantMessage: ({ result }) =>
    `La foto «${result.target.label}» se publicó en Día a día.`,
};

const updatePhoto = {
  name: "update_photo",
  mode: "write",
  targetType: "photo",
  description:
    "Prepara la actualización de una foto de Día a día para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      photoId: { type: "integer" },
      caption: { type: "string" },
      imageMediaId: { type: "integer" },
      sortOrder: { type: "integer" },
    },
    required: ["photoId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateUpdatePhotoArguments,
  getTargetId: (argumentsValue) => argumentsValue.photoId,
  getTargetById: (photoId) =>
    photosService.getPhotoById(photoId),
  getTargetLabel: (photo) => getPhotoLabel(photo),
  getSnapshot: (photo) => ({
    caption: photo.caption,
    imageMediaId: photo.image.id,
    sortOrder: photo.sortOrder,
    isActive: photo.isActive,
    updatedAt: toIsoString(photo.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Actualizar la foto «${getPhotoLabel(target)}»`,
  getChanges: ({ target, arguments: argumentsValue }) => {
    const changes = [];

    if (Object.hasOwn(argumentsValue, "caption")) {
      changes.push({
        field: "caption",
        from: target.caption,
        to: argumentsValue.caption,
      });
    }
    if (Object.hasOwn(argumentsValue, "imageMediaId")) {
      changes.push({
        field: "imageMediaId",
        from: target.image.id,
        to: argumentsValue.imageMediaId,
      });
    }
    if (Object.hasOwn(argumentsValue, "sortOrder")) {
      changes.push({
        field: "sortOrder",
        from: target.sortOrder,
        to: argumentsValue.sortOrder,
      });
    }

    return changes;
  },
  getWarnings: () => [],
  execute: ({ targetId, arguments: argumentsValue }) => {
    const updates = {};

    if (Object.hasOwn(argumentsValue, "caption")) {
      updates.caption = argumentsValue.caption;
    }
    if (Object.hasOwn(argumentsValue, "imageMediaId")) {
      updates.imageMediaId = argumentsValue.imageMediaId;
    }
    if (Object.hasOwn(argumentsValue, "sortOrder")) {
      updates.sortOrder = argumentsValue.sortOrder;
    }

    return photosService.updatePhoto({
      photoId: targetId,
      updates,
    });
  },
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: getPhotoLabel(domainResult),
    },
    updated: true,
  }),
  toAssistantMessage: ({ result }) =>
    `La foto «${result.target.label}» se actualizó.`,
};

const setPhotoActive = {
  name: "set_photo_active",
  mode: "write",
  targetType: "photo",
  description:
    "Prepara la publicación u ocultación de una foto de Día a día para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      photoId: { type: "integer" },
      isActive: { type: "boolean" },
    },
    required: ["photoId", "isActive"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validatePhotoStatusArguments,
  getTargetId: (argumentsValue) => argumentsValue.photoId,
  getTargetById: (photoId) =>
    photosService.getPhotoById(photoId),
  getTargetLabel: (photo) => getPhotoLabel(photo),
  getSnapshot: (photo) => ({
    isActive: photo.isActive,
    updatedAt: toIsoString(photo.updatedAt),
  }),
  createSummary: ({ target, arguments: argumentsValue }) =>
    `${argumentsValue.isActive ? "Publicar" : "Ocultar"} la foto «${getPhotoLabel(target)}»`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "isActive",
      from: target.isActive,
      to: argumentsValue.isActive,
    },
  ],
  getWarnings: ({ target, arguments: argumentsValue }) =>
    target.isActive === argumentsValue.isActive
      ? ["La foto ya está en ese estado."]
      : [],
  execute: ({ targetId, arguments: argumentsValue }) =>
    photosService.updatePhoto({
      photoId: targetId,
      updates: {
        isActive: argumentsValue.isActive,
      },
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: getPhotoLabel(domainResult),
    },
    isActive: domainResult.isActive,
  }),
  toAssistantMessage: ({ result }) =>
    `La foto «${result.target.label}» ahora está ${
      result.isActive ? "publicada" : "oculta"
    }.`,
};

const deletePhoto = {
  name: "delete_photo",
  mode: "write",
  targetType: "photo",
  description:
    "Prepara el borrado de una foto de Día a día para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      photoId: { type: "integer" },
    },
    required: ["photoId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateDeletePhotoArguments,
  getTargetId: (argumentsValue) => argumentsValue.photoId,
  getTargetById: (photoId) =>
    photosService.getPhotoById(photoId),
  getTargetLabel: (photo) => getPhotoLabel(photo),
  getSnapshot: (photo) => ({
    caption: photo.caption,
    isActive: photo.isActive,
    updatedAt: toIsoString(photo.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Borrar la foto «${getPhotoLabel(target)}»`,
  getChanges: () => [],
  getWarnings: ({ target }) => [
    `Se borrará la foto «${getPhotoLabel(target)}»${
      target.isActive
        ? ", que está publicada y dejará de verse en Día a día"
        : ""
    }. La imagen de la galería se conserva.`,
  ],
  execute: ({ targetId }) =>
    photosService.deletePhoto(targetId),
  toResult: ({ target }) => ({
    target: {
      id: target.id,
      label: getPhotoLabel(target),
    },
    deleted: true,
  }),
  toAssistantMessage: ({ result }) =>
    `La foto «${result.target.label}» se borró.`,
};

function getMediaLabel(media) {
  return media.altText ?? media.publicId ?? `Imagen #${media.id}`;
}

function validateDeleteMediaArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.mediaId) ||
    value.mediaId < 1
  ) {
    return null;
  }

  return { mediaId: value.mediaId };
}

// El chequeo de uso se hace antes de la tarjeta: si la imagen ya está en
// alguna publicación no se ofrece borrarla, para no generar una tarjeta que
// el servidor rechazaría con MEDIA_IN_USE.
async function getMediaDeletionRejectionMessage({
  target,
}) {
  const count =
    await mediaRepository.countMediaReferences(
      target.id
    );

  if (count > 0) {
    return `La imagen se usa en ${count} ${
      count === 1 ? "publicación" : "publicaciones"
    }: desvinculala primero para poder borrarla de la galería.`;
  }

  return null;
}

const deleteMedia = {
  name: "delete_media",
  mode: "write",
  targetType: "media",
  description:
    "Prepara el borrado de una imagen de la galería para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      mediaId: { type: "integer" },
    },
    required: ["mediaId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: validateDeleteMediaArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.mediaId,
  getTargetById: (mediaId) =>
    mediaService.getMediaById(mediaId),
  getTargetLabel: (media) => getMediaLabel(media),
  getSnapshot: (media) => ({
    altText: media.altText,
    isActive: media.isActive,
    updatedAt: toIsoString(media.updatedAt),
  }),
  createSummary: ({ target }) =>
    `Borrar la imagen «${getMediaLabel(target)}» de la galería`,
  getChanges: () => [],
  getWarnings: ({ target }) => [
    `Se borrará la imagen «${getMediaLabel(target)}» de ImageKit y de la galería. No se puede deshacer.`,
  ],
  getProposalRejectionMessage:
    getMediaDeletionRejectionMessage,
  execute: ({ targetId }) =>
    mediaService.deleteMedia({ mediaId: targetId }),
  toResult: ({ target }) => ({
    target: {
      id: target.id,
      label: getMediaLabel(target),
    },
    deleted: true,
  }),
  toAssistantMessage: ({ result }) =>
    `La imagen «${result.target.label}» se borró de la galería.`,
};

function validateUserStatusArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.userId) ||
    value.userId < 1 ||
    typeof value.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    userId: value.userId,
    isActive: value.isActive,
  };
}

function validateUserRoleArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.userId) ||
    value.userId < 1 ||
    !USER_ROLE_VALUES.includes(value.role)
  ) {
    return null;
  }

  return {
    userId: value.userId,
    role: value.role,
  };
}

function validateRevokeUserSessionsArguments(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.userId) ||
    value.userId < 1
  ) {
    return null;
  }

  return { userId: value.userId };
}

function getUserSnapshot(user) {
  return {
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    updatedAt: toIsoString(user.updatedAt),
  };
}

const setUserActive = {
  name: "set_user_active",
  mode: "write",
  targetType: "user",
  description:
    "Prepara la activación o desactivación de un usuario para que un ADMIN la confirme.",
  parameters: {
    type: "object",
    properties: {
      userId: { type: "integer" },
      isActive: { type: "boolean" },
    },
    required: ["userId", "isActive"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN"],
  validateArguments: validateUserStatusArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.userId,
  getTargetById: (userId) =>
    userService.getUserById(userId),
  getTargetLabel: (user) => user.email,
  getSnapshot: getUserSnapshot,
  createSummary: ({ target, arguments: argumentsValue }) =>
    `${argumentsValue.isActive ? "Activar" : "Desactivar"} al usuario «${target.email}»`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "isActive",
      from: target.isActive,
      to: argumentsValue.isActive,
    },
  ],
  getWarnings: ({ target, arguments: argumentsValue }) =>
    target.isActive === argumentsValue.isActive
      ? ["El usuario ya está en ese estado."]
      : [],
  getProposalRejectionMessage: ({
    arguments: argumentsValue,
    currentUser,
  }) =>
    !argumentsValue.isActive &&
    argumentsValue.userId === currentUser.id
      ? "No podés desactivar tu propia cuenta."
      : null,
  execute: ({
    targetId,
    arguments: argumentsValue,
    actorId,
  }) =>
    userService.changeUserStatus({
      userId: targetId,
      isActive: argumentsValue.isActive,
      actorId,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.email,
    },
    isActive: domainResult.isActive,
  }),
  toAssistantMessage: ({ result }) =>
    `El usuario «${result.target.label}» ahora está ${
      result.isActive ? "activo" : "inactivo"
    }.`,
};

const changeUserRole = {
  name: "change_user_role",
  mode: "write",
  targetType: "user",
  description:
    "Prepara el cambio de rol de un usuario para que un ADMIN lo confirme.",
  parameters: {
    type: "object",
    properties: {
      userId: { type: "integer" },
      role: { type: "string", enum: USER_ROLE_VALUES },
    },
    required: ["userId", "role"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN"],
  validateArguments: validateUserRoleArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.userId,
  getTargetById: (userId) =>
    userService.getUserById(userId),
  getTargetLabel: (user) => user.email,
  getSnapshot: getUserSnapshot,
  createSummary: ({ target, arguments: argumentsValue }) =>
    `Cambiar el rol de «${target.email}» a ${argumentsValue.role}`,
  getChanges: ({ target, arguments: argumentsValue }) => [
    {
      field: "role",
      from: target.role,
      to: argumentsValue.role,
    },
  ],
  getWarnings: ({ target, arguments: argumentsValue }) =>
    target.role === argumentsValue.role
      ? ["El usuario ya tiene ese rol."]
      : [],
  execute: ({ targetId, arguments: argumentsValue }) =>
    userService.changeUserRole({
      userId: targetId,
      role: argumentsValue.role,
    }),
  toResult: ({ domainResult }) => ({
    target: {
      id: domainResult.id,
      label: domainResult.email,
    },
    role: domainResult.role,
  }),
  toAssistantMessage: ({ result }) =>
    `El rol del usuario «${result.target.label}» ahora es ${result.role}.`,
};

const revokeUserSessions = {
  name: "revoke_user_sessions",
  mode: "write",
  targetType: "user",
  description:
    "Prepara la revocación de todas las sesiones activas de un usuario para que un ADMIN la confirme.",
  parameters: {
    type: "object",
    properties: {
      userId: { type: "integer" },
    },
    required: ["userId"],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN"],
  validateArguments: validateRevokeUserSessionsArguments,
  getTargetId: (argumentsValue) =>
    argumentsValue.userId,
  getTargetById: (userId) =>
    userService.getUserById(userId),
  getTargetLabel: (user) => user.email,
  getSnapshot: getUserSnapshot,
  createSummary: ({ target }) =>
    `Revocar las sesiones activas de «${target.email}»`,
  getChanges: () => [],
  getWarnings: ({ target }) => [
    `Se cerrarán todas las sesiones activas de «${target.email}» y deberá volver a iniciar sesión.`,
  ],
  execute: ({ targetId }) =>
    userService.revokeUserSessions(targetId),
  toResult: ({ target, domainResult }) => ({
    target: {
      id: target.id,
      label: target.email,
    },
    revokedSessions: domainResult,
  }),
  toAssistantMessage: ({ result }) =>
    `Se revocaron ${result.revokedSessions} sesiones activas de «${result.target.label}».`,
};

function validateSettingsPatchArguments(
  value,
  allowedKeys
) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length === 0 ||
    Object.keys(value).some(
      (key) => !allowedKeys.includes(key)
    )
  ) {
    return null;
  }

  try {
    const parsed = parseUpdateSettingsBody(value);
    return isDeepStrictEqual(parsed, value) ? parsed : null;
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 400) {
      return null;
    }

    throw error;
  }
}

function buildSettingsChanges(target, argumentsValue, keys) {
  const changes = [];

  for (const key of keys) {
    if (
      Object.hasOwn(argumentsValue, key) &&
      target[key] !== argumentsValue[key]
    ) {
      changes.push({
        field: key,
        from: target[key],
        to: argumentsValue[key],
      });
    }
  }

  return changes;
}

function buildSettingsWarnings(target, argumentsValue, keys) {
  const changes = buildSettingsChanges(target, argumentsValue, keys);

  if (changes.length === 0) {
    return ["La configuración ya está en ese valor."];
  }

  return [];
}

const updateBusinessInfo = {
  name: "update_business_info",
  mode: "write",
  targetType: "settings",
  description:
    "Prepara la actualización del nombre del negocio, el lema y la historia para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      businessName: { type: "string" },
      tagline: { type: "string" },
      storyText: { type: "string" },
    },
    required: [],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: (value) =>
    validateSettingsPatchArguments(value, [
      "businessName",
      "tagline",
      "storyText",
    ]),
  getTargetId: () => 1,
  getTargetById: async () => ({
    id: 1,
    ...(await settingsService.getAdminSettings()),
  }),
  getTargetLabel: () => "Configuración del sitio",
  getSnapshot: (settings) => ({
    businessName: settings.businessName,
    tagline: settings.tagline,
    storyText: settings.storyText,
    updatedAt: settings.updatedAt,
  }),
  createSummary: () => "Actualizar la información del negocio",
  getChanges: ({ target, arguments: argumentsValue }) =>
    buildSettingsChanges(target, argumentsValue, [
      "businessName",
      "tagline",
      "storyText",
    ]),
  getWarnings: ({ target, arguments: argumentsValue }) =>
    buildSettingsWarnings(target, argumentsValue, [
      "businessName",
      "tagline",
      "storyText",
    ]),
  execute: ({ arguments: argumentsValue }) =>
    settingsService.updateSettings(argumentsValue),
  toResult: ({ domainResult }) => ({
    target: {
      id: 1,
      label: "Configuración del sitio",
    },
    updated: true,
    settings: domainResult,
  }),
  toAssistantMessage: () =>
    "La información del negocio se actualizó.",
};

const updateContactInfo = {
  name: "update_contact_info",
  mode: "write",
  targetType: "settings",
  description:
    "Prepara la actualización de WhatsApp, Facebook e Instagram para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      whatsappNumber: { type: "string" },
      facebookUrl: { type: "string" },
      instagramUrl: { type: "string" },
    },
    required: [],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: (value) =>
    validateSettingsPatchArguments(value, [
      "whatsappNumber",
      "facebookUrl",
      "instagramUrl",
    ]),
  getTargetId: () => 1,
  getTargetById: async () => ({
    id: 1,
    ...(await settingsService.getAdminSettings()),
  }),
  getTargetLabel: () => "Configuración del sitio",
  getSnapshot: (settings) => ({
    whatsappNumber: settings.whatsappNumber,
    facebookUrl: settings.facebookUrl,
    instagramUrl: settings.instagramUrl,
    updatedAt: settings.updatedAt,
  }),
  createSummary: () => "Actualizar la información de contacto",
  getChanges: ({ target, arguments: argumentsValue }) =>
    buildSettingsChanges(target, argumentsValue, [
      "whatsappNumber",
      "facebookUrl",
      "instagramUrl",
    ]),
  getWarnings: ({ target, arguments: argumentsValue }) =>
    buildSettingsWarnings(target, argumentsValue, [
      "whatsappNumber",
      "facebookUrl",
      "instagramUrl",
    ]),
  execute: ({ arguments: argumentsValue }) =>
    settingsService.updateSettings(argumentsValue),
  toResult: ({ domainResult }) => ({
    target: {
      id: 1,
      label: "Configuración del sitio",
    },
    updated: true,
    settings: domainResult,
  }),
  toAssistantMessage: () =>
    "La información de contacto se actualizó.",
};

const updateSchedule = {
  name: "update_schedule",
  mode: "write",
  targetType: "settings",
  description:
    "Prepara la actualización del horario general y del horario de fritanga para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      scheduleText: { type: "string" },
      scheduleColor: { type: "string" },
      fritangaScheduleText: { type: "string" },
      fritangaScheduleColor: { type: "string" },
    },
    required: [],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: (value) =>
    validateSettingsPatchArguments(value, [
      "scheduleText",
      "scheduleColor",
      "fritangaScheduleText",
      "fritangaScheduleColor",
    ]),
  getTargetId: () => 1,
  getTargetById: async () => ({
    id: 1,
    ...(await settingsService.getAdminSettings()),
  }),
  getTargetLabel: () => "Configuración del sitio",
  getSnapshot: (settings) => ({
    scheduleText: settings.scheduleText,
    scheduleColor: settings.scheduleColor,
    fritangaScheduleText: settings.fritangaScheduleText,
    fritangaScheduleColor: settings.fritangaScheduleColor,
    updatedAt: settings.updatedAt,
  }),
  createSummary: () => "Actualizar los horarios del sitio",
  getChanges: ({ target, arguments: argumentsValue }) =>
    buildSettingsChanges(target, argumentsValue, [
      "scheduleText",
      "scheduleColor",
      "fritangaScheduleText",
      "fritangaScheduleColor",
    ]),
  getWarnings: ({ target, arguments: argumentsValue }) =>
    buildSettingsWarnings(target, argumentsValue, [
      "scheduleText",
      "scheduleColor",
      "fritangaScheduleText",
      "fritangaScheduleColor",
    ]),
  execute: ({ arguments: argumentsValue }) =>
    settingsService.updateSettings(argumentsValue),
  toResult: ({ domainResult }) => ({
    target: {
      id: 1,
      label: "Configuración del sitio",
    },
    updated: true,
    settings: domainResult,
  }),
  toAssistantMessage: () =>
    "Los horarios del sitio se actualizaron.",
};

const updateLocation = {
  name: "update_location",
  mode: "write",
  targetType: "settings",
  description:
    "Prepara la actualización de la dirección y la ubicación del negocio para que el usuario la confirme.",
  parameters: {
    type: "object",
    properties: {
      address: { type: "string" },
      latitude: { type: "number" },
      longitude: { type: "number" },
    },
    required: [],
    additionalProperties: false,
  },
  allowedRoles: ["ADMIN", "EDITOR"],
  validateArguments: (value) =>
    validateSettingsPatchArguments(value, [
      "address",
      "latitude",
      "longitude",
    ]),
  getTargetId: () => 1,
  getTargetById: async () => ({
    id: 1,
    ...(await settingsService.getAdminSettings()),
  }),
  getTargetLabel: () => "Configuración del sitio",
  getSnapshot: (settings) => ({
    address: settings.address,
    latitude: settings.latitude,
    longitude: settings.longitude,
    updatedAt: settings.updatedAt,
  }),
  createSummary: () => "Actualizar la ubicación del negocio",
  getChanges: ({ target, arguments: argumentsValue }) =>
    buildSettingsChanges(target, argumentsValue, [
      "address",
      "latitude",
      "longitude",
    ]),
  getWarnings: ({ target, arguments: argumentsValue }) =>
    buildSettingsWarnings(target, argumentsValue, [
      "address",
      "latitude",
      "longitude",
    ]),
  execute: ({ arguments: argumentsValue }) =>
    settingsService.updateSettings(argumentsValue),
  toResult: ({ domainResult }) => ({
    target: {
      id: 1,
      label: "Configuración del sitio",
    },
    updated: true,
    settings: domainResult,
  }),
  toAssistantMessage: () =>
    "La ubicación del negocio se actualizó.",
};

module.exports = [
  setProductAvailability,
  setAnnouncementActive,
  setVideoActive,
  setCategoryActive,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct,
  moveProductsToCategory,
  setProductsAvailability,
  setProductsActive,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  notifyAnnouncement,
  createPhoto,
  updatePhoto,
  setPhotoActive,
  deletePhoto,
  deleteMedia,
  updateVideo,
  restoreVideoThumbnail,
  setUserActive,
  changeUserRole,
  revokeUserSessions,
  updateBusinessInfo,
  updateContactInfo,
  updateSchedule,
  updateLocation,
];
