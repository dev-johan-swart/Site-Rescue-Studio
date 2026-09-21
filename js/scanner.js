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

      const routeMap = new Map();

      serverRouteResults.forEach(route => {
        if (route?.url) {
          routeMap.set(route.url, route);
        }
      });

      browserRouteResults.forEach(route => {
        if (route?.url) {
          routeMap.set(route.url, route);
        }
      });

      const mergedRouteResults =
        Array.from(routeMap.values());

      const routeHealthSummary = {
        tested: mergedRouteResults.length,
        working: mergedRouteResults.filter(route => route.status === "working").length,
        redirected: mergedRouteResults.filter(route => route.status === "redirected").length,
        broken: mergedRouteResults.filter(route => route.status === "broken").length,
        blocked: mergedRouteResults.filter(route => route.status === "blocked").length,
        unreachable: mergedRouteResults.filter(route => route.status === "unreachable").length,
        failed: mergedRouteResults.filter(
          route =>
            route.status === "broken" ||
            route.status === "unreachable"
        ).length,
        reliabilityScore:
          Number.isFinite(
            Number(
              scanData.routeHealth?.reliabilityScore
            )
          )
            ? Number(
                scanData.routeHealth.reliabilityScore
              )
            : null,
        routes: mergedRouteResults
      };

      const mergedScanData = {
        ...scanData,
        routeHealth:
          routeHealthSummary,

        scores: {
          ...(scanData.scores || {}),
          routeReliability:
            routeHealthSummary.reliabilityScore
        }
      };

      /*
       * Add one concise route reliability issue.
       *
       * Remove any previous browser-generated route issue
       * first so repeated merges cannot create duplicates.
       */

      const existingIssues =
        Array.isArray(
          mergedScanData.issues
        )
          ? mergedScanData.issues
          : [];

      const routeIssueId =
        "website-route-reliability";

      const issuesWithoutRouteIssue =
        existingIssues.filter(
          issue =>
            issue?.id !==
            routeIssueId
        );

      if (
        routeHealthSummary.failed >
        0
      ) {
        issuesWithoutRouteIssue.push({
          id:
            routeIssueId,

          category:
            "Technical",

          title:
            "Website reliability issue",

          description:
            "One or more discovered internal website routes returned an unsuccessful response when requested directly. The affected routes and response evidence are included in the detailed report.",

          status:
            "warning",

          severity:
            "medium"
        });
      }

      if (
        routeHealthSummary.redirected >
        0
      ) {
        issuesWithoutRouteIssue.push({
          id:
            "website-internal-redirects",

          category:
            "Technical",

          title:
            "Internal route redirects detected",

          description:
            "One or more discovered internal website routes redirect to another URL when requested directly. The affected routes and redirect destinations are included in the detailed report.",

          status:
            "warning",

          severity:
            "low"
        });
      }

      mergedScanData.issues =
        issuesWithoutRouteIssue;

      const renderedLinks =
        Array.isArray(
          mergedScanData.browserInspection
            .renderedContactLinks
        )
          ? mergedScanData.browserInspection
              .renderedContactLinks
          : [];

      const renderedH1Count =
        Number(
          scanData.browserInspection
            ?.renderedH1Count
        );

      if (
        Number.isFinite(
          renderedH1Count
        )
      ) {
        const seoChecks =
          Array.isArray(
            scanData.checks?.seo
          )
            ? scanData.checks.seo
            : [];

        const h1Check =
          seoChecks.find(
            check =>
              check &&
              check.title ===
                "Missing H1"
          );

        if (
          h1Check
        ) {
          if (
            renderedH1Count ===
            1
          ) {
            h1Check.status =
              "pass";
            h1Check.passed =
              true;
            h1Check.severity =
              "info";
            h1Check.description =
              "A visible H1 heading was detected in the rendered page.";
          } else if (
            renderedH1Count >
            1
          ) {
            h1Check.status =
              "warning";
            h1Check.passed =
              false;
            h1Check.severity =
              "medium";
            h1Check.description =
              "Multiple H1 headings were detected in the rendered page. Consider using one clear primary H1 heading.";
          }
        }
      }

    const existingEvidence =
      mergedScanData.businessEvidence &&
      typeof mergedScanData.businessEvidence ===
        "object"
        ? mergedScanData.businessEvidence
        : {};

    const phoneLinks =
      renderedLinks.filter(
        link =>
          link &&
          link.type === "phone"
      );

    const emailLinks =
      renderedLinks.filter(
        link =>
          link &&
          link.type === "email"
      );

    const whatsappLinks =
      renderedLinks.filter(
        link =>
          link &&
          link.type === "whatsapp"
      );

    const browserPhoneEvidence =
      phoneLinks.map(link => ({
        source: "browser-rendered",
        href: link.href || "",
        text: link.text || "",
        type: "phone"
      }));

    const browserEmailEvidence =
      emailLinks.map(link => ({
        source: "browser-rendered",
        href: link.href || "",
        text: link.text || "",
        type: "email"
      }));

    const browserWhatsAppEvidence =
      whatsappLinks.map(link => ({
        source: "browser-rendered",
        href: link.href || "",
        text: link.text || "",
        type: "whatsapp"
      }));

      const browserCtaEvidence =
        renderedLinks
          .filter(
            link =>
              link &&
              link.type === "contact"
          )
          .map(link => ({
            source: "browser-rendered",
            href: link.href || "",
            text: link.text || "",
            type: "cta"
          }));

    const renderedForms = Array.isArray(mergedScanData.browserInspection?.renderedForms)
      ? mergedScanData.browserInspection.renderedForms
      : [];

    /*
     * Browser-rendered forms can exist on an important
     * conversion page even when the homepage HTML contains
     * no <form> element. Keep the mobile form check aligned
     * with the same rendered evidence without treating a
     * form as a contact form automatically.
     */
    const browserFormControls =
      renderedForms.flatMap(
        form =>
          Array.isArray(form?.fieldTypes)
            ? form.fieldTypes
            : []
      );

    const hasBrowserForms =
      renderedForms.length > 0;

    const hasUsefulBrowserInputTypes =
      browserFormControls.some(
        type =>
          /^(email|tel|number|url|search)$/i.test(
            String(type || "")
          )
      );

    const mobileInputCheck =
      Array.isArray(mergedScanData.checks?.mobile)
        ? mergedScanData.checks.mobile.find(
            check =>
              check &&
              check.title === "Mobile-friendly input types"
          )
        : null;

    if (mobileInputCheck && hasBrowserForms) {
      mobileInputCheck.status =
        hasUsefulBrowserInputTypes
          ? "pass"
          : "warning";

      mobileInputCheck.passed =
        hasUsefulBrowserInputTypes;

      mobileInputCheck.severity =
        hasUsefulBrowserInputTypes
          ? "info"
          : "low";

      mobileInputCheck.description =
        hasUsefulBrowserInputTypes
          ? "Rendered forms include mobile-friendly input types."
          : "Rendered forms were detected, but no common mobile-friendly input types were confirmed.";
    }

    const browserFormEvidence = renderedForms.map(form => ({
      ...form,
      source: "browser-rendered",
      usable: Boolean(
        form &&
        form.contactIntent &&
        form.hasSubmit
      )
    }));

    const mergedEvidence = {
            ...existingEvidence,

            phone: browserPhoneEvidence.length
              ? browserPhoneEvidence
              : (
                  Array.isArray(existingEvidence.phone)
                    ? existingEvidence.phone
                    : []
                ),

            email: browserEmailEvidence.length
              ? browserEmailEvidence
              : (
                  Array.isArray(existingEvidence.email)
                    ? existingEvidence.email
                    : []
                ),

            whatsapp: browserWhatsAppEvidence.length
              ? browserWhatsAppEvidence
              : (
                  Array.isArray(existingEvidence.whatsapp)
                    ? existingEvidence.whatsapp
                    : []
                ),

            cta: browserCtaEvidence.length
              ? browserCtaEvidence
              : (
                  Array.isArray(existingEvidence.cta)
                    ? existingEvidence.cta
                    : []
                ),
            form: [
              ...(Array.isArray(existingEvidence.form) ? existingEvidence.form : []),
              ...browserFormEvidence
            ]
          };

    const uniqueEvidence =
      values =>
        Array.from(
          new Map(
            values.map(item => [
              JSON.stringify(item),
              item
            ])
          ).values()
        );

    mergedEvidence.phone =
      uniqueEvidence(
        mergedEvidence.phone
      );

    mergedEvidence.email =
      uniqueEvidence(
        mergedEvidence.email
      );

    mergedEvidence.whatsapp =
      uniqueEvidence(
        mergedEvidence.whatsapp
      );
    mergedEvidence.form =
      uniqueEvidence(
        mergedEvidence.form
      );

    const mergedData = {
      ...mergedScanData,
      businessEvidence:
        mergedEvidence
    };

    const businessChecks =
      Array.isArray(
        mergedData.checks?.business
      )
        ? mergedData.checks.business
        : [];

    const updateBusinessCheck = (
      title,
      shouldPass,
      passDescription,
      warningDescription
    ) => {
      const check =
        businessChecks.find(
          item =>
            item &&
            item.title === title
        );

      if (!check) {
        return;
      }

      check.status =
        shouldPass
          ? "pass"
          : "warning";

      check.severity =
        shouldPass
          ? "info"
          : "medium";

      check.description =
        shouldPass
          ? passDescription
          : warningDescription;
    };

    const hasPhone =
      mergedEvidence.phone.length >
      0;

    const hasEmail =
      mergedEvidence.email.length >
      0;

    const hasWhatsApp =
      mergedEvidence.whatsapp.length >
      0;

    const hasCta =
      mergedEvidence.cta.length >
      0;

    updateBusinessCheck(
      "Phone number",
      hasPhone,
      "A clickable phone link was detected.",
      "A phone number was detected, but no clickable call link was found."
    );

    updateBusinessCheck(
      "Email address",
      hasEmail,
      "A clickable email link was detected.",
      "An email address was detected, but no mailto link was found."
    );

    updateBusinessCheck(
      "WhatsApp",
      hasWhatsApp,
      "A WhatsApp contact link was detected.",
      "No WhatsApp reference was detected across the pages scanned."
    );

    const contactForm = mergedEvidence.form.find(
      form => form && form.contactIntent && form.hasSubmit
    );
    const hasContactForm = Boolean(contactForm);

    updateBusinessCheck(
      "Contact form",
      hasContactForm,
      "A " +
        (contactForm?.type || "contact") +
        " form was detected on " +
        (contactForm?.url || "the scanned website") +
        " with " +
        (contactForm?.fields || 0) +
        " field(s). The form was inspected only and was not submitted.",
      "No confirmed contact/enquiry form with a working submit mechanism was detected."
    );

    updateBusinessCheck(
      "Call to action",
      hasCta,
      "A conversion-focused call to action was detected.",
      "No clear conversion-focused call to action was detected across the pages scanned."
    );

    const businessIssues =
      Array.isArray(
        mergedData.issues
      )
        ? mergedData.issues
        : [];

    const businessRecommendations =
      Array.isArray(
        mergedData.recommendations
      )
        ? mergedData.recommendations
        : [];

    const contactTitles = new Set([
      "Phone number",
      "Email address",
      "WhatsApp",
      "Contact form",
      "Call to action"
    ]);

    mergedData.issues =
      businessIssues.filter(
        issue =>
          !(
            issue &&
            contactTitles.has(
              issue.title
            ) &&
            (
              issue.title ===
                "Phone number" &&
              hasPhone ||
              issue.title ===
                "Email address" &&
              hasEmail ||
              issue.title ===
                "WhatsApp" &&
              hasWhatsApp ||
              issue.title ===
                "Contact form" &&
              hasContactForm ||
              issue.title ===
                "Call to action" &&
              hasCta
            )
          )
      );

    mergedData.recommendations =
      businessRecommendations.filter(
        recommendation =>
          !(
            recommendation &&
            contactTitles.has(
              recommendation.title
            ) &&
            (
              recommendation.title ===
                "Phone number" &&
              hasPhone ||
              recommendation.title ===
                "Email address" &&
              hasEmail ||
              recommendation.title ===
                "WhatsApp" &&
              hasWhatsApp ||
              recommendation.title ===
                "Contact form" &&
              hasContactForm ||
              recommendation.title ===
                "Call to action" &&
              hasCta
            )
          )
      );

    return mergedData;
  }


  function renderRecommendations(recommendations) {

    const section =
      document.getElementById(
        "recommendationsSection"
      );

    const list =
      document.getElementById(
        "recommendationsList"
      );

    if (!section || !list) {
      return;
    }

    if (
      !Array.isArray(recommendations) ||
      recommendations.length === 0
    ) {
      section.hidden = true;
      list.innerHTML = "";
      return;
    }

    section.hidden = false;

    list.innerHTML =
      recommendations
        .map((recommendation) => {

          const severity =
            recommendation.severity ||
            "medium";

          const severityLabel =
            severity === "high"
              ? "HIGH PRIORITY"
              : severity === "medium"
                ? "RECOMMENDED"
                : "OPPORTUNITY";

          return `
            <article
              class="recommendation-card recommendation-${severity}"
            >

              <div class="recommendation-header">

                <span
                  class="recommendation-severity"
                >
                  ${severityLabel}
                </span>

                <h3>
                ${escapeHtml(recommendation.title)}
                </h3>

              </div>

              <div class="recommendation-content">

                <div class="recommendation-block">

                  <strong>
                    Why it matters
                  </strong>

                  <p>
                  ${escapeHtml(recommendation.why)}
                  </p>

                </div>

                <div class="recommendation-block">

                  <strong>
                    Recommended action
                  </strong>

                  <p>
                  ${escapeHtml(recommendation.action)}
                  </p>

                </div>

                <div class="recommendation-service">

                  <span>
                    Site Rescue service
                  </span>

                  <strong>
                  ${escapeHtml(recommendation.service)}
                  </strong>

                </div>

              </div>

            </article>
          `;

        })
        .join("");
  }



  form.addEventListener("submit", async (event) => {

    event.preventDefault();

    hideError();

    if (adminReportSection) {
      adminReportSection.hidden = true;
    }

    const url =
      urlInput.value.trim();

    if (!url) {
      showError(
        "Please enter a website address."
      );

      return;
    }

    setLoading(true);

    try {

      const response =
        await fetch("/api/scan", {

          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            url
          })

        });


      const responseText =
        await response.text();


      let data;

      try {

        data =
          JSON.parse(responseText);

      } catch {

        console.error(
          "Non-JSON response from /api/scan:",
          responseText
        );

        throw new Error(
          responseText ||
          `Scanner server error (${response.status}).`
        );

      }


      if (!response.ok || !data.success) {

        throw new Error(
          data.error ||
          "The website could not be scanned."
        );

      }

      latestScanData = data;

if (adminReportSection) {
  adminReportSection.hidden = false;
}

console.log(
  "FULL SERVER SCAN DATA:",
  data
);

/*
 * --------------------------------------------------------
 * BROWSER-RENDERED INSPECTION
 * --------------------------------------------------------
 *
 * This is deliberately a separate request.
 * If browser inspection is unavailable, the normal
 * server-side scan remains valid.
 */

try {

  const browserResponse =
    await fetch(
      "/api/browser-inspection",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            url:
              data.finalUrl ||
              data.url
          })
      }
    );

  const browserText =
    await browserResponse.text();

  let browserData;

  try {

    browserData =
      JSON.parse(
        browserText
      );

  } catch {

    browserData = {
      success: false,
      browserInspection: {
        attempted: true,
        available: false,
        unavailableReason:
          "Browser inspection returned an invalid response."
      }
    };

  }

  if (
    browserData &&
    browserData.inspection
  ) {

    latestScanData =
  {
    ...data,
    browserInspection:
      {
        ...browserData.inspection,
        findings:
          browserData.findings || []
      }
  };

  latestScanData =
  mergeBrowserBusinessEvidence(
    latestScanData
  );

// Recalculate scores after browser business evidence has been merged.
latestScanData =
  recalculateScoresAfterBusinessMerge(
    latestScanData
  );

renderBrowserInspection(
  latestScanData.browserInspection,
  latestScanData.routeHealth
);

  } else {

    latestScanData =
      {
        ...data,
        browserInspection: {
          attempted: true,
          available: false,
          unavailableReason:
            "Browser inspection was unavailable."
        }
      };

  }

} catch (browserError) {

  console.warn(
    "Browser inspection unavailable:",
    browserError
  );

  latestScanData =
    {
      ...data,
      browserInspection: {
        attempted: true,
        available: false,
        unavailableReason:
          "Browser inspection could not be completed."
      }
    };

}

function recalculateScoresAfterBusinessMerge(scanData) {
  if (!scanData || typeof scanData !== "object") {
    return scanData;
  }

  const businessChecks =
    Array.isArray(scanData?.checks?.business)
      ? scanData.checks.business
      : [];

  if (!businessChecks.length) {
    return scanData;
  }

  let totalWeight = 0;
  let earnedWeight = 0;

  businessChecks.forEach(check => {
    const weight =
      typeof check?.weight === "number" &&
      Number.isFinite(check.weight)
        ? check.weight
        : 0;

    totalWeight += weight;

    if (check?.status === "pass") {
      earnedWeight += weight;
    } else if (check?.status === "warning") {
      earnedWeight += weight * 0.5;
    }
  });

  if (totalWeight <= 0) {
    return scanData;
  }

  if (
    scanData.browserInspection &&
    scanData.browserInspection.responsiveCssDetected === true
  ) {
    const mobileChecks =
      Array.isArray(scanData.checks?.mobile)
        ? scanData.checks.mobile
        : [];

    const responsiveCssCheck =
      mobileChecks.find(
        check =>
          check &&
          check.title === "Responsive CSS"
      );

    if (responsiveCssCheck) {
      responsiveCssCheck.status = "pass";
      responsiveCssCheck.passed = true;
      responsiveCssCheck.severity = "info";
      responsiveCssCheck.description =
        "Responsive media or container CSS rules were detected in the rendered page.";
    }
  }

  const seoScore =
    Number.isFinite(
      Number(scanData.scores?.seo)
    )
      ? Number(scanData.scores.seo)
      : 0;

  const businessScore =
    Math.round(
      (earnedWeight / totalWeight) * 100
    );

  const currentScores =
    scanData.scores || {};

  const performanceScore =
    currentScores.performance;

  let overall;

  if (
    performanceScore !== null &&
    performanceScore !== undefined &&
    Number.isFinite(
      Number(performanceScore)
    )
  ) {
    overall =
      Math.round(
        seoScore * 0.25 +
        Number(performanceScore) * 0.20 +
        Number(currentScores.accessibility || 0) * 0.10 +
        Number(currentScores.technical || 0) * 0.15 +
        businessScore * 0.30
      );
  } else {
    overall =
      Math.round(
        seoScore * 0.30 +
        Number(currentScores.accessibility || 0) * 0.10 +
        Number(currentScores.technical || 0) * 0.20 +
        businessScore * 0.40
      );
  }

  const browserCorrectedTitles = new Set([
    "Missing H1",
    "Responsive CSS",
    "Phone number",
    "Email address",
    "WhatsApp",
    "Contact form",
    "Call to action"
  ]);

  const resolvedCheckTitles = new Set(
    (Array.isArray(scanData.checks?.seo)
      ? scanData.checks.seo
      : []
    )
      .concat(
        Array.isArray(scanData.checks?.mobile)
          ? scanData.checks.mobile
          : []
      )
      .concat(
        Array.isArray(scanData.checks?.business)
          ? scanData.checks.business
          : []
      )
      .filter(
        check =>
          check &&
          browserCorrectedTitles.has(
            check.title
          ) &&
          check.status === "pass"
      )
      .map(
        check =>
          check.title
      )
  );

  const syncedIssues =
    Array.isArray(scanData.issues)
      ? scanData.issues.filter(
          issue =>
            !(
              issue &&
              resolvedCheckTitles.has(
                issue.title
              )
            )
        )
      : [];

  const syncedRecommendations =
    Array.isArray(scanData.recommendations)
      ? scanData.recommendations.filter(
          recommendation =>
            !(
              recommendation &&
              resolvedCheckTitles.has(
                recommendation.title
              )
            )
        )
      : [];

  return {
    ...scanData,
    issues:
      syncedIssues,
    recommendations:
      syncedRecommendations,
    scores: {
      ...currentScores,
      seo: seoScore,
      business: businessScore,
      overall
    }
  };
}

