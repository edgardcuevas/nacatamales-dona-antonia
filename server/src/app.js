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
const videoRoutes = require(
  "./modules/videos/video.routes"
);
const videoAdminRoutes = require(
  "./modules/videos/video.admin.routes"
);
const mediaAdminRoutes = require(
  "./modules/media/media.admin.routes"
);

const notFoundHandler = require("./middlewares/not-found.middleware");
const errorHandler = require("./middlewares/error.middleware");

const {
  successResponse,
} = require("./shared/http-response");

const app = express();

app.disable("x-powered-by");
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
app.use("/api/videos", videoRoutes);
app.use(
  "/api/admin/videos",
  videoAdminRoutes
);
app.use(
  "/api/admin/media",
  mediaAdminRoutes
);

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

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;