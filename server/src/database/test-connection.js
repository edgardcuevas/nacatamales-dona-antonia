const pool = require("./pool");

async function testDatabaseConnection() {
  try {
    const connection = await pool.getConnection();

    await connection.ping();
    connection.release();

    console.log("MySQL connection verified successfully.");
  } catch (error) {
    console.error("Unable to connect to MySQL.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testDatabaseConnection();