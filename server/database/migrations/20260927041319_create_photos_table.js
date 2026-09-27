/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
	await knex.schema.createTable("photos", (table) => {
		table.bigIncrements("id").primary();

		table.string("caption", 500).nullable();

		table
			.bigInteger("image_media_id")
			.unsigned()
			.notNullable();

		table
			.boolean("is_active")
			.notNullable()
			.defaultTo(true);

		table
			.integer("sort_order")
			.unsigned()
			.notNullable()
			.defaultTo(0);

		table
			.timestamp("created_at")
			.notNullable()
			.defaultTo(knex.fn.now());

		table
			.timestamp("updated_at")
			.notNullable()
			.defaultTo(knex.fn.now());

		table
			.foreign("image_media_id", "fk_photos_image_media")
			.references("id")
			.inTable("media")
			.onUpdate("CASCADE")
			.onDelete("RESTRICT");

		table.index("is_active", "idx_photos_is_active");
		table.index("created_at", "idx_photos_created_at");
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
	await knex.schema.dropTableIfExists("photos");
};
