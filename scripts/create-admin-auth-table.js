require("dotenv").config({
    path: ".env.local"
  });
  
  const { neon } =
    require("@neondatabase/serverless");
  
  async function createAdminAuthTable() {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not configured."
      );
    }
  
    const sql =
      neon(
        process.env.DATABASE_URL
      );
  
    console.log(
      "Creating admin_login_attempts table..."
    );
  
    await sql`
      CREATE TABLE IF NOT EXISTS admin_login_attempts (
        client_key TEXT PRIMARY KEY,
  
        failed_attempts INTEGER NOT NULL
          DEFAULT 0,
  
        locked_until TIMESTAMPTZ,
  
        updated_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW()
      );
    `;
  
    await sql`
      CREATE INDEX IF NOT EXISTS
        admin_login_attempts_locked_until_idx
      ON admin_login_attempts (
        locked_until
      );
    `;
  
    console.log(
      "admin_login_attempts table and index are ready."
    );
  }
  
  createAdminAuthTable()
    .catch(error => {
      console.error(
        "Unable to create admin auth table:",
        error
      );
  
      process.exit(1);
    });