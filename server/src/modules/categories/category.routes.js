const express = require("express");

const {
  listPublicCategoriesController,
  getPublicCategoryController,
} = require("./category.controller");

const {
  validatePublicCategorySlug,
} = require("./category.validator");

const router = express.Router();

router.get(
  "/",
  listPublicCategoriesController
);
router.get(
  "/:slug",
  validatePublicCategorySlug,
  getPublicCategoryController
);

module.exports = router;
