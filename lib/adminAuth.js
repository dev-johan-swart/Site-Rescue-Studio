const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function getClientAddress(req) {
  const forwarded =
    req.headers?.["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded)
      .split(",")[0]
      .trim();
  }

  return String(
    req.headers?.["x-real-ip"] ||
    "unknown"
  ).trim();
}

function getClientKey(req) {
  const address =
    getClientAddress(req);

  const salt =
    String(
      process.env.ADMIN_AUTH_SALT ||
      process.env.HEALTH_REPORT_ADMIN_PASSWORD ||
      "site-rescue-studio-admin"
    );

  return crypto
    .createHash("sha256")
    .update(`${salt}:${address}`)
    .digest("hex");
}

async function authenticateAdmin(req, suppliedPassword) {
  const adminPassword =
    String(
      process.env
        .HEALTH_REPORT_ADMIN_PASSWORD ||
      ""
    );

  if (!adminPassword) {
    return {
      ok: false,
      status: 500,
      error:
        "The admin report service is not configured."
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      status: 500,
      error:
        "The admin security service is not configured."
    };
  }

  const sql =
    neon(
      process.env.DATABASE_URL
    );

  const clientKey =
    getClientKey(req);

  const rows =
    await sql`
      SELECT
        failed_attempts,
        locked_until
      FROM admin_login_attempts
      WHERE client_key = ${clientKey}
      LIMIT 1;
    `;

  const record =
    rows[0] || null;

  if (
    record?.locked_until &&
    new Date(record.locked_until).getTime() >
      Date.now()
  ) {
    const remainingMinutes =
      Math.max(
        1,
        Math.ceil(
          (
            new Date(
              record.locked_until
            ).getTime() -
            Date.now()
          ) /
          60000
        )
      );

    return {
      ok: false,
      status: 429,
      error:
        `Too many incorrect attempts. Please try again in ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}.`
    };
  }

  const supplied =
    String(
      suppliedPassword || ""
    );

  if (
    supplied !==
    adminPassword
  ) {
    const failedAttempts =
      Number(
        record?.failed_attempts || 0
      ) + 1;

    if (
      failedAttempts >=
      MAX_FAILED_ATTEMPTS
    ) {
      await sql`
        INSERT INTO admin_login_attempts (
          client_key,
          failed_attempts,
          locked_until,
          updated_at
        )
        VALUES (
          ${clientKey},
          ${failedAttempts},
          NOW() + (${LOCKOUT_MINUTES} * INTERVAL '1 minute'),
          NOW()
        )
        ON CONFLICT (client_key)
        DO UPDATE SET
          failed_attempts =
            EXCLUDED.failed_attempts,
          locked_until =
            EXCLUDED.locked_until,
          updated_at =
            NOW();
      `;

      return {
        ok: false,
        status: 429,
        error:
          "Too many incorrect attempts. Admin access is temporarily locked."
      };
    }

    await sql`
      INSERT INTO admin_login_attempts (
        client_key,
        failed_attempts,
        locked_until,
        updated_at
      )
      VALUES (
        ${clientKey},
        ${failedAttempts},
        NULL,
        NOW()
      )
      ON CONFLICT (client_key)
      DO UPDATE SET
        failed_attempts =
          EXCLUDED.failed_attempts,
        locked_until =
          NULL,
        updated_at =
          NOW();
    `;

    return {
      ok: false,
      status: 401,
      error:
        "Incorrect admin password."
    };
  }

  await sql`
    DELETE FROM admin_login_attempts
    WHERE client_key = ${clientKey};
  `;

  return {
    ok: true
  };
}

module.exports = {
  authenticateAdmin
};