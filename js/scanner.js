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

      console.log(
        "FULL SCAN DATA:",
        data
      );

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


  newScanButton.addEventListener("click", () => {
    results.hidden = true;
    hideError();

    urlInput.value = "";

    urlInput.focus();
  });


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
      mobile: "Mobile",
      accessibility: "Accessibility",
      technical: "Technical",
      business: "Business"
    };

    const categoryOrder = [
      "seo",
      "mobile",
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
      "The scan could not be completed in time.";

  }


  if (scanProgressStatus) {

    scanProgressStatus.textContent =
      "The website is taking too long to analyse. Please try the scan again.";

  }


  if (scanProgressPercent) {

    scanProgressPercent.textContent =
      "Scan paused";

  }


  /*
   * Keep the progress bar at its current position.
   */

  if (scanProgressFill) {

    scanProgressFill.style.width =
      `${scanProgressValue}%`;

  }


  /*
   * Create the recovery controls once.
   */

  let timeoutActions =
    document.getElementById(
      "scanProgressTimeoutActions"
    );


  if (!timeoutActions) {

    timeoutActions =
      document.createElement(
        "div"
      );

    timeoutActions.id =
      "scanProgressTimeoutActions";

    timeoutActions.className =
      "scan-progress-timeout-actions";


    const message =
      document.createElement(
        "p"
      );

    message.className =
      "scan-progress-timeout-message";

    message.textContent =
      "The scan could not be completed within the available time. Please try again.";


    timeoutActions.appendChild(
      message
    );


    const retryButton =
      document.createElement(
        "button"
      );

    retryButton.type =
      "button";

    retryButton.className =
      "scan-progress-retry";

    retryButton.textContent =
      "Try Again";


    retryButton.addEventListener(
      "click",
      () => {

        window.location.reload();

      }
    );


    timeoutActions.appendChild(
      retryButton
    );


    scanProgress.appendChild(
      timeoutActions
    );

  }


  timeoutActions.hidden =
    false;

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

  if (downloadReportButton) {

    downloadReportButton.addEventListener(
      "click",
      downloadWebsiteReport
    );

  }

});
