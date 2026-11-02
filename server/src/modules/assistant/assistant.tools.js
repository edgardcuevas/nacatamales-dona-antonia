const {
  createAssistantToolRegistry,
  AssistantToolError,
  TOOL_ERROR_CODES,
} = require("./assistant.tool-registry");
const settingsService = require(
  "../settings/settings.service"
);
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
const mediaService = require(
  "../media/media.service"
);
const mediaRepository = require(
  "../media/media.repository"
);
const photosService = require(
  "../photos/photos.service"
);
const {
  MAX_ASSISTANT_ANNOUNCEMENT_RESULTS,
  MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS,
  MAX_ASSISTANT_ANNOUNCEMENT_CONTENT_CHARS,
  MAX_ASSISTANT_VIDEO_RESULTS,
  MAX_ASSISTANT_VIDEO_SEARCH_RESULTS,
  MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS,
  MAX_ASSISTANT_CATEGORY_RESULTS,
  MAX_ASSISTANT_PRODUCT_RESULTS,
  MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS,
  MAX_ASSISTANT_PHOTO_RESULTS,
  MAX_ASSISTANT_MEDIA_SEARCH_RESULTS,
  MAX_ASSISTANT_MEDIA_LIST_RESULTS,
} = require("./assistant.constants");

const assistantToolRegistry =
  createAssistantToolRegistry([
    {
      name: "get_current_schedule",
      description:
        "Consulta los horarios públicos actuales del negocio.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async () => {
        const settings =
          await settingsService.getPublicSettings();

        return {
          scheduleText: settings.scheduleText,
          fritangaScheduleText:
            settings.fritangaScheduleText,
        };
      },
    },
    {
      name: "count_products",
      description:
        "Cuenta todos los productos registrados sin devolver sus datos.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async () => {
        const data =
          await productService.listAdministrativeProducts({
            page: 1,
            limit: 1,
            sortBy: "createdAt",
            sortOrder: "desc",
          });

        return {
          totalProducts: data.pagination.totalItems,
        };
      },
    },
    {
      name: "search_products",
      description:
        "Busca productos por nombre para identificar un producto existente.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ query }) => {
        const normalizedQuery = query.trim();

        if (
          normalizedQuery.length === 0 ||
          normalizedQuery.length > 120
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The product search query is invalid"
          );
        }

        const data =
          await productService.listAdministrativeProducts({
            page: 1,
            limit: MAX_ASSISTANT_PRODUCT_RESULTS,
            name: normalizedQuery,
            sortBy: "name",
            sortOrder: "asc",
          });

        return {
          products: data.products
            .slice(0, MAX_ASSISTANT_PRODUCT_RESULTS)
            .map((product) => ({
              id: product.id,
              name: product.name,
              price: product.price,
              category: product.category?.name ?? null,
              isActive: product.isActive,
              isAvailable: product.isAvailable,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_PRODUCT_RESULTS,
        };
      },
    },
    {
      name: "get_product_detail",
      description:
        "Devuelve el detalle completo de un producto por su ID.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "integer" },
        },
        required: ["productId"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ productId }) => {
        if (
          !Number.isSafeInteger(productId) ||
          productId < 1
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The product ID is invalid"
          );
        }

        const product =
          await productService.getProductById(productId);

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          price: product.price,
          category: product.category?.name ?? null,
          isAvailable: product.isAvailable,
          isActive: product.isActive,
          sortOrder: product.sortOrder,
          imageMediaId: product.imageMediaId,
        };
      },
    },
    {
      name: "count_products_by_category",
      description:
        "Cuenta cuántos productos tiene una categoría.",
      parameters: {
        type: "object",
        properties: {
          categoryId: { type: "integer" },
        },
        required: ["categoryId"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ categoryId }) => {
        if (
          !Number.isSafeInteger(categoryId) ||
          categoryId < 1
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The category ID is invalid"
          );
        }

        const category =
          await categoryService.getCategoryById(categoryId);
        const totalProducts =
          await categoryService.countProductsByCategory(
            categoryId
          );

        return {
          categoryId,
          categoryName: category.name,
          totalProducts,
        };
      },
    },
    {
      name: "list_products_by_category",
      description:
        "Lista los productos de una categoría con su estado, sin descripciones.",
      parameters: {
        type: "object",
        properties: {
          categoryId: { type: "integer" },
        },
        required: ["categoryId"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ categoryId }) => {
        if (
          !Number.isSafeInteger(categoryId) ||
          categoryId < 1
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The category ID is invalid"
          );
        }

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
          categoryId,
          categoryName: category.name,
          totalProducts: data.pagination.totalItems,
          products: data.products
            .slice(0, MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS)
            .map((product) => ({
              id: product.id,
              name: product.name,
              isActive: product.isActive,
              isAvailable: product.isAvailable,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS,
        };
      },
    },
    {
      name: "list_active_announcements",
      description:
        "Lista avisos publicados y vigentes en este momento.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async () => {
        const announcements =
          await announcementService.listPublicAnnouncements({
            limit:
              MAX_ASSISTANT_ANNOUNCEMENT_RESULTS + 1,
          });
        const truncated =
          announcements.length >
          MAX_ASSISTANT_ANNOUNCEMENT_RESULTS;

        return {
          announcements: announcements
            .slice(0, MAX_ASSISTANT_ANNOUNCEMENT_RESULTS)
            .map((announcement) => ({
              title: announcement.title,
              content: announcement.content,
              type: announcement.type,
              startsAt: announcement.startsAt,
              endsAt: announcement.endsAt,
            })),
          truncated,
        };
      },
    },
    {
      name: "search_announcements",
      description:
        "Busca avisos por título para identificar un aviso existente.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ query }) => {
        const normalizedQuery = query.trim();

        if (
          normalizedQuery.length === 0 ||
          normalizedQuery.length > 120
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The announcement search query is invalid"
          );
        }

        const data =
          await announcementService.listAdministrativeAnnouncements({
            page: 1,
            limit:
              MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS + 1,
            title: normalizedQuery,
            sortBy: "title",
            sortOrder: "asc",
          });

        return {
          announcements: data.announcements
            .slice(
              0,
              MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS
            )
            .map((announcement) => ({
              id: announcement.id,
              title: announcement.title,
              isActive: announcement.isActive,
              startsAt: announcement.startsAt,
              endsAt: announcement.endsAt,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS,
        };
      },
    },
    {
      name: "get_announcement_detail",
      description:
        "Devuelve el detalle de un aviso, incluido el mensaje completo, para editarlo o revisarlo.",
      parameters: {
        type: "object",
        properties: {
          announcementId: { type: "integer" },
        },
        required: ["announcementId"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ announcementId }) => {
        if (
          !Number.isSafeInteger(announcementId) ||
          announcementId < 1
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The announcement ID is invalid"
          );
        }

        const announcement =
          await announcementService.getAnnouncementById(
            announcementId
          );
        const contentTruncated =
          announcement.content.length >
          MAX_ASSISTANT_ANNOUNCEMENT_CONTENT_CHARS;

        return {
          id: announcement.id,
          title: announcement.title,
          content: contentTruncated
            ? announcement.content.slice(
                0,
                MAX_ASSISTANT_ANNOUNCEMENT_CONTENT_CHARS
              )
            : announcement.content,
          contentTruncated,
          type: announcement.type,
          isActive: announcement.isActive,
          startsAt: announcement.startsAt,
          endsAt: announcement.endsAt,
          sortOrder: announcement.sortOrder,
          imageMediaId: announcement.imageMediaId,
        };
      },
    },
    {
      name: "list_videos",
      description:
        "Lista videos ocultos del sitio, con su estado de carga y privacidad.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async () => {
        const data =
          await videoService.listAdministrativeVideos({
            page: 1,
            limit: MAX_ASSISTANT_VIDEO_RESULTS + 1,
            isActive: false,
            sortBy: "createdAt",
            sortOrder: "desc",
          });

        return {
          videos: data.videos
            .slice(0, MAX_ASSISTANT_VIDEO_RESULTS)
            .map((video) => ({
              title: video.title,
              description: video.description,
              uploadStatus: video.uploadStatus,
              privacyStatus: video.privacyStatus,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_VIDEO_RESULTS,
        };
      },
    },
    {
      name: "search_videos",
      description:
        "Busca videos por título para identificar un video existente y su estado.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ query }) => {
        const normalizedQuery = query.trim();

        if (
          normalizedQuery.length === 0 ||
          normalizedQuery.length > 120
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The video search query is invalid"
          );
        }

        const data =
          await videoService.listAdministrativeVideos({
            page: 1,
            limit: MAX_ASSISTANT_VIDEO_SEARCH_RESULTS + 1,
            title: normalizedQuery,
            sortBy: "title",
            sortOrder: "asc",
          });

        return {
          videos: data.videos
            .slice(0, MAX_ASSISTANT_VIDEO_SEARCH_RESULTS)
            .map((video) => ({
              id: video.id,
              title: video.title,
              isActive: video.isActive,
              uploadStatus: video.uploadStatus,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_VIDEO_SEARCH_RESULTS,
        };
      },
    },
    {
      name: "search_categories",
      description:
        "Busca categorías por nombre para identificar una categoría existente.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ query }) => {
        const normalizedQuery = query.trim();

        if (
          normalizedQuery.length === 0 ||
          normalizedQuery.length > 120
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The category search query is invalid"
          );
        }

        const data =
          await categoryService.listAdministrativeCategories({
            page: 1,
            limit:
              MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS + 1,
            name: normalizedQuery,
            sortBy: "name",
            sortOrder: "asc",
          });

        return {
          categories: data.categories
            .slice(0, MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS)
            .map((category) => ({
              id: category.id,
              name: category.name,
              isActive: category.isActive,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS,
        };
      },
    },
    {
      name: "list_categories",
      description:
        "Lista todas las categorías con su orden y visibilidad.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async () => {
        const data =
          await categoryService.listAdministrativeCategories({
            page: 1,
            limit: MAX_ASSISTANT_CATEGORY_RESULTS + 1,
            sortBy: "sortOrder",
            sortOrder: "asc",
          });

        return {
          categories: data.categories
            .slice(0, MAX_ASSISTANT_CATEGORY_RESULTS)
            .map((category) => ({
              id: category.id,
              name: category.name,
              sortOrder: category.sortOrder,
              isActive: category.isActive,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_CATEGORY_RESULTS,
        };
      },
    },
    {
      name: "list_photos",
      description:
        "Lista las fotos de Día a día con su visibilidad y la imagen de la galería que usan.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async () => {
        const data =
          await photosService.listAdministrativePhotos({
            page: 1,
            limit: MAX_ASSISTANT_PHOTO_RESULTS + 1,
            sortBy: "createdAt",
            sortOrder: "desc",
          });

        return {
          photos: data.photos
            .slice(0, MAX_ASSISTANT_PHOTO_RESULTS)
            .map((photo) => ({
              id: photo.id,
              caption: photo.caption,
              isActive: photo.isActive,
              sortOrder: photo.sortOrder,
              imageMediaId: photo.image.id,
              imageAltText: photo.image.altText,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_PHOTO_RESULTS,
        };
      },
    },
    {
      name: "search_media",
      description:
        "Busca imágenes de la galería por texto alternativo o nombre de archivo para elegir una imagen existente.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async ({ query }) => {
        const normalizedQuery = query.trim();

        if (
          normalizedQuery.length === 0 ||
          normalizedQuery.length > 120
        ) {
          throw new AssistantToolError(
            TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
            "The media search query is invalid"
          );
        }

        const data = await mediaService.listMedia({
          page: 1,
          limit: MAX_ASSISTANT_MEDIA_SEARCH_RESULTS + 1,
          isActive: true,
          resourceType: "IMAGE",
          search: normalizedQuery,
          sortBy: "createdAt",
          sortOrder: "desc",
        });

        return {
          media: data.media
            .slice(0, MAX_ASSISTANT_MEDIA_SEARCH_RESULTS)
            .map((media) => ({
              id: media.id,
              altText: media.altText,
              publicId: media.publicId,
              width: media.width,
              height: media.height,
            })),
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_MEDIA_SEARCH_RESULTS,
        };
      },
    },
    {
      name: "list_media",
      description:
        "Lista las imágenes de la galería con su visibilidad y cuántas publicaciones las usan.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      allowedRoles: ["ADMIN", "EDITOR"],
      mode: "read",
      handler: async () => {
        const data = await mediaService.listMedia({
          page: 1,
          limit: MAX_ASSISTANT_MEDIA_LIST_RESULTS + 1,
          sortBy: "createdAt",
          sortOrder: "desc",
        });

        const media = await Promise.all(
          data.media
            .slice(0, MAX_ASSISTANT_MEDIA_LIST_RESULTS)
            .map(async (item) => ({
              id: item.id,
              altText: item.altText,
              publicId: item.publicId,
              isActive: item.isActive,
              resourceType: item.resourceType,
              width: item.width,
              height: item.height,
              usageCount: await mediaRepository.countMediaReferences(
                item.id
              ),
            }))
        );

        return {
          media,
          truncated:
            data.pagination.totalItems >
            MAX_ASSISTANT_MEDIA_LIST_RESULTS,
        };
      },
    },
  ]);

module.exports = assistantToolRegistry;
