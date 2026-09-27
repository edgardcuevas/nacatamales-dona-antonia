/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
	await knex.raw(
		"ALTER TABLE site_settings ADD COLUMN schedule_color ENUM('ROJO','AMARILLO','VERDE','CAFE') NOT NULL DEFAULT 'AMARILLO' AFTER schedule_text, ADD COLUMN fritanga_schedule_text VARCHAR(255) NULL AFTER schedule_color, ADD COLUMN fritanga_schedule_color ENUM('ROJO','AMARILLO','VERDE','CAFE') NOT NULL DEFAULT 'ROJO' AFTER fritanga_schedule_text;"
	);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
	await knex.raw(
		"ALTER TABLE site_settings DROP COLUMN fritanga_schedule_color, DROP COLUMN fritanga_schedule_text, DROP COLUMN schedule_color;"
	);
};
