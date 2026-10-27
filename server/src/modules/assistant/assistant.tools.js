const {
  createAssistantToolRegistry,
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
const {
  MAX_ASSISTANT_ANNOUNCEMENT_RESULTS,
  MAX_ASSISTANT_VIDEO_RESULTS,
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
  ]);

module.exports = assistantToolRegistry;
