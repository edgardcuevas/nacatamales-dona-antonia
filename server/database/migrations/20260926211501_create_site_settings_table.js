/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
	await knex.schema.createTable("site_settings", (table) => {
		table.specificType("id", "TINYINT UNSIGNED").primary();

		table.string("business_name", 150).notNullable();
		table.string("tagline", 255).nullable();
		table.string("whatsapp_number", 20).notNullable();
		table.string("facebook_url", 500).nullable();
		table.string("instagram_url", 500).nullable();
		table.string("address", 255).nullable();
		table.decimal("latitude", 10, 7).nullable();
		table.decimal("longitude", 10, 7).nullable();
		table.string("schedule_text", 255).nullable();
		table
			.timestamp("updated_at")
			.notNullable()
			.defaultTo(knex.fn.now());
	});

	await knex("site_settings").insert({
		id: 1,
		business_name: "Nacatamales de Doña Antonia",
		whatsapp_number: "50575303356",
		tagline: null,
		facebook_url: null,
		instagram_url: null,
		address: null,
		latitude: null,
		longitude: null,
		schedule_text: null,
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
	await knex.schema.dropTableIfExists("site_settings");
};