console.log(
  "FULL SCAN DATA:",
  latestScanData
);

console.log(
  "SCORE COMPARISON:",
  {
    serverOverall:
      data?.scores?.overall,

    latestOverall:
      latestScanData?.scores?.overall,

    serverBusiness:
      data?.scores?.business,

    latestBusiness:
      latestScanData?.scores?.business,

    businessChecks:
      latestScanData?.checks?.business,

    serverScores:
      data?.scores,

    latestScores:
      latestScanData?.scores
  }
);

renderResults(
  latestScanData
);

renderRecommendations(
  latestScanData.recommendations
);

      if (reportAction) {
        reportAction.hidden = false;
      }

      results.hidden = false;

      results.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });


    } catch (error) {

      console.error(error);

      showError(
        error.message ||
        "Something went wrong while scanning the website."
      );

    } finally {

      setLoading(false);

    }

  });


  newScanButton.addEventListener("click", () => {
    if (adminReportSection) {
      adminReportSection.hidden = true;
    }

    results.hidden = true;
    hideError();

    urlInput.value = "";

    urlInput.focus();
  });

  async function downloadQuickReport() {

    if (!latestScanData) {

        showError(
            "Please complete a website scan first."
        );

        return;
    }

    if (!downloadQuickReportButton) {
        return;
    }

    downloadQuickReportButton.disabled = true;

    if (downloadQuickReportText) {
        downloadQuickReportText.hidden = true;
    }

    if (downloadQuickReportSpinner) {
        downloadQuickReportSpinner.hidden = false;
    }

    try {

        const response =
            await fetch(
                "/api/quick-report",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body:
                        JSON.stringify(
                            latestScanData
                        )
                }
            );

        if (!response.ok) {

            let message =
                "Unable to generate the free report.";

            try {

                const errorData =
                    await response.json();

                if (errorData?.error) {
                    message =
                        errorData.error;
                }

            } catch {}

            throw new Error(message);
        }

        const blob =
            await response.blob();

        const downloadUrl =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.href = downloadUrl;

        link.download =
            buildReportFilename(
                latestScanData,
                "website-check"
            );

        document.body.appendChild(link);

        link.click();

        link.remove();

        URL.revokeObjectURL(
            downloadUrl
        );

    } catch (error) {

        console.error(
            "Quick report error:",
            error
        );

        showError(
            error.message ||
            "Unable to generate the free report."
        );

    } finally {

        downloadQuickReportButton.disabled =
            false;

        if (downloadQuickReportText) {
            downloadQuickReportText.hidden =
                false;
        }

        if (downloadQuickReportSpinner) {
            downloadQuickReportSpinner.hidden =
                true;
        }

    }
}

function buildReportFilename(
  scanData,
  reportType
) {

  const source =
      scanData?.finalUrl ||
      scanData?.url ||
      "website";

  let hostname = "website";

  try {

      hostname =
          new URL(source).hostname
              .replace(/^www\./, "");

  } catch {}

  const slug =
      hostname
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

  return `site-rescue-studio-${slug}-${reportType}.pdf`;
}

function openHealthReportConfirmation() {

  if (!latestScanData) {

      showError(
          "Please complete a website scan first."
      );

      return;
  }

  if (!healthReportConfirmModal) {
      return;
  }

  healthReportConfirmModal.hidden =
      false;
}

function closeHealthReportConfirmation() {

  if (!healthReportConfirmModal) {
      return;
  }

  healthReportConfirmModal.hidden =
      true;
}

function confirmHealthReportRequest() {

  if (!latestScanData) {

      closeHealthReportConfirmation();

      showError(
          "Please complete a website scan first."
      );

      return;
  }

  const website =
      latestScanData.finalUrl ||
      latestScanData.url ||
      "";

  const message = [
      "SITE RESCUE STUDIO — WEBSITE HEALTH REPORT REQUEST",
      "",
      `Website: ${website}`,
      "",
      "I would like to request the R200 Website Health Report.",
      "",
      "I understand that payment of R200 is required before the completed report will be provided."
  ].join("\n");

  const whatsappUrl =
      `https://wa.me/27783944289?text=${encodeURIComponent(message)}`;

  closeHealthReportConfirmation();

  window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
  );
}

if (downloadQuickReportButton) {

  downloadQuickReportButton.addEventListener(
      "click",
      downloadQuickReport
  );

}

if (requestHealthReportButton) {

  requestHealthReportButton.addEventListener(
      "click",
      openHealthReportConfirmation
  );

}

if (cancelHealthReportButton) {

  cancelHealthReportButton.addEventListener(
      "click",
      closeHealthReportConfirmation
  );

}

if (confirmHealthReportButton) {

  confirmHealthReportButton.addEventListener(
      "click",
      confirmHealthReportRequest
  );

}

function openAdminHealthReportModal() {

  if (!latestScanData) {

    showError(
      "Please complete a website scan first."
    );

    return;
  }

  if (!adminHealthReportModal) {
    return;
  }

  if (
    adminHealthReportPassword
  ) {
    adminHealthReportPassword.value =
      "";
  }

  if (
    adminHealthReportError
  ) {
    adminHealthReportError.hidden =
      true;

    adminHealthReportError.textContent =
      "";
  }

  adminHealthReportModal.hidden =
    false;

  if (
    adminHealthReportPassword
  ) {
    setTimeout(
      () =>
        adminHealthReportPassword.focus(),
      50
    );
  }
}


function closeAdminHealthReportModal() {

  if (
    adminHealthReportModal
  ) {
    adminHealthReportModal.hidden =
      true;
  }
}


function showAdminHealthReportError(
  message
) {

  if (
    !adminHealthReportError
  ) {
    return;
  }

  adminHealthReportError.textContent =
    message;

  adminHealthReportError.hidden =
    false;
}


async function downloadAdminHealthReport() {

  if (!latestScanData) {

    closeAdminHealthReportModal();

    showError(
      "Please complete a website scan first."
    );

    return;
  }

  const password =
    String(
      adminHealthReportPassword?.value ||
      ""
    );

  if (!password) {

    showAdminHealthReportError(
      "Please enter your admin password."
    );

    return;
  }

  if (
    confirmAdminHealthReportButton
  ) {
    confirmAdminHealthReportButton.disabled =
      true;

    confirmAdminHealthReportButton.textContent =
      "Generating...";
  }

  if (
    adminHealthReportError
  ) {
    adminHealthReportError.hidden =
      true;
  }

  try {

    const response =
      await fetch(
        "/api/health-report",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              ...latestScanData,
              password
            })
        }
      );

    if (!response.ok) {

      let message =
        "Unable to generate the protected health report.";

      try {

        const errorData =
          await response.json();

        if (
          errorData?.error
        ) {
          message =
            errorData.error;
        }

      } catch {}

      throw new Error(
        message
      );
    }

    const blob =
      await response.blob();

    if (
      !blob.size
    ) {
      throw new Error(
        "The generated health report was empty."
      );
    }

    const downloadUrl =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href =
      downloadUrl;

    link.download =
      buildReportFilename(
        latestScanData,
        "health-report"
      );

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      downloadUrl
    );

    closeAdminHealthReportModal();

  } catch (error) {

    console.error(
      "Admin health report error:",
      error
    );

    showAdminHealthReportError(
      error.message ||
      "Unable to generate the health report."
    );

  } finally {

    if (
      confirmAdminHealthReportButton
    ) {
      confirmAdminHealthReportButton.disabled =
        false;

      confirmAdminHealthReportButton.textContent =
        "Generate Health Report";
    }
  }
}

if (adminHealthReportButton) {
  adminHealthReportButton.addEventListener(
    "click",
    openAdminHealthReportModal
  );
}

if (cancelAdminHealthReportButton) {
  cancelAdminHealthReportButton.addEventListener(
    "click",
    closeAdminHealthReportModal
  );
}

if (confirmAdminHealthReportButton) {
  confirmAdminHealthReportButton.addEventListener(
    "click",
    downloadAdminHealthReport
  );
}

if (adminHealthReportPassword) {
  adminHealthReportPassword.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        event.preventDefault();
        downloadAdminHealthReport();
      }
    }
  );
}


/* =========================================================
   SCAN HISTORY EVENT LISTENERS
   ========================================================= */

if (
  adminScanHistoryButton
) {

  adminScanHistoryButton.addEventListener(
    "click",
    openScanHistoryModal
  );

}


if (
  cancelScanHistoryButton
) {

  cancelScanHistoryButton.addEventListener(
    "click",
    closeScanHistoryModal
  );

}


if (
  loadScanHistoryButton
) {

  loadScanHistoryButton.addEventListener(
    "click",
    loadScanHistory
  );

}


if (
  scanHistoryPassword
) {

  scanHistoryPassword.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        loadScanHistory();

      }

    }
  );

}

function openScanHistoryModal() {

  if (!latestScanData) {

    showError(
      "Please complete a website scan first."
    );

    return;
  }

  if (!scanHistoryModal) {
    return;
  }

  const website =
    latestScanData.finalUrl ||
    latestScanData.url ||
    "";

  if (scanHistoryWebsite) {

    scanHistoryWebsite.textContent =
      `Viewing scan history for ${website}`;

  }

  if (scanHistoryPassword) {

    scanHistoryPassword.value =
      "";

  }

  if (scanHistoryError) {

    scanHistoryError.hidden =
      true;

    scanHistoryError.textContent =
      "";

  }

  if (scanHistoryLoading) {

    scanHistoryLoading.hidden =
      true;

  }

  if (scanHistoryResults) {

    scanHistoryResults.hidden =
      true;

    scanHistoryResults.innerHTML =
      "";

  }

  scanHistoryModal.hidden =
    false;

  if (scanHistoryPassword) {

    setTimeout(
      () =>
        scanHistoryPassword.focus(),
      50
    );

  }

}


function closeScanHistoryModal() {

  if (scanHistoryModal) {

    scanHistoryModal.hidden =
      true;

  }

}


function showScanHistoryError(
  message
) {

  if (!scanHistoryError) {
    return;
  }

  scanHistoryError.textContent =
    message;

  scanHistoryError.hidden =
    false;

}


function formatHistoryDate(
  value
) {

  if (!value) {
    return "Unknown date";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );

}


function formatHistoryScore(
  value
) {

  return (
    value === null ||
    value === undefined
  )
    ? "—"
    : `${value}/100`;

}


function getHistoryDelta(
  current,
  previous
) {

  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined
  ) {

    return "";

  }

  const delta =
    Number(current) -
    Number(previous);

  if (delta === 0) {
    return "No change";
  }

  return delta > 0
    ? `+${delta}`
    : `${delta}`;

}


function getHistoryDeltaClass(
  current,
  previous
) {

  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined
  ) {

    return "";

  }

  const delta =
    Number(current) -
    Number(previous);

  if (delta > 0) {
    return "positive";
  }

  if (delta < 0) {
    return "negative";
  }

  return "neutral";

}


function renderScanHistory(
  history
) {

  if (!scanHistoryResults) {
    return;
  }

  if (
    !Array.isArray(history) ||
    history.length === 0
  ) {

    scanHistoryResults.innerHTML = `
      <div class="scan-history-empty">
        <strong>No previous scan history found.</strong>
        <p>
          This scan is the first recorded scan for this website.
        </p>
      </div>
    `;

    scanHistoryResults.hidden =
      false;

    return;

  }

  const rows =
    history
      .map(
        (
          scan,
          index
        ) => {

          const previous =
            history[index - 1] ||
            null;

          const overallDelta =
            getHistoryDelta(
              scan.overall_score,
              previous?.overall_score
            );

          const overallDeltaClass =
            getHistoryDeltaClass(
              scan.overall_score,
              previous?.overall_score
            );

          return `
            <article class="scan-history-entry">

              <div class="scan-history-entry-header">

                <div>
                  <div class="scan-history-date">
                    ${escapeHtml(
                      formatHistoryDate(
                        scan.scanned_at
                      )
                    )}
                  </div>

                  <div class="scan-history-version">
                    Scanner ${escapeHtml(
                      scan.scanner_version ||
                      "3.0"
                    )}
                  </div>
                </div>

                <div class="scan-history-overall">

                  <span>
                    Overall
                  </span>

                  <strong>
                    ${escapeHtml(
                      formatHistoryScore(
                        scan.overall_score
                      )
                    )}
                  </strong>

                  ${
                    overallDelta
                      ? `
                        <small
                          class="scan-history-delta ${overallDeltaClass}"
                        >
                          ${escapeHtml(
                            overallDelta
                          )}
                        </small>
                      `
                      : ""
                  }

                </div>

              </div>

              <div class="scan-history-scores">

                <div>
                  <span>SEO</span>
                  <strong>
                    ${escapeHtml(
                      formatHistoryScore(
                        scan.seo_score
                      )
                    )}
                  </strong>
                </div>

                <div>
                  <span>Mobile</span>
                  <strong>
                    ${escapeHtml(
                      formatHistoryScore(
                        scan.mobile_score
                      )
                    )}
                  </strong>
                </div>

                <div>
                  <span>Accessibility</span>
                  <strong>
                    ${escapeHtml(
                      formatHistoryScore(
                        scan.accessibility_score
                      )
                    )}
                  </strong>
                </div>

                <div>
                  <span>Technical</span>
                  <strong>
                    ${escapeHtml(
                      formatHistoryScore(
                        scan.technical_score
                      )
                    )}
                  </strong>
                </div>

                <div>
                  <span>Business</span>
                  <strong>
                    ${escapeHtml(
                      formatHistoryScore(
                        scan.business_score
                      )
                    )}
                  </strong>
                </div>

                <div>
                  <span>Performance</span>
                  <strong>
                    ${escapeHtml(
                      formatHistoryScore(
                        scan.performance_score
                      )
                    )}
                  </strong>
                </div>

                <div>
                  <span>Security</span>
                  <strong>
                    ${escapeHtml(
                      formatHistoryScore(
                        scan.security_score
                      )
                    )}
                  </strong>
                </div>

              </div>

            </article>
          `;

        }
      )
      .join("");

  scanHistoryResults.innerHTML =
    `
      <div class="scan-history-summary">
        <strong>
          ${history.length}
          recorded scan${history.length === 1 ? "" : "s"}
        </strong>

        <span>
          Oldest to newest
        </span>
      </div>

      <div class="scan-history-list">
        ${rows}
      </div>
    `;

  scanHistoryResults.hidden =
    false;

}


