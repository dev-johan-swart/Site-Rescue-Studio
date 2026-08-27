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

  const downloadReportButton =
    document.getElementById("downloadReportButton");

  const downloadReportText =
    document.getElementById("downloadReportText");

  const downloadReportSpinner =
    document.getElementById("downloadReportSpinner");

  let latestScanData = null;
  
  
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
  
  
      const data =
        await response.json();
  
  
      if (!response.ok || !data.success) {
  
        throw new Error(
          data.error ||
          "The website could not be scanned."
        );
  
      }

      latestScanData = data;

      console.log("FULL SCAN DATA:", data);
  
      renderResults(data);
  
      renderRecommendations(
        data.recommendations
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

  async function downloadWebsiteReport() {

    if (!latestScanData) {
  
      showError(
        "Please complete a website scan first."
      );
  
      return;
    }
  
  
    downloadReportButton.disabled = true;
  
    downloadReportText.hidden = true;
  
    downloadReportSpinner.hidden = false;
  
  
    try {
  
      const response =
        await fetch("/api/report", {
  
          method: "POST",
  
          headers: {
            "Content-Type": "application/json"
          },
  
          body:
            JSON.stringify(
              latestScanData
            )
  
        });
  
  
      if (!response.ok) {
  
        let message =
          "We could not generate the report.";
  
        try {
  
          const errorData =
            await response.json();
  
          message =
            errorData.error ||
            message;
  
        } catch {
  
          // Ignore JSON parsing errors.
  
        }
  
        throw new Error(message);
  
      }
  
  
      const blob =
        await response.blob();
  
  
      if (!blob.size) {
  
        throw new Error(
          "The generated report was empty."
        );
  
      }
  
  
      const downloadUrl =
        URL.createObjectURL(blob);
  
  
      const link =
        document.createElement("a");
  
  
      link.href =
        downloadUrl;
  
  
      link.download =
        "website-rescue-report.pdf";
  
  
      document.body.appendChild(link);
  
      link.click();
  
      link.remove();
  
  
      URL.revokeObjectURL(
        downloadUrl
      );
  
  
    } catch (error) {
  
      console.error(
        "Report download error:",
        error
      );
  
  
      showError(
        error.message ||
        "We could not generate your Website Rescue Report."
      );
  
  
    } finally {
  
      downloadReportButton.disabled =
        false;
  
      downloadReportText.hidden =
        false;
  
      downloadReportSpinner.hidden =
        true;
  
    }
  
  }


  newScanButton.addEventListener(
    "click",
    () => {

      results.hidden = true;

      urlInput.focus();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    }
  );


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

    errorBox.textContent =
      message;

    errorBox.hidden = false;

  }


  function hideError() {

    errorBox.textContent = "";

    errorBox.hidden = true;

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


  function renderCheckSections(checks) {

    const container =
      document.getElementById(
        "checkSections"
      );
  
    container.innerHTML = "";
  
    const labels = {
      seo: "SEO",
      accessibility: "Accessibility",
      technical: "Technical",
      business: "Business"
    };
  
    const categoryOrder = [
      "seo",
      "accessibility",
      "technical",
      "business"
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
            Performance Details
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
  
    container.innerHTML = `
  
      <section class="check-section">
  
        <h3>
          Google Performance Snapshot
        </h3>
  
        <div class="check">
  
          <div class="check-info">
            <strong>
              Largest Contentful Paint
            </strong>
  
            <span>
              Main content loading metric
            </span>
          </div>
  
          <span class="check-status pass">
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
  
          <span class="check-status pass">
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
  
          <span class="check-status pass">
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
  
          <span class="check-status pass">
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

  if (downloadReportButton) {

    downloadReportButton.addEventListener(
      "click",
      downloadWebsiteReport
    );
  
  }

});