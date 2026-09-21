const express = require("express");
const helmet = require("helmet");


const authRoutes = require("./modules/auth/auth.routes");

const notFoundHandler = require("./middlewares/not-found.middleware");
const errorHandler = require("./middlewares/error.middleware");

const {
  successResponse,
} = require("./shared/http-response");

const app = express();

app.disable("x-powered-by");
app.use(helmet());


app.use(express.json({ limit: "100kb" }));

app.use("/api/auth", authRoutes);

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