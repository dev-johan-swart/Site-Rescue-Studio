const reportHandler =
  require("../api/report");

/*
 * ============================================================
 * SITE RESCUE STUDIO
 * SHARED REPORT GENERATOR
 * ============================================================
 *
 * This adapter lets other server-side functions reuse the
 * existing full report generator without duplicating the
 * 6,000+ line report implementation.
 *
 * It provides:
 *
 *   generateFullReport(data)
 *
 * The existing api/report.js remains the source of truth
 * for the detailed report layout.
 * ============================================================
 */

function createMockResponse() {
  let body = null;

  const response = {
    statusCode: 200,
    headers: {},

    status(code) {
      this.statusCode = code;
      return this;
    },

    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },

    json(payload) {
      body = payload;
      this.body = payload;
      return this;
    },

    send(payload) {
      body = payload;
      this.body = payload;
      return this;
    },

    end(payload) {
      if (payload !== undefined) {
        body = payload;
        this.body = payload;
      }

      this.finished = true;

      return this;
    }
  };

  Object.defineProperty(response, "capturedBody", {
    get() {
      return body;
    }
  });

  return response;
}



function sanitizeReportData(data) {
  const reportData = {
    ...data,
    metadata: {
      ...(data.metadata || {})
    }
  };

  /*
   * PDFKit expects display values to be strings/numbers/booleans.
   * Some scanner versions store structured data as an object.
   * Normalize that field before the shared PDF renderer receives it.
   * The SEO check remains the authoritative source when available.
   */
  const structuredCheck =
    Array.isArray(reportData.checks?.seo)
      ? reportData.checks.seo.find(check => {
          const title = String(
            check?.title ||
            check?.name ||
            check?.label ||
            ""
          ).toLowerCase();

          return (
            title.includes("structured data") ||
            title.includes("schema")
          );
        })
      : null;

  const structuredStatus = String(
    structuredCheck?.status || ""
  ).toLowerCase();

  if (
    structuredCheck &&
    structuredStatus !== "pass"
  ) {
    reportData.metadata.structuredData =
      String(
        structuredCheck.description ||
        structuredCheck.details ||
        structuredCheck.value ||
        "Not detected"
      );
  } else if (
    reportData.metadata.structuredData &&
    typeof reportData.metadata.structuredData === "object"
  ) {
    const value = reportData.metadata.structuredData;

    if (Array.isArray(value.types)) {
      reportData.metadata.structuredData = value.types.join(", ");
    } else if (Array.isArray(value.schemaTypes)) {
      reportData.metadata.structuredData = value.schemaTypes.join(", ");
    } else if (Array.isArray(value.schemas)) {
      reportData.metadata.structuredData = value.schemas.join(", ");
    } else if (value.type) {
      reportData.metadata.structuredData = String(value.type);
    } else {
      reportData.metadata.structuredData = "Detected";
    }
  }

  return reportData;
}

async function generateFullReport(data) {
  if (!data || typeof data !== "object") {
    throw new Error(
      "No report data was provided."
    );
  }

  const response =
    createMockResponse();

  await reportHandler(
    {
      method: "POST",
      body: sanitizeReportData(data)
    },
    response
  );

  if (
    response.statusCode < 200 ||
    response.statusCode >= 300
  ) {
    const message =
      response.capturedBody?.error ||
      "Unable to generate the Website Health Report.";

    throw new Error(message);
  }

  if (
    !Buffer.isBuffer(
      response.capturedBody
    )
  ) {
    throw new Error(
      "The Website Health Report generator did not return a PDF."
    );
  }

  if (
    response.capturedBody.length === 0
  ) {
    throw new Error(
      "The generated Website Health Report was empty."
    );
  }

  return response.capturedBody;
}

module.exports = {
  generateFullReport
};