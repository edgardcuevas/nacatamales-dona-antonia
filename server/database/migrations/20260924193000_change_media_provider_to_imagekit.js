async function assertMediaIsEmpty(knex) {
  const result = await knex("media").count({ count: "*" });
  const count = Number(result[0]?.count ?? 0);

  if (count !== 0) {
    throw new Error(
      "The media provider migration requires an empty media table"
    );
  }
}

exports.up = async function (knex) {
  await assertMediaIsEmpty(knex);

  // Knex's MySQL alterTable().enum() emits ADD COLUMN, so the controlled
  // migration uses MODIFY COLUMN to change the existing provider enum.
  await knex.raw(
    "ALTER TABLE `media` MODIFY COLUMN `provider` ENUM('IMAGEKIT') NOT NULL DEFAULT 'IMAGEKIT'"
  );
};

exports.down = async function (knex) {
  await assertMediaIsEmpty(knex);

  await knex.raw(
    "ALTER TABLE `media` MODIFY COLUMN `provider` ENUM('CLOUDINARY') NOT NULL DEFAULT 'CLOUDINARY'"
  );
};
