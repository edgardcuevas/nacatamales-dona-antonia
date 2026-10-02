const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");


const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/user.routes");
const categoryRoutes = require(
  "./modules/categories/category.routes"
);
const categoryAdminRoutes = require(
  "./modules/categories/category.admin.routes"
);
const productRoutes = require(
  "./modules/products/product.routes"
);
const productAdminRoutes = require(
  "./modules/products/product.admin.routes"
);
const announcementRoutes = require(
  "./modules/announcements/announcement.routes"
);
const announcementAdminRoutes = require(
  "./modules/announcements/announcement.admin.routes"
);
const photoRoutes = require(
  "./modules/photos/photos.routes"
);
const photoAdminRoutes = require(
  "./modules/photos/photos.admin.routes"
);
const videoRoutes = require(
  "./modules/videos/video.routes"
);
const videoAdminRoutes = require(
  "./modules/videos/video.admin.routes"
);
const settingsRoutes = require(
  "./modules/settings/settings.routes"
);
const settingsAdminRoutes = require(
  "./modules/settings/settings.admin.routes"
);
const mediaAdminRoutes = require(
  "./modules/media/media.admin.routes"
);
const youtubeAdminRoutes = require(
  "./modules/youtube/youtube.admin.routes"
);
const youtubeOAuthRoutes = require(
  "./modules/youtube/youtube.oauth.routes"
);

const notFoundHandler = require("./middlewares/not-found.middleware");
const errorHandler = require("./middlewares/error.middleware");

const {
  successResponse,
  errorResponse,
} = require("./shared/http-response");

const env = require("./config/env");
const pool = require("./database/pool");

const app = express();

// The pool itself has no statement timeout, so a saturated queue would
// otherwise hang the probe. Racing the query guarantees the endpoint
// answers in bounded time and lets the orchestrator act on it.
function withTimeout(promise, timeoutMs) {
  let timeoutHandle;

  const timeout = new Promise((resolve, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new Error(
            `Readiness check exceeded ${timeoutMs}ms`
          )
        ),
      timeoutMs
    );
  });

  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timeoutHandle)
  );
}

app.disable("x-powered-by");

// Left unset when TRUST_PROXY is absent so request.ip keeps resolving
// to the socket address. Behind a reverse proxy it is set to the
// configured hop count so rate limiters see the real client IP
// instead of one shared proxy address.
if (env.trustProxy !== null) {
  app.set("trust proxy", env.trustProxy);
}

app.use(helmet());


app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/admin/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use(
  "/api/admin/categories",
  categoryAdminRoutes
);
app.use("/api/products", productRoutes);
app.use(
  "/api/admin/products",
  productAdminRoutes
);
app.use(
  "/api/announcements",
  announcementRoutes
);
app.use(
  "/api/admin/announcements",
  announcementAdminRoutes
);
app.use("/api/photos", photoRoutes);
app.use("/api/admin/photos", photoAdminRoutes);
app.use("/api/videos", videoRoutes);
app.use(
  "/api/admin/videos",
  videoAdminRoutes
);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin/settings", settingsAdminRoutes);
app.use(
  "/api/admin/media",
  mediaAdminRoutes
);
app.use(
  "/api/admin/youtube",
  youtubeAdminRoutes
);
app.use(
  "/api/youtube/oauth",
  youtubeOAuthRoutes
);

// Liveness: answers 200 whenever the process can serve HTTP. It never
// touches the database, so it stays useful while MySQL is down and it
// must not be used to decide whether the API can actually work.
app.get("/api/health", (request, response) => {
  return successResponse(
    response,
    200,
    {
      status: "UP",
    },
    "API is running"
  );
});

// Readiness: proves the database actually answers. A reverse proxy or
// orchestrator should send traffic here, not to /api/health, otherwise
// a process whose pool is exhausted or whose credentials stopped
// working keeps receiving requests it can never fulfil.
const READINESS_TIMEOUT_MS = 2_000;

app.get("/api/health/ready", async (request, response) => {
  try {
    await withTimeout(
      pool.execute("SELECT 1"),
      READINESS_TIMEOUT_MS
    );

    return successResponse(
      response,
      200,
      { status: "READY" },
      "API and database are ready"
    );
  } catch (error) {
    // The reason is operator-facing and stays in the log. The response
    // must never expose hostnames, credentials or driver messages.
    console.error(
      "Readiness check failed:",
      error?.message ?? "unknown reason"
    );

    return errorResponse(
      response,
      503,
      "SERVICE_UNAVAILABLE",
      "The database is not available"
    );
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;