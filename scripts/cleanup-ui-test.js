import { pool } from "../src/db/index.js";

try {
  const [result] = await pool.execute(
    "DELETE FROM reminders WHERE group_name = ? AND message = ?",
    ["[UI TEST GROUP]", "[TEST] UI lifecycle check."]
  );
  console.log(`Removed ${result.affectedRows} UI test reminder record(s).`);
} finally {
  await pool.end();
}

