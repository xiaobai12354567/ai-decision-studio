import "dotenv/config";
import pg from "pg";

// Verify authentication and transactional persistence without leaving test records.
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  const result = await client.query("SELECT current_database() AS database, version() AS version");
  console.log(`Connected to ${result.rows[0].database}: ${result.rows[0].version.split(",")[0]}`);
  await client.query("BEGIN");
  await client.query("CREATE TEMP TABLE connection_check (value text NOT NULL)");
  await client.query("INSERT INTO connection_check(value) VALUES ($1)", ["决策数据库读写验证"]);
  const saved = await client.query("SELECT value FROM connection_check");
  if (saved.rows[0]?.value !== "决策数据库读写验证") throw new Error("Read/write mismatch");
  await client.query("ROLLBACK");
  console.log(
    "Authenticated SQL read/write and Unicode round-trip passed; transaction rolled back.",
  );
} catch (error) {
  // Do not print connection strings or credentials.
  console.error("Database verification failed:", error.code || error.name);
  process.exitCode = 1;
} finally {
  await client.end();
}