async function loadScanHistory() {

  if (!latestScanData) {

    closeScanHistoryModal();

    showError(
      "Please complete a website scan first."
    );

    return;

  }

  const password =
    String(
      scanHistoryPassword?.value ||
      ""
    );

  if (!password) {

    showScanHistoryError(
      "Please enter your admin password."
    );

    return;

  }

  const website =
    latestScanData.finalUrl ||
    latestScanData.url ||
    "";

  if (loadScanHistoryButton) {

    loadScanHistoryButton.disabled =
      true;

    loadScanHistoryButton.textContent =
      "Loading...";

  }

  if (scanHistoryError) {

    scanHistoryError.hidden =
      true;

  }

  if (scanHistoryResults) {

    scanHistoryResults.hidden =
      true;

  }

  if (scanHistoryLoading) {

    scanHistoryLoading.hidden =
      false;

  }

  try {

    const response =
      await fetch(
        "/api/scan-history",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              website,
              password
            })
        }
      );

    let data = null;

    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        `Scan history server error (${response.status}).`
      );

    }

    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data.error ||
        "Unable to load scan history."
      );

    }

    renderScanHistory(
      data.history
    );

  } catch (error) {

    console.error(
      "Scan history error:",
      error
    );

    showScanHistoryError(
      error.message ||
      "Unable to load scan history."
    );

  } finally {

    if (scanHistoryLoading) {

      scanHistoryLoading.hidden =
        true;

    }

    if (loadScanHistoryButton) {

      loadScanHistoryButton.disabled =
        false;

      loadScanHistoryButton.textContent =
        "View History";

    }

  }

}


  function setLoading(loading) {

    scanButton.disabled =
      loading;

    scanSpinner.hidden =
      !loading;

    scanButtonText.textContent =
      loading
        ? "Scanning..."
        : "Scan Website";

  }


  function showError(message) {
    if (!errorBox) return;

    errorBox.innerHTML = "";

    const messageText = document.createElement("p");
    messageText.className = "scanner-error-message";
    messageText.textContent = message;

    errorBox.appendChild(messageText);

    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "scanner-error-retry";
    retryButton.textContent = "Try Again";

    retryButton.addEventListener("click", () => {
      hideError();

      if (results) {
        results.hidden = true;
      }

      if (reportAction) {
        reportAction.hidden = true;
      }

      if (urlInput) {
        urlInput.focus();
        urlInput.select();
      }
    });

    errorBox.appendChild(retryButton);

    errorBox.hidden = false;
  }


  function hideError() {

    errorBox.textContent = "";

    errorBox.hidden = true;

  }

  function getSecurityStatus(data) {
    const securityChecks =
      Array.isArray(data?.checks?.security)
        ? data.checks.security
        : [];

    const finalUrl =
      data?.finalUrl ||
      data?.url ||
      "";

    let finalProtocol = "";

    try {
      finalProtocol =
        new URL(finalUrl).protocol;
    } catch {}

    const isHttps =
      finalProtocol === "https:";

    const hasFailedSecurityCheck =
      securityChecks.some(
        check =>
          check?.status === "fail"
      );

    const warningChecks =
      securityChecks.filter(
        check =>
          check?.status === "warning"
      );

    const hasInsecureResourceFinding =
      securityChecks.some(
        check =>
          check?.title === "Insecure resources" &&
          check?.status === "fail"
      );

    const hasInsecureFormFinding =
      securityChecks.some(
        check =>
          check?.title === "Insecure form submission" &&
          check?.status === "fail"
      );

    const hasRedirectWarning =
      securityChecks.some(
        check =>
          check?.title === "HTTP to HTTPS redirect" &&
          check?.status === "warning"
      );

    /*
     * Unable to verify:
     * The scan did not produce a reliable final URL
     * or usable security checks.
     */
    if (
      !finalUrl ||
      !securityChecks.length
    ) {
      return {
        key: "info",
        label: "Unable to verify",
        title: "Unable to verify",
        description:
          "The scanner could not reliably verify the website's security status. Connection, redirect or access limitations may have prevented a complete assessment."
      };
    }

    /*
     * Not secure:
     * The final page remains on HTTP.
     */
    if (
      !isHttps ||
      hasRedirectWarning
    ) {
      return {
        key: "danger",
        label: "Not secure",
        title: "Not secure — HTTPS is not active",
        description:
          "This website is currently being served over HTTP. Information sent between visitors and the website may not receive the protection provided by HTTPS. The website should be configured with a valid SSL/TLS certificate and redirected from HTTP to HTTPS."
      };
    }

    /*
     * Not secure:
     * HTTPS is active but an important insecure
     * resource or form submission was detected.
     */
    if (
      hasInsecureResourceFinding ||
      hasInsecureFormFinding
    ) {
      return {
        key: "danger",
        label: "Not secure",
        title: "Not secure — insecure content detected",
        description:
          "HTTPS is active, but the scan detected content or form destinations using HTTP. These insecure references should be corrected so visitors receive consistent HTTPS protection."
      };
    }

    /*
     * Partially protected:
     * HTTPS works, but additional security
     * protections are missing or need review.
     */
    if (
      warningChecks.length > 0 ||
      hasFailedSecurityCheck
    ) {
      return {
        key: "warning",
        label: "Partially protected",
        title: "HTTPS active — additional security improvements recommended",
        description:
          "The website uses HTTPS and no obvious insecure resources were detected. Several additional browser security protections are missing or need review as part of a technical security improvement."
      };
    }

    /*
     * Secure:
     * HTTPS is active and the security checks
     * did not identify obvious concerns.
     */
    return {
      key: "success",
      label: "Secure",
      title: "Secure",
      description:
        "The website is served over HTTPS and the scan did not identify obvious insecure resources, insecure form submissions or major security concerns. Additional security improvements may still be possible."
    };
  }


  function renderResults(data) {

    document.getElementById(
      "scannedUrl"
    ).textContent =
      data.finalUrl || data.url;


    setScore(
      "overallScore",
      data.scores.overall
    );

    setScore(
      "seoScore",
      data.scores.seo
    );

    setScore(
      "mobileScore",
      data.scores.mobile
    );

    setScore(
      "accessibilityScore",
      data.scores.accessibility
    );

    setScore(
      "technicalScore",
      data.scores.technical
    );

    setScore(
      "businessScore",
      data.scores.business
    );

    setScore(
      "performanceScore",
      data.scores.performance
    );

    setScore(
      "securityScore",
      data.scores.security
    );

    renderSecurityStatus(data);

      const performanceElement =
        document.getElementById(
          "performanceScore"
        );

      if (
        performanceElement &&
        (
          data.scores.performance === null ||
          data.scores.performance === undefined
        )
      ) {
        performanceElement.textContent = "—";
      }


    document.getElementById(
      "overallLabel"
    ).textContent =
      getScoreLabel(
        data.scores.overall
      );


    renderIssues(
      data.issues || []
    );


    renderCheckSections(
      data.checks
    );

    renderPerformance(
      data.pageSpeed
    );

    renderLinkHealth(
      data
    );

  }

  function renderSecurityStatus(data) {
    const titleElement =
      document.getElementById(
        "securityStatusTitle"
      );

    const badgeElement =
      document.getElementById(
        "securityStatusBadge"
      );

    const descriptionElement =
      document.getElementById(
        "securityStatusDescription"
      );

    if (
      !titleElement ||
      !badgeElement ||
      !descriptionElement
    ) {
      return;
    }

    const status =
      getSecurityStatus(data);

    titleElement.textContent =
      status.title;

    badgeElement.textContent =
      status.label;

    badgeElement.className =
      `security-status-badge ${status.key}`;

    descriptionElement.textContent =
      status.description;
  }


  function setScore(
    id,
    score
  ) {

    const element =
      document.getElementById(id);

    if (!element) return;

    if (
      score === null ||
      score === undefined ||
      Number.isNaN(score)
    ) {
      element.textContent = "—";
      return;
    }

    element.textContent =
      `${score}/100`;

  }


  function getScoreLabel(score) {

    if (score >= 90) {
      return "Excellent";
    }

    if (score >= 75) {
      return "Good";
    }

    if (score >= 60) {
      return "Needs Improvement";
    }

    if (score >= 40) {
      return "Needs Attention";
    }

    return "Critical";
  }


  function renderIssues(
    issues
  ) {

    const container =
      document.getElementById(
        "issuesList"
      );

    container.innerHTML = "";


    if (!issues.length) {

      container.innerHTML = `
        <div class="issue">
          <div class="issue-icon">✓</div>
          <div>
            <h3>No major issues detected</h3>
            <p>
              The initial scan did not identify
              any high-priority problems.
            </p>
          </div>
        </div>
      `;

      return;
    }


    issues.forEach(issue => {

      const item =
        document.createElement("article");

      item.className =
        `issue ${issue.status}`;


      const icon =
        issue.status === "fail"
          ? "!"
          : "⚠";


      item.innerHTML = `
        <div class="issue-icon">
          ${icon}
        </div>

        <div>
          <h3>${escapeHtml(issue.title)}</h3>

          <p>
            ${escapeHtml(issue.description)}
          </p>
        </div>
      `;


      container.appendChild(item);

    });

  }


  function renderLinkHealth(data) {
    const section = document.getElementById("linkHealthSection");
    const content = document.getElementById("linkHealthContent");

    if (!section || !content) {
      return;
    }

    const linkHealth = data?.linkHealth || {};
    const routeHealth = data?.routeHealth || {};

    const problemLinks =
      Array.isArray(data?.linkResults)
        ? data.linkResults.filter(
            link =>
              link?.status === "broken" ||
              link?.status === "unreachable" ||
              link?.status === "blocked" ||
              link?.status === "placeholder"
          )
        : [];

    const routeProblems =
      Array.isArray(routeHealth?.routes)
        ? routeHealth.routes.filter(
            route =>
              route?.status === "broken" ||
              route?.status === "unreachable" ||
              route?.status === "blocked" ||
              route?.status === "redirected"
          )
        : [];

    const routeScore =
      Number.isFinite(Number(routeHealth.reliabilityScore))
        ? `${Number(routeHealth.reliabilityScore)}/100`
        : "Not enough confirmed routes";

    const stats = [
      ["Links found", linkHealth.total ?? 0],
      ["Links tested", linkHealth.tested ?? 0],
      ["Working", linkHealth.working ?? 0],
      ["Broken", linkHealth.broken ?? 0],
      ["Blocked", linkHealth.blocked ?? 0],
      ["Redirected", linkHealth.redirected ?? 0],
      ["Placeholders", linkHealth.placeholder ?? 0],
      ["Route reliability", routeScore]
    ];

    content.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "check-section-grid";

    stats.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "check-section";

      const heading = document.createElement("h3");
      heading.textContent = label;

      const valueElement = document.createElement("p");
      valueElement.textContent = String(value);

      item.appendChild(heading);
      item.appendChild(valueElement);
      grid.appendChild(item);
    });

    content.appendChild(grid);

    if (problemLinks.length === 0 && routeProblems.length === 0) {
      const cleanMessage = document.createElement("p");
      cleanMessage.textContent =
        "No link or direct-route problems were returned by the scan.";
      content.appendChild(cleanMessage);
      section.hidden = false;
      return;
    }

    const note = document.createElement("p");
    note.textContent =
      "Redirected links are not automatically broken. Blocked results are verification limits rather than confirmed failures.";
    content.appendChild(note);

    const list = document.createElement("div");
    list.className = "issues-list";

    [...problemLinks.slice(0, 5), ...routeProblems.slice(0, 5)]
      .forEach(item => {
        const card = document.createElement("article");
        card.className = "issue warning";

        const icon = document.createElement("div");
        icon.className = "issue-icon";
        icon.textContent = "!";

        const body = document.createElement("div");

        const heading = document.createElement("h3");
        heading.textContent =
          item.path || item.url || "Route or link";

        const description = document.createElement("p");
        description.textContent =
          `${String(item.status || "review").toUpperCase()} — ` +
          (item.statusCode
            ? `HTTP ${item.statusCode}`
            : "Review in the detailed report");

        body.appendChild(heading);
        body.appendChild(description);
        card.appendChild(icon);
        card.appendChild(body);
        list.appendChild(card);
      });

    content.appendChild(list);
    section.hidden = false;
  }

  function renderCheckSections(checks) {

    const container =
      document.getElementById(
        "checkSections"
      );

    container.innerHTML = "";

    const labels = {
      seo: "SEO",
      mobile: "Mobile",
      accessibility: "Accessibility",
      technical: "Technical",
      business: "Business",
      security: "Security & Trust"
    };

    const categoryOrder = [
      "seo",
      "mobile",
      "accessibility",
      "technical",
      "business",
      "security"
    ];

    categoryOrder.forEach(category => {

      const categoryChecks =
        Array.isArray(checks[category])
          ? checks[category]
          : [];

      if (!categoryChecks.length) {
        return;
      }

      const section =
        document.createElement(
          "section"
        );

      section.className =
        "check-section";

      section.innerHTML = `
        <h3>
          ${escapeHtml(
            labels[category] ||
            category
          )}
        </h3>
      `;

      categoryChecks.forEach(
        check => {

          const row =
            document.createElement(
              "div"
            );

          row.className =
            "check";

          row.innerHTML = `
            <div class="check-info">

              <strong>
                ${escapeHtml(
                  check.title
                )}
              </strong>

              <span>
                ${escapeHtml(
                  check.description
                )}
              </span>

            </div>

            <span
              class="check-status ${escapeHtml(
                check.status
              )}"
            >
              ${escapeHtml(
                check.status
              )}
            </span>
          `;

          section.appendChild(
            row
          );

        }
      );

      container.appendChild(
        section
      );

    });

  }

  function getMetricStatus(metric, thresholds) {

    if (
      metric === null ||
      metric === undefined ||
      metric === ""
    ) {
      return "info";
    }

    const value =
      parseFloat(metric);

    if (!Number.isFinite(value)) {
      return "info";
    }

    if (value <= thresholds.good) {
      return "pass";
    }

    if (value <= thresholds.warning) {
      return "warning";
    }

    return "fail";
  }

  function renderBrowserInspection(
    browserInspection,
    routeHealth
  ) {
    const section =
      document.getElementById(
        "browserInspectionSection"
      );

    const content =
      document.getElementById(
        "browserInspectionContent"
      );

    if (
      !section ||
      !content
    ) {
      return;
    }

    if (
      !browserInspection?.attempted
    ) {
      section.hidden = true;
      content.innerHTML = "";
      return;
    }

    if (
      !browserInspection?.available
    ) {

      section.hidden = false;

      content.innerHTML = `
        <p>
          Browser-rendered inspection was attempted
          but was not fully available for this scan.
        </p>
      `;

      return;
    }

    const consoleErrors =
      Array.isArray(
        browserInspection.consoleErrors
      )
        ? browserInspection.consoleErrors
        : [];

    const failedResources =
      Array.isArray(
        browserInspection.failedResources
      )
        ? browserInspection.failedResources
        : [];

    const findings =
      Array.isArray(
        browserInspection.findings
      )
        ? browserInspection.findings
        : [];

    const durationMs =
      Number(
        browserInspection.durationMs
      );

    const duration =
      Number.isFinite(durationMs)
        ? `${(
            durationMs / 1000
          ).toFixed(1)} seconds`
        : "Not available";

    const sameOriginFailures =
      failedResources.filter(
        (failure) =>
          failure?.classification ===
          "same-origin" &&
          failure?.status
      );

    const routesRequiringReview =
      Array.isArray(routeHealth?.routes)
        ? routeHealth.routes.filter(
            route =>
              route?.status === "broken" ||
              route?.status === "unreachable" ||
              route?.status === "blocked" ||
              route?.status === "redirected"
          )
        : [];

    const routeHealthHtml =
      routesRequiringReview.length > 0
        ? `
          <div class="browser-inspection-findings">
            <h3>Route Reliability</h3>
            <p>
              Discovered internal routes were requested directly.
              The routes below require review.
            </p>
            ${routesRequiringReview
              .slice(0, 10)
              .map(
                route => `
                  <article>
                    <strong>${escapeHtml(route.path || route.url || "Internal route")}</strong>
                    <p>${escapeHtml(
                      route.status === "redirected"
                        ? "Redirected to " + (route.finalUrl || "another URL") + "."
                        : route.status === "blocked"
                          ? "Returned HTTP " + (route.statusCode || "blocked") + "."
                          : route.status === "unreachable"
                            ? "Could not be reached when requested directly."
                            : "Returned HTTP " + (route.statusCode || "error") + "."
                    )}</p>
                    <p><strong>Status:</strong> ${escapeHtml(
                      route.statusCode !== null && route.statusCode !== undefined
                        ? route.status.toUpperCase() + " — HTTP " + route.statusCode
                        : (route.status || "unknown").toUpperCase()
                    )}</p>
                  </article>
                `
              )
              .join("")}
            ${routesRequiringReview.length > 10
              ? `<p>Showing the first 10 routes. The detailed report contains the complete route evidence.</p>`
              : ""}
          </div>
        `
        : `
          <p>No discovered internal route failures or redirects requiring attention were identified.</p>
        `;
    content.innerHTML = `
      <div class="browser-inspection-summary">

        <div>
          <strong>Inspection duration</strong>
          <span>${escapeHtml(duration)}</span>
        </div>

        <div>
          <strong>Console errors</strong>
          <span>${consoleErrors.length}</span>
        </div>

        <div>
          <strong>Browser findings</strong>
          <span>${findings.length}</span>
        </div>

        <div>
          <strong>Confirmed same-origin failures</strong>
          <span>${sameOriginFailures.length}</span>
        </div>

      </div>

      ${
        findings.length > 0
          ? `
            <div class="browser-inspection-findings">
              ${findings
                .slice(0, 5)
                .map(
                  (finding) => `
                    <article>
                      <strong>
                        ${escapeHtml(
                          finding.title ||
                          "Browser finding"
                        )}
                      </strong>

                      <p>
                        ${escapeHtml(
                          finding.description ||
                          ""
                        )}
                      </p>
                    </article>
                  `
                )
                .join("")}
            </div>
          `
          : `
            <p>
              No browser-specific findings requiring
              attention were identified.
            </p>
          `
      }

      ${routeHealthHtml}
    `;

    section.hidden = false;
  }


  function renderPerformance(
    pageSpeed
  ) {

    const container =
      document.getElementById(
        "performanceDetails"
      );

    if (!container) {
      return;
    }

    if (
      !pageSpeed ||
      !pageSpeed.available
    ) {

      container.innerHTML = `
        <section class="check-section">

          <h3>
            Google PageSpeed / Lighthouse Snapshot
          </h3>

          <p>
            Google PageSpeed performance data
            was not available for this scan.
          </p>

        </section>
      `;

      return;
    }

    const vitals =
      pageSpeed.vitals || {};

    const lcpStatus =
      getMetricStatus(
        vitals.lcp,
        {
          good: 2.5,
          warning: 4
        }
      );

    const clsStatus =
      getMetricStatus(
        vitals.cls,
        {
          good: 0.1,
          warning: 0.25
        }
      );

    const inpStatus =
      getMetricStatus(
        vitals.inp,
        {
          good: 200,
          warning: 500
        }
      );

    const fcpStatus =
      getMetricStatus(
        vitals.fcp,
        {
          good: 1.8,
          warning: 3
        }
      );

    container.innerHTML = `

      <section class="check-section">

        <h3>
          Google PageSpeed / Lighthouse Snapshot
        </h3>

        <p>
          These results come from Google's
          controlled PageSpeed/Lighthouse test
          environment and may differ from
          real-world devices, browsers and networks.
        </p>


        <div class="check">

          <div class="check-info">

            <strong>
              Largest Contentful Paint
            </strong>

            <span>
              Main content loading metric
            </span>

          </div>

          <span class="check-status ${lcpStatus}">
            ${escapeHtml(
              vitals.lcp ||
              "Not available"
            )}
          </span>

        </div>


        <div class="check">

          <div class="check-info">

            <strong>
              Cumulative Layout Shift
            </strong>

            <span>
              Visual stability metric
            </span>

          </div>

          <span class="check-status ${clsStatus}">
            ${escapeHtml(
              vitals.cls ||
              "Not available"
            )}
          </span>

        </div>


        <div class="check">

          <div class="check-info">

            <strong>
              Interaction to Next Paint
            </strong>

            <span>
              Responsiveness metric
            </span>

          </div>

          <span class="check-status ${inpStatus}">
            ${escapeHtml(
              vitals.inp ||
              "Not available"
            )}
          </span>

        </div>


        <div class="check">

          <div class="check-info">

            <strong>
              First Contentful Paint
            </strong>

            <span>
              Initial visual loading metric
            </span>

          </div>

          <span class="check-status ${fcpStatus}">
            ${escapeHtml(
              vitals.fcp ||
              "Not available"
            )}
          </span>

        </div>

      </section>
    `;
  }


  function escapeHtml(
    value
  ) {

    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  }

   /* =========================================================
   * SCAN PROGRESS SYSTEM
   *
   * This is intentionally separate from the existing scanner
   * logic. It observes the existing scan request rather than
   * replacing or rewriting it.
   * ========================================================= */


   const scanProgress =
   document.getElementById(
     "scanProgress"
   );

 const scanProgressFill =
   document.getElementById(
     "scanProgressFill"
   );

 const scanProgressPercent =
   document.getElementById(
     "scanProgressPercent"
   );

 const scanProgressStatus =
   document.getElementById(
     "scanProgressStatus"
   );

 const scanProgressTitle =
   document.getElementById(
     "scanProgressTitle"
   );

 const scanProgressUrl =
   document.getElementById(
     "scanProgressUrl"
   );

 const scanProgressSteps =
   document.querySelectorAll(
     ".scan-progress-step"
   );


   let scanProgressTimer =
   null;

 let scanProgressWarningTimer =
   null;

 let scanProgressSafetyTimer =
   null;

 let scanProgressRunning =
   false;

 let scanProgressValue =
   0;

 let scanProgressStep =
   -1;

 let scanProgressWarningSeconds =
   90;

 let scanProgressSafetySeconds =
   180;


 const scanProgressStages = [

   {
     step: 0,
     progress: 10,
     title: "Connecting to your website",
     status: "Checking the website connection..."
   },

   {
     step: 1,
     progress: 22,
     title: "Analysing website structure",
     status: "Reading the website structure..."
   },

   {
     step: 2,
     progress: 35,
     title: "Discovering internal pages",
     status: "Looking for useful pages and business information..."
   },

   {
     step: 3,
     progress: 48,
     title: "Checking SEO & metadata",
     status: "Reviewing search and page metadata..."
   },

   {
     step: 4,
     progress: 62,
     title: "Checking links & technical health",
     status: "Testing links and technical website health..."
   },

   {
     step: 5,
     progress: 74,
     title: "Checking business information",
     status: "Looking for contact and business readiness signals..."
   },

   {
     step: 6,
     progress: 84,
     title: "Analysing performance",
     status: "Reviewing available performance information..."
   },

   {
     step: 7,
     progress: 92,
     title: "Preparing your results",
     status: "Finishing the website health analysis..."
   }

 ];


 function startScanProgress(
  url
) {

  if (!scanProgress) {
    return;
  }

  stopScanProgress();

  scanProgressRunning =
    true;

  scanProgressValue =
    0;

  scanProgressStep =
    -1;

  scanProgress.classList.remove(
    "complete"
  );

  scanProgress.hidden =
    false;

  setTimeout(() => {
    const progressPosition =
      scanProgress.getBoundingClientRect().top +
      window.scrollY -
      90;

    window.scrollTo({
      top: progressPosition,
      behavior: "smooth"
    });
  }, 100);

  scanProgressUrl.textContent =
    url || "";

  updateScanProgress(
    0,
    -1,
    "Preparing your website scan...",
    "Starting scan..."
  );


  /*
   * Begin immediately with the first stage.
   */

  advanceScanProgress();


  /*
   * Continue moving through the stages while the
   * existing /api/scan request is running.
   *
   * Progress intentionally stops at 92%.
   */

  scanProgressTimer =
    setInterval(
      () => {

        if (!scanProgressRunning) {
          return;
        }

        advanceScanProgress();

      },
      1800
    );


    /*
   * 90-SECOND WARNING
   *
   * The existing scanner request remains untouched.
   * This only changes the progress message if the scan
   * is taking longer than usual.
   */

    scanProgressWarningTimer =
    setTimeout(
      () => {

        if (!scanProgressRunning) {
          return;
        }

        showScanProgressTimeout();

      },
      scanProgressWarningSeconds * 1000
    );


  /*
   * 180-SECOND FINAL SAFETY LIMIT
   *
   * The actual /api/scan request is NOT cancelled.
   *
   * This only prevents the visitor from being left
   * indefinitely on the scanner progress screen.
   */

  scanProgressSafetyTimer =
    setTimeout(
      () => {

        if (!scanProgressRunning) {
          return;
        }

        showScanProgressFinalTimeout();

      },
      scanProgressSafetySeconds * 1000
    );

}

