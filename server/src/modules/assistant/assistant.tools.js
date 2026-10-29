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
const {
  MAX_ASSISTANT_ANNOUNCEMENT_RESULTS,
  MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS,
  MAX_ASSISTANT_VIDEO_RESULTS,
  MAX_ASSISTANT_VIDEO_SEARCH_RESULTS,
  MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS,
  MAX_ASSISTANT_PRODUCT_RESULTS,
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
  ]);

module.exports = assistantToolRegistry;
