const productService = require(
  "../products/product.service"
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
    throw new Error("Invalid product update timestamp");
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

module.exports = [setProductAvailability];