function showScanProgressTimeout() {

  if (!scanProgress) {
    return;
  }


  /*
   * 90-SECOND WARNING
   *
   * Do NOT call stopScanProgress() here.
   *
   * The scan may still be running normally.
   * We only stop the visual stage progression and
   * change the message while leaving the 180-second
   * safety timer active.
   */

  if (scanProgressTimer) {

    clearInterval(
      scanProgressTimer
    );

    scanProgressTimer =
      null;

  }


  scanProgress.classList.remove(
    "complete"
  );


  if (scanProgressTitle) {

    scanProgressTitle.textContent =
      "This scan is taking a little longer than usual.";

  }


  if (scanProgressStatus) {

    scanProgressStatus.textContent =
      "The website is taking longer to analyse. Please keep this page open while we finish your scan.";

  }


  if (scanProgressPercent) {

    scanProgressPercent.textContent =
      "Still working…";

  }


  /*
   * Hold the progress bar at its current position.
   */

  if (scanProgressFill) {

    scanProgressFill.style.width =
      `${scanProgressValue}%`;

  }

}

function showScanProgressFinalTimeout() {

  stopScanProgress();

  if (!scanProgress) {
    return;
  }

  scanProgress.classList.remove(
    "complete"
  );

  if (scanProgressTitle) {

    scanProgressTitle.textContent =
      "The scan is still running.";

  }

  if (scanProgressStatus) {

    scanProgressStatus.textContent =
      "The scan is still running. Please keep this page open while we finish processing the website.";

  }

  if (scanProgressPercent) {

    scanProgressPercent.textContent =
      "Still working…";

  }

  if (scanProgressFill) {

    scanProgressFill.style.width =
      `${scanProgressValue}%`;

  }

}


 function advanceScanProgress() {

   const nextStageIndex =
     scanProgressStep + 1;

   if (
     nextStageIndex >=
     scanProgressStages.length
   ) {

     /*
      * Hold at the final preparation stage until
      * the real scan request completes.
      */

     return;

   }


   const stage =
     scanProgressStages[
       nextStageIndex
     ];


   scanProgressStep =
     nextStageIndex;


   updateScanProgress(
     stage.progress,
     stage.step,
     stage.title,
     stage.status
   );

 }


 function updateScanProgress(
   progress,
   activeStep,
   title,
   status
 ) {

   if (!scanProgress) {
     return;
   }


   scanProgressValue =
     Math.max(
       0,
       Math.min(
         100,
         progress
       )
     );


   if (scanProgressFill) {

     scanProgressFill.style.width =
       `${scanProgressValue}%`;

   }


   if (scanProgressPercent) {

     scanProgressPercent.textContent =
       `${scanProgressValue}%`;

   }


   if (scanProgressTitle) {

     scanProgressTitle.textContent =
       title;

   }


   if (scanProgressStatus) {

     scanProgressStatus.textContent =
       status;

   }


   scanProgressSteps.forEach(
     (stepElement, index) => {

       stepElement.classList.remove(
         "active",
         "complete"
       );


       const icon =
         stepElement.querySelector(
           ".scan-step-icon"
         );


       if (index < activeStep) {

         stepElement.classList.add(
           "complete"
         );

         if (icon) {
           icon.textContent =
             "✓";
         }

       } else if (
         index === activeStep
       ) {

         stepElement.classList.add(
           "active"
         );

         if (icon) {
           icon.textContent =
             "●";
         }

       } else {

         if (icon) {
           icon.textContent =
             "○";
         }

       }

     }
   );

 }


 function completeScanProgress() {

  if (!scanProgress) {
    return;
  }


  /*
   * The scan has completed normally.
   *
   * Stop the progress system completely so the
   * 90-second warning and 180-second safety timer
   * cannot fire after successful completion.
   */

  stopScanProgress();


  scanProgressValue =
    100;


  if (scanProgressFill) {

    scanProgressFill.style.width =
      "100%";

  }


  if (scanProgressPercent) {

    scanProgressPercent.textContent =
      "100%";

  }


  if (scanProgressTitle) {

    scanProgressTitle.textContent =
      "Scan complete";

  }


  if (scanProgressStatus) {

    scanProgressStatus.textContent =
      "Your website health report is ready.";

  }


  scanProgressSteps.forEach(
    stepElement => {

      stepElement.classList.remove(
        "active"
      );

      stepElement.classList.add(
        "complete"
      );


      const icon =
        stepElement.querySelector(
          ".scan-step-icon"
        );


      if (icon) {

        icon.textContent =
          "✓";

      }

    }
  );


  scanProgress.classList.add(
    "complete"
  );


  /*
   * Give the user a brief visual confirmation before
   * the existing results section takes over.
   */

  setTimeout(
    () => {

      if (scanProgress) {

        scanProgress.hidden =
          true;

      }

    },
    700
  );

}


 function stopScanProgress() {

  scanProgressRunning =
    false;


  if (scanProgressTimer) {

    clearInterval(
      scanProgressTimer
    );

    scanProgressTimer =
      null;

  }


  if (scanProgressWarningTimer) {

    clearTimeout(
      scanProgressWarningTimer
    );

    scanProgressWarningTimer =
      null;

  }


  if (scanProgressSafetyTimer) {

    clearTimeout(
      scanProgressSafetyTimer
    );

    scanProgressSafetyTimer =
      null;

  }

}


 function failScanProgress() {

   stopScanProgress();

   if (!scanProgress) {
     return;
   }


   /*
    * Don't show "100%" on a failed scan.
    * Leave the error handling to the existing scanner.
    */

   scanProgress.classList.remove(
     "complete"
   );

 }


 function watchExistingScanRequest() {

   if (!scanButton) {
     return;
   }


   /*
    * We use the existing button's disabled state to determine
    * when the existing scanner has finished.
    *
    * This means we don't have to modify the working fetch()
    * code above.
    */

   const progressWatcher =
     setInterval(
       () => {

         if (
           scanProgressRunning &&
           scanButton.disabled === false
         ) {

           clearInterval(
             progressWatcher
           );

           /*
            * Wait one tick so the existing scanner has time
            * to finish rendering its results.
            */

           setTimeout(
             () => {

               if (
                 results.hidden === false
               ) {

                 completeScanProgress();

               } else {

                 failScanProgress();

               }

             },
             100
           );

         }

       },
       150
     );


   /*
    * Safety timeout.
    *
    * If something unexpected happens and the existing
    * scanner never re-enables the button, this watcher
    * must not run forever.
    */

   setTimeout(
     () => {

       clearInterval(
         progressWatcher
       );

     },
     10 * 60 * 1000
   );

 }


 function initScanProgress() {

   if (!form || !scanProgress) {
     return;
   }


   /*
    * Capture phase runs before the existing submit listener.
    *
    * Therefore we can start the progress UI without replacing
    * or editing the existing scan function.
    */

   form.addEventListener(
     "submit",
     () => {

       const url =
         urlInput.value.trim();

       if (!url) {
         return;
       }

       startScanProgress(
         url
       );

       watchExistingScanRequest();

     },
     true
   );

 }


 initScanProgress();

});
