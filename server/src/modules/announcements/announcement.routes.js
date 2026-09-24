const express = require("express");

const {
  listPublicAnnouncementsController,
} = require("./announcement.controller");

const {
  validatePublicAnnouncementListQuery,
} = require("./announcement.validator");

const router = express.Router();

router.get(
  "/",
  validatePublicAnnouncementListQuery,
  listPublicAnnouncementsController
);

module.exports = router;
