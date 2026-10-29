const productService = require(
  "../products/product.service"
);
const announcementService = require(
  "../announcements/announcement.service"
);
const videoService = require(
  "../videos/video.service"
);

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

module.exports = [
  setProductAvailability,
  setAnnouncementActive,
  setVideoActive,
];
