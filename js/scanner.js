document.addEventListener("DOMContentLoaded", () => {

  const form =
    document.getElementById("scannerForm");

  const urlInput =
    document.getElementById("websiteUrl");

  const scanButton =
    document.getElementById("scanButton");

  const scanButtonText =
    document.getElementById("scanButtonText");

  const scanSpinner =
    document.getElementById("scanSpinner");

  const errorBox =
    document.getElementById("scannerError");

  const results =
    document.getElementById("results");

  const newScanButton =
    document.getElementById("newScanButton");

  const reportAction =
    document.getElementById("reportAction");

  const downloadQuickReportButton =
    document.getElementById("downloadQuickReportButton");

  const downloadQuickReportText =
    document.getElementById("downloadQuickReportText");

  const downloadQuickReportSpinner =
    document.getElementById("downloadQuickReportSpinner");

  const requestHealthReportButton =
    document.getElementById(
        "requestHealthReportButton"
    );

  const healthReportConfirmModal =
    document.getElementById(
        "healthReportConfirmModal"
    );

  const confirmHealthReportButton =
    document.getElementById(
        "confirmHealthReportButton"
    );

  const cancelHealthReportButton =
    document.getElementById(
        "cancelHealthReportButton"
    );

    const adminReportSection =
    document.getElementById(
      "adminReportSection"
    );

    const adminHealthReportButton =
    document.getElementById(
      "adminHealthReportButton"
    );

    const adminHealthReportModal =
    document.getElementById(
      "adminHealthReportModal"
    );

    const adminHealthReportPassword =
    document.getElementById(
      "adminHealthReportPassword"
    );

    const adminHealthReportError =
    document.getElementById(
      "adminHealthReportError"
    );

    const confirmAdminHealthReportButton =
    document.getElementById(
      "confirmAdminHealthReportButton"
    );

    const cancelAdminHealthReportButton =
    document.getElementById(
      "cancelAdminHealthReportButton"
    );

    const adminScanHistoryButton =
  document.getElementById(
    "adminScanHistoryButton"
  );

const scanHistoryModal =
  document.getElementById(
    "scanHistoryModal"
  );

const scanHistoryPassword =
  document.getElementById(
    "scanHistoryPassword"
  );

const scanHistoryWebsite =
  document.getElementById(
    "scanHistoryWebsite"
  );

const scanHistoryError =
  document.getElementById(
    "scanHistoryError"
  );

const scanHistoryLoading =
  document.getElementById(
    "scanHistoryLoading"
  );

const scanHistoryResults =
  document.getElementById(
    "scanHistoryResults"
  );

const loadScanHistoryButton =
  document.getElementById(
    "loadScanHistoryButton"
  );

const cancelScanHistoryButton =
  document.getElementById(
    "cancelScanHistoryButton"
  );

  let latestScanData = null;

  function mergeBrowserBusinessEvidence(
    scanData
  ) {
    if (
      !scanData ||
      !scanData.browserInspection ||
      !scanData.browserInspection.available
    ) {
      return scanData;
    }

        /*
     * --------------------------------------------------------
     * BROWSER RENDERED ROUTE HEALTH
     * --------------------------------------------------------
     *
     * Browser inspection can discover internal routes that
     * the server-side crawler cannot see because they are
     * rendered by JavaScript.
     *
     * Reuse the route results already produced by the
     * browser inspection. Do not run another crawler here.
     */

        const serverRouteResults =
        Array.isArray(
          scanData.routeHealth?.routes
        )
          ? scanData.routeHealth.routes
          : [];

      const browserRouteResults =
        Array.isArray(
          scanData.browserInspection
            .routeHealth
        )
          ? scanData.browserInspection
              .routeHealth
          : [];

      /*
       * Preserve server-side route evidence and add
       * browser-rendered routes that the server crawler
       * could not discover. Browser results take precedence
       * when the same URL was tested by both.
       */
      const routeMap =
        new Map();

      serverRouteResults.forEach(
        route => {
          if (route?.url) {
            routeMap.set(
              route.url,
              route
            );
          }
        }
      );

      browserRouteResults.forEach(
        route => {
          if (route?.url) {
            routeMap.set(
              route.url,
              route
            );
          }
        }
      );

      const mergedRouteResults =
        Array.from(
          routeMap.values()
        );

      const routeHealthSummary = {
        tested:
          mergedRouteResults.length,

        working:
          mergedRouteResults.filter(
            route =>
              route.status ===
              "working"
          ).length,

        redirected:
          mergedRouteResults.filter(
            route =>
              route.status ===
              "redirected"
          ).length,

        broken:
          mergedRouteResults.filter(
            route =>
              route.status ===
              "broken"
          ).length,

        blocked:
          mergedRouteResults.filter(
            route =>
              route.status ===
              "blocked"
          ).length,

        unreachable:
          mergedRouteResults.filter(
            route =>
              route.status ===
              "unreachable"
          ).length,

        failed:
          mergedRouteResults.filter(
            route =>
              route.status ===
                "broken" ||
              route.status ===
                "unreachable"
          ).length,

        routes:
          mergedRouteResults
      };

      const mergedScanData = {
        ...scanData,
        routeHealth:
          routeHealthSummary,
        browserInspection: {
          ...scanData.browserInspection,
          routeHealth:
            mergedRouteResults
        }
      };

      /*
       * Add one concise route reliability issue.
       *
       * Remove any previous browser-generated route issue
       * first so repeated merges cannot create duplicates.
       */


