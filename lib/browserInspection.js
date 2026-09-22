const chromium = require("@sparticuz/chromium");

const BROWSER_TIMEOUT = 20000;

let puppeteer;

const LOCAL_CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function buildBrowserInspectionFindings(
  inspection
) {
  const findings = [];

  if (
    !inspection ||
    !inspection.available
  ) {
    return findings;
  }

  const sameOriginFailures =
  (
    inspection.failedResources ||
    []
  ).filter(
    resource =>
      resource.classification ===
      "same-origin"
  );

const resourceGroups =
  new Map();

sameOriginFailures.forEach(
  resource => {
    const key =
      resource.url;

    const existing =
      resourceGroups.get(key);

    if (!existing) {
      resourceGroups.set(
        key,
        resource
      );
      return;
    }

    // Prefer an actual HTTP error over
    // a secondary request-failed event.
    if (
      !existing.status &&
      resource.status
    ) {
      resourceGroups.set(
        key,
        resource
      );
    }
  }
);

Array.from(
  resourceGroups.values()
).forEach(
  resource => {
    const status =
      resource.status;

    const resourceType =
      resource.resourceType ||
      "resource";

    const resourceName =
      resource.url
        ?.split("?")[0]
        ?.split("/")
        .pop() ||
      resource.url;

    const failureText =
      status
        ? `returned HTTP ${status}`
        : "failed to load";

    findings.push({
      id:
        "browser-resource-failure",
      title:
        "Confirmed browser resource failure",
      description:
        `A same-origin ${resourceType} ${failureText}: ${resourceName}. This may affect styling, functionality or page presentation. Visible impact was not automatically confirmed.`,
      status:
        "fail",
      severity:
        status >= 500
          ? "high"
          : "medium",
      evidence: {
        url:
          resource.url,
        status:
          status || null,
        resourceType
      }
    });
  }
);


  const formFailures =
    Array.isArray(inspection.formReliability)
      ? inspection.formReliability
      : [];

  formFailures
    .filter(form => form?.verified === true)
    .forEach(form => {
      const insecure =
        form.reason === "insecure-http-action";

      findings.push({
        id: "browser-form-reliability",
        title:
          insecure
            ? "Insecure form submission endpoint"
            : "Confirmed contact form endpoint issue",
        description:
          insecure
            ? `A detected form on an HTTPS page submits to an HTTP endpoint (${form.action}). The form was inspected only and was not submitted.`
            : form.statusCode
              ? `A detected GET form points to ${form.action}, which returned HTTP ${form.statusCode} when checked without submitting form data. The form itself was not submitted.`
              : `A detected GET form points to ${form.action}, but the endpoint could not be reached. The form itself was not submitted.`,
        status: "fail",
        severity:
          insecure
            ? "high"
            : "medium",
        evidence: form
      });
    });

  const horizontalOverflow =
    (
      inspection.layoutWarnings ||
      []
    ).find(
      warning =>
        warning.type ===
        "horizontal-overflow"
    );

  if (horizontalOverflow) {
    findings.push({
      id:
        "browser-horizontal-overflow",
      title:
        "Possible horizontal layout overflow",
      description:
        `The rendered page is wider than the browser viewport (${horizontalOverflow.documentWidth}px content width versus ${horizontalOverflow.viewportWidth}px viewport width). This can cause horizontal scrolling or clipped content on some screen sizes.`,
      status:
        "warning",
      severity:
        "medium",
      evidence:
        horizontalOverflow
    });
  }

  return findings;
}

function classifyResource(
  resourceUrl,
  pageUrl
) {
  try {
    const resourceHost =
      new URL(
        resourceUrl
      ).hostname
        .toLowerCase();

    const pageHost =
      new URL(
        pageUrl
      ).hostname
        .toLowerCase();

    if (
      resourceHost ===
      pageHost
    ) {
      return "same-origin";
    }

    const ignoredHosts = [
      "google-analytics.com",
      "analytics.google.com",
      "googletagmanager.com",
      "googleadservices.com",
      "doubleclick.net",
      "googlesyndication.com",
      "facebook.net",
      "connect.facebook.net"
    ];

    if (
      ignoredHosts.some(
        host =>
          resourceHost === host ||
          resourceHost.endsWith(
            `.${host}`
          )
      )
    ) {
      return "third-party-tracking";
    }

    return "third-party";
  } catch {
    return "unknown";
  }
}


async function collectRenderedForms(page) {
  /*
   * FORM DETECTION IS READ-ONLY.
   *
   * This function only inspects the rendered DOM. It never clicks,
   * submits, fills, or dispatches events against form controls.
   *
   * It recognises:
   * - native <form> elements;
   * - form-like groups of visible fields without <form>;
   * - submit controls associated with a form, including external
   *   controls using the HTML form="..." attribute;
   * - semantic labels, placeholders, aria labels and nearby text;
   * - same-origin iframe forms when the frame is accessible.
   */
  const inspectDocument = async context => {
    try {
      return await context.evaluate(() => {
        const isVisible = element => {
          if (!element) return false;

          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0
          );
        };

        const clean = value =>
          String(value || "")
            .replace(/\s+/g, " ")
            .trim();

        const controlDescriptor = control => {
          const id = control.getAttribute("id") || "";
          const name = control.getAttribute("name") || "";
          const placeholder = control.getAttribute("placeholder") || "";
          const ariaLabel = control.getAttribute("aria-label") || "";

          const associatedLabels = id
            ? Array.from(
                document.querySelectorAll(
                  `label[for="${CSS.escape(id)}"]`
                )
              )
                .map(label => clean(label.innerText || label.textContent))
                .filter(Boolean)
            : [];

          const parentLabel = control.closest("label");
          if (parentLabel) {
            const labelText = clean(
              parentLabel.innerText || parentLabel.textContent
            );
            if (labelText) {
              associatedLabels.push(labelText);
            }
          }

          return {
            type: (
              control.getAttribute("type") ||
              control.tagName.toLowerCase()
            ).toLowerCase(),
            name,
            placeholder,
            ariaLabel,
            label: associatedLabels.join(" "),
            text: clean(
              [
                name,
                placeholder,
                ariaLabel,
                associatedLabels.join(" ")
              ].join(" ")
            )
          };
        };

        const describeCandidate = (
          candidate,
          synthetic = false
        ) => {
          const controls = Array.from(
            candidate.querySelectorAll(
              'input, textarea, select, [contenteditable="true"]'
            )
          ).filter(isVisible);

          const fields = controls.map(controlDescriptor);

          const candidateText = clean(
            [
              candidate.innerText || candidate.textContent || "",
              ...fields.map(field => field.text)
            ].join(" ")
          );

          const text = candidateText.toLowerCase();

          const hasMessage = fields.some(field =>
            field.type === "textarea" ||
            /message|comment|enquir|inquir|question|details|request|description|subject/i.test(
              field.text
            )
          );

          const hasEmail = fields.some(field =>
            field.type === "email" ||
            /email|e-mail/i.test(field.text)
          );

          const hasPhone = fields.some(field =>
            field.type === "tel" ||
            /phone|telephone|mobile|cell|contact[-_ ]?number/i.test(
              field.text
            )
          );

          const hasName = fields.some(field =>
            /(^|[-_ ])name|full.?name|first.?name|surname/i.test(
              field.text
            )
          );

          const hasPassword = fields.some(
            field => field.type === "password"
          );

          const hasSearch = fields.some(field =>
            field.type === "search" ||
            /(^|[-_ ])search|(^|[-_ ])query|(^|[-_ ])q$/i.test(
              field.name
            )
          );

          const quote =
            /request\s*(a\s*)?quote|get\s*(a\s*)?quote|quote/i.test(
              text
            );

          const booking =
            /book|booking|appointment|schedule/i.test(text);

          const enquiry =
            /contact|enquir|inquir|reach\s*us|get\s*in\s*touch|send\s*message|request/i.test(
              text
            );

          const candidateId =
            candidate.id || "";

          const associatedSubmitControls =
            candidateId
              ? Array.from(
                  document.querySelectorAll(
                    `button[form="${CSS.escape(candidateId)}"], input[type="submit"][form="${CSS.escape(candidateId)}"], input[type="image"][form="${CSS.escape(candidateId)}"]`
                  )
                )
              : [];

          const submitControls = [
            ...Array.from(
              candidate.querySelectorAll(
                'button, input[type="submit"], input[type="image"], [role="button"]'
              )
            ),
            ...associatedSubmitControls
          ]
            .filter(isVisible)
            .filter(element => {
              const tagName =
                element.tagName.toLowerCase();

              const inputType =
                (element.getAttribute("type") || "").toLowerCase();

              /*
               * Native submit/image controls are definitive evidence
               * of a submission control even when their visible value
               * is empty or generated by CSS.
               *
               * Other buttons/role=button controls require contextual
               * action wording so search/login/navigation controls are
               * not mistaken for form submission controls.
               */
              if (
                tagName === "input" &&
                (inputType === "submit" ||
                  inputType === "image")
              ) {
                return true;
              }

              return /send|submit|message|quote|book|appointment|request|enquir|inquir|contact|continue|next/i.test(
                clean(
                  element.innerText ||
                  element.value ||
                  element.getAttribute("aria-label") ||
                  element.getAttribute("title") ||
                  ""
                )
              );
            });

          const uniqueSubmitControls =
            Array.from(new Set(submitControls));

          const hasSubmitControl =
            uniqueSubmitControls.length > 0;

          const submitText =
            uniqueSubmitControls
              .map(element =>
                clean(
                  element.innerText ||
                  element.value ||
                  element.getAttribute("aria-label") ||
                  element.getAttribute("title") ||
                  ""
                )
              )
              .filter(Boolean)
              .join(" ");

          const searchOnly =
            hasSearch &&
            !hasMessage &&
            !hasEmail &&
            !hasPhone &&
            !hasName &&
            !quote &&
            !booking &&
            !enquiry;

          let type = "generic";

          if (searchOnly) {
            type = "search";
          } else if (
            hasPassword &&
            !hasMessage &&
            !quote &&
            !booking &&
            !enquiry
          ) {
            type = "login";
          } else if (quote) {
            type = "quote";
          } else if (booking) {
            type = "booking";
          } else if (
            /subscribe|newsletter|updates|mailing list/i.test(text) &&
            hasEmail &&
            !hasMessage &&
            !quote &&
            !booking &&
            !enquiry
          ) {
            type = "newsletter";
          } else if (enquiry || hasMessage) {
            type = "contact";
          }

          const contactIntent =
            !searchOnly &&
            type !== "login" &&
            type !== "newsletter" &&
            (
              hasMessage ||
              hasName ||
              hasPhone ||
              hasEmail ||
              quote ||
              booking ||
              enquiry
            );

          const confidence =
            (
              hasMessage &&
              (hasEmail || hasPhone || hasName)
            ) ||
            (hasName && hasEmail) ||
            quote ||
            booking
              ? "high"
              : contactIntent
                ? "medium"
                : "low";

          return {
            url: window.location.href,
            source: "browser-rendered",
            type,
            confidence,
            contactIntent,
            action: candidate.action || null,
            method: (candidate.method || "get").toUpperCase(),
            fields: fields.length,
            inputCount: fields.length,
            fieldTypes: fields.map(field => field.type),
            fieldLabels: fields
              .map(field =>
                field.label ||
                field.name ||
                field.placeholder ||
                field.ariaLabel ||
                ""
              )
              .filter(Boolean)
              .slice(0, 20),
            hasSubmit: hasSubmitControl,
            hasSubmitControl,
            submitText: submitText || null,
            synthetic
          };
        };

        const nativeForms = Array.from(
          document.querySelectorAll("form")
        )
          .filter(isVisible)
          .map(form => describeCandidate(form, false));

        /*
         * Find form-like groups without relying on a literal <form>.
         * The candidate is the smallest useful ancestor containing
         * multiple visible controls plus strong form/contact language.
         */
        const syntheticForms = [];
        const seenContainers = new Set();

        const controls = Array.from(
          document.querySelectorAll(
            'input, textarea, select, [contenteditable="true"]'
          )
        ).filter(isVisible);

        controls.forEach(control => {
          let container = control.parentElement;

          while (
            container &&
            container !== document.body
          ) {
            const containerControls = Array.from(
              container.querySelectorAll(
                'input, textarea, select, [contenteditable="true"]'
              )
            ).filter(isVisible);

            if (
              containerControls.length >= 2 &&
              containerControls.length <= 15
            ) {
              const descriptorFields =
                containerControls.map(controlDescriptor);

              const containerText = clean(
                [
                  container.innerText || container.textContent || "",
                  ...descriptorFields.map(field => field.text)
                ].join(" ")
              );

              const hasContactLanguage =
                /contact|enquir|inquir|send\s*message|get\s*in\s*touch|request\s*(a\s*)?quote|quote|appointment|booking|message|your\s*details/i.test(
                  containerText
                );

              const hasStrongFieldSet =
                descriptorFields.some(field =>
                  field.type === "textarea" ||
                  /message|enquir|inquir|question|details|request/i.test(
                    field.text
                  )
                ) &&
                descriptorFields.some(field =>
                  field.type === "email" ||
                  field.type === "tel" ||
                  /email|phone|mobile|contact[-_ ]?number/i.test(
                    field.text
                  )
                );

              const submitControls = Array.from(
                container.querySelectorAll(
                  'button, input[type="submit"], input[type="image"], [role="button"], a[href]'
                )
              )
                .filter(isVisible)
                .filter(element =>
                  /send|submit|message|quote|book|appointment|request|enquir|inquir|contact|continue|next/i.test(
                    clean(
                      element.innerText ||
                      element.value ||
                      element.getAttribute("aria-label") ||
                      element.getAttribute("title") ||
                      ""
                    )
                  )
                );

              if (
                hasContactLanguage &&
                (
                  hasStrongFieldSet ||
                  submitControls.length > 0
                ) &&
                !seenContainers.has(container)
              ) {
                seenContainers.add(container);
                syntheticForms.push(
                  describeCandidate(container, true)
                );
              }

              /*
               * Stop at the first bounded useful container. Moving
               * higher can accidentally combine a form with unrelated
               * page sections.
               */
              if (
                hasContactLanguage ||
                containerControls.length >= 4
              ) {
                break;
              }
            }

            container = container.parentElement;
          }
        });

        return nativeForms.concat(syntheticForms);
      });
    } catch {
      return [];
    }
  };

  const forms = await inspectDocument(page);

  /*
   * Inspect accessible frames too. Embedded same-origin forms are
   * still read-only DOM inspection; cross-origin frames are simply
   * skipped by the browser's normal security boundary.
   */
  const frameForms = [];

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) {
      continue;
    }

    try {
      const formsInFrame = await inspectDocument(frame);
      frameForms.push(
        ...formsInFrame.map(form => ({
          ...form,
          source: "browser-rendered-frame",
          url: frame.url() || form.url
        }))
      );
    } catch {
      // Cross-origin or unavailable frames are intentionally ignored.
    }
  }

  return forms.concat(frameForms);
}
function createEmptyInspection() {
  return {
    attempted: true,
    available: false,
    renderedTitle: null,
    renderedHeadings: [],
    renderedH1Count: 0,
    responsiveCssDetected: false,
    renderedContactLinks: [],
    renderedLinks: [],
    renderedForms: [],
    formReliability: [],
    renderedButtons: [],
    renderedInternalRoutes: [],
    routeHealth: [],
    renderedLinkCount: 0,
    consoleErrors: [],
    failedResources: [],
    layoutWarnings: [],
    lcpElement: null,
    durationMs: null,
    unavailableReason: null
  };
}

async function runBrowserInspection(url) {
  const startedAt = Date.now();

  const inspection =
    createEmptyInspection();

  let browser = null;

  try {
    if (!puppeteer) {
      const puppeteerModule = await import("puppeteer-core");
      puppeteer = puppeteerModule.default || puppeteerModule;
    }

    const isWindows = process.platform === "win32";
    const executablePath = isWindows ? LOCAL_CHROME_PATH : await chromium.executablePath();
    if (!executablePath) {
      throw new Error("No Chromium executable was available for browser inspection.");
    }

    browser = await puppeteer.launch({
      args: isWindows ? [] : chromium.args,
      executablePath,
      defaultViewport: {
        width: 1365,
        height: 900,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false
      },
      headless: true
    });

    inspection.available = true;

    const page =
      await browser.newPage();

    const consoleErrors = [];

    const failedResources = [];

    page.on(
      "console",
      message => {
        if (
          message.type() ===
          "error"
        ) {
          consoleErrors.push(
            cleanText(
              message.text()
            )
          );
        }
      }
    );

    page.on(
      "requestfailed",
      request => {
        const resourceUrl =
          request.url();

        const classification =
          classifyResource(
            resourceUrl,
            url
          );

        failedResources.push({
          url:
            resourceUrl,
          resourceType:
            request.resourceType(),
          failure:
            request.failure()
              ?.errorText ||
            "Request failed",
          classification
        });
      }
    );

    page.on(
      "response",
      response => {
        const status =
          response.status();

        if (status >= 400) {
          const resourceUrl =
            response.url();

          const request =
            response.request();

          failedResources.push({
            url:
              resourceUrl,
            status,
            resourceType:
              request.resourceType(),
            classification:
              classifyResource(
                resourceUrl,
                url
              ),
            impact:
              ["document", "script", "stylesheet", "xhr", "fetch"].includes(request.resourceType())
                ? "high"
                : ["image", "font", "media"].includes(request.resourceType())
                  ? "medium"
                  : "low"
          });
        }
      }
    );

    try {
      await page.goto(
        url,
        {
          waitUntil:
            "domcontentloaded",
          timeout:
            BROWSER_TIMEOUT
        }
      );
    } catch (error) {
      if (
        !String(
          error?.message || ""
        ).toLowerCase()
          .includes("timeout")
      ) {
        throw error;
      }
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          2500
        )
    );

    inspection.renderedTitle =
      await page.title();

    inspection.renderedHeadings =
      await page.$$eval(
        "h1,h2,h3",
        elements =>
          elements
            .map(
              element => ({
                tag:
                  element.tagName
                    .toLowerCase(),
                text:
                  element.innerText
                    ?.replace(
                      /\s+/g,
                      " "
                    )
                    .trim() ||
                  ""
              })
            )
            .filter(
              item =>
                item.text
            )
      );

    inspection.renderedH1Count =
      await page.$$eval(
        "h1",
        elements =>
          elements
            .map(
              element =>
                element.innerText
                  ?.replace(
                    /\s+/g,
                    " "
                  )
                  .trim() ||
                ""
            )
            .filter(
              text =>
                text
            ).length
      );

    inspection.responsiveCssDetected =
      await page.evaluate(() => {
        try {
          const stylesheets =
            Array.from(
              document.styleSheets
            );

          for (
            const stylesheet of
              stylesheets
          ) {
            try {
              const rules =
                Array.from(
                  stylesheet.cssRules ||
                    []
                );

              for (
                const rule of
                  rules
              ) {
                if (
                  rule.type ===
                    CSSRule.MEDIA_RULE ||
                  rule.type ===
                    CSSRule.CONTAINER_RULE
                ) {
                  return true;
                }
              }
            } catch {
              // Cross-origin stylesheets may block CSSOM access.
            }
          }

          const inlineStyles =
            Array.from(
              document.querySelectorAll(
                "style"
              )
            )
              .map(
                style =>
                  style.textContent ||
                  ""
              )
              .join("\n");

          return /@media\b|@container\b/i.test(
            inlineStyles
          );
        } catch {
          return false;
        }
      });

      inspection.renderedContactLinks =
      await page.$$eval(
        'a[href], button, [role="button"], [data-href], [data-url], [data-route], [onclick]',
        elements => {
          const contactPattern =
            /contact|call|phone|whatsapp|get\s*in\s*touch|enquir|quote|booking|book\s*now|appointment|reach\s*us/i;

          const extractDestination =
            element => {
              const directValue =
                element.getAttribute("href") ||
                element.getAttribute("data-href") ||
                element.getAttribute("data-url") ||
                element.getAttribute("data-route") ||
                "";

              if (directValue.trim()) {
                return directValue.trim();
              }

              const onclick =
                element.getAttribute("onclick") ||
                "";

              const match =
                onclick.match(
                  /(?:location(?:\.href|\.assign|\.replace)|window\.open|navigateTo|goTo|openPage|showPage|loadPage)\s*\(\s*['"]([^'"]+)['"]/i
                );

              return match
                ? match[1].trim()
                : "";
            };

          return elements
            .map(element => {
              const href =
                element.href ||
                extractDestination(element) ||
                "";

              const text =
                element.innerText
                  ?.replace(
                    /\s+/g,
                    " "
                  )
                  .trim() ||
                "";

              let type = null;

              if (
                href.startsWith(
                  "tel:"
                )
              ) {
                type = "phone";
              } else if (
                href.startsWith(
                  "mailto:"
                )
              ) {
                type = "email";
              } else if (
                /wa\.me|whatsapp/i.test(
                  href
                ) ||
                /wa\.me|whatsapp/i.test(
                  element.outerHTML || ""
                )
              ) {
                type = "whatsapp";
              } else if (
                contactPattern.test(
                  text
                ) ||
                contactPattern.test(
                  href
                ) ||
                contactPattern.test(
                  element.outerHTML || ""
                )
              ) {
                type = "contact";
              }

              return {
                href,
                text,
                type
              };
            })
            .filter(
              item =>
                item.type
            );
        }
      );

    inspection.renderedForms =
      await collectRenderedForms(page);

    inspection.formReliability = [];

    for (const form of inspection.renderedForms) {
      const action = String(form?.action || "").trim();
      if (!action) {
        continue;
      }

      const formMethod =
        String(form?.method || "GET").trim().toUpperCase() || "GET";

      try {
        const parsed = new URL(action, url);

        if (
          new URL(url).protocol === "https:" &&
          parsed.protocol === "http:"
        ) {
          inspection.formReliability.push({
            action: parsed.href,
            statusCode: null,
            finalUrl: parsed.href,
            method: formMethod,
            verified: true,
            reason: "insecure-http-action"
          });
          continue;
        }

        /*
         * Non-invasive endpoint probing uses GET only.
         *
         * A GET response cannot prove that a POST/PUT/PATCH/DELETE
         * form submission works. Therefore an unsuccessful GET probe
         * for a non-GET form is retained as diagnostic evidence only
         * and is never promoted to a confirmed form failure.
         */
        const response = await fetch(parsed.href, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent": "Site Rescue Studio Website Health Scanner/3.0"
          },
          signal: AbortSignal.timeout(8000)
        });

        const unsuccessfulProbe =
          response.status === 404 ||
          response.status === 410 ||
          response.status >= 500;

        inspection.formReliability.push({
          action: parsed.href,
          statusCode: response.status,
          finalUrl: response.url || parsed.href,
          method: formMethod,
          probeMethod: "GET",
          verified:
            formMethod === "GET" &&
            unsuccessfulProbe,
          reason:
            formMethod === "GET"
              ? unsuccessfulProbe
                ? "get-endpoint-failure"
                : "get-endpoint-reachable"
              : unsuccessfulProbe
                ? "submission-method-not-verified"
                : "endpoint-reachable-by-get-only"
        });
      } catch (error) {
        inspection.formReliability.push({
          action: parsed.href,
          statusCode: null,
          method: formMethod,
          probeMethod: "GET",
          verified: formMethod === "GET",
          reason:
            formMethod === "GET"
              ? "get-endpoint-unreachable"
              : "submission-method-not-verified",
          error:
            String(error?.message || "request failed")
        });
      }
    }

    /*
     * Preserve the complete rendered-link evidence separately
     * from the contact-link subset. The server-side HTML crawler
     * can legitimately see zero links on JavaScript-rendered sites,
     * while the browser sees the actual navigation links visitors
     * can use.
     */
    inspection.renderedLinks =
      await page.$$eval(
        "a[href], [data-href], [data-url], [data-route], [onclick]",
        elements => {
          return elements
            .map(element => {
              const href =
                element.href ||
                element.getAttribute("href") ||
                element.getAttribute("data-href") ||
                element.getAttribute("data-url") ||
                element.getAttribute("data-route") ||
                "";

              const text =
                element.innerText
                  ?.replace(/\s+/g, " ")
                  .trim() ||
                element.getAttribute("aria-label") ||
                "";

              return {
                href: String(href || "").trim(),
                text: String(text || "").trim(),
                tag:
                  element.tagName
                    ?.toLowerCase() ||
                  "a"
              };
            })
            .filter(item => item.href || item.text)
            .slice(0, 200);
        }
      );

    inspection.renderedLinkCount =
      inspection.renderedLinks.length;

    inspection.renderedButtons =
      await page.$$eval(
        "button, a",
        elements =>
          elements
            .map(element => ({
              tag:
                element.tagName
                  .toLowerCase(),
              text:
                element.innerText
                  ?.replace(
                    /\s+/g,
                    " "
                  )
                  .trim() ||
                "",
              href:
                element.href ||
                null
            }))
            .filter(
              item =>
                item.tag ===
                  "button" ||
                item.text
            )
            .slice(
              0,
              100
            )
      );

          /*
     * RENDERED INTERNAL ROUTE HEALTH
     *
     * The server crawler can miss navigation links
     * created by JavaScript. The browser already has
     * the rendered DOM, so use those links as route
     * discovery and test the direct URLs here.
     *
     * This does not start another crawler or browser.
     */

    const renderedInternalRoutes =
    await page.$$eval(
      "a[href], [data-href], [data-url], [data-route], [onclick]",
      elements => {
        const currentOrigin =
          window.location.origin;

        const seen =
          new Set();

        const extractDestination =
          element => {
            const directValue =
              element.getAttribute("href") ||
              element.getAttribute("data-href") ||
              element.getAttribute("data-url") ||
              element.getAttribute("data-route") ||
              "";

            if (directValue.trim()) {
              return directValue.trim();
            }

            const onclick =
              element.getAttribute("onclick") ||
              "";

            const match =
              onclick.match(
                /(?:location(?:\.href|\.assign|\.replace)|window\.open|navigateTo|goTo|openPage|showPage|loadPage)\s*\(\s*['"]([^'"]+)['"]/i
              );

            return match
              ? match[1].trim()
              : "";
          };

        return elements
          .map(element => {
            const value =
              extractDestination(element);

            if (!value) {
              return null;
            }

            if (
              value.startsWith("#") ||
              value.startsWith("mailto:") ||
              value.startsWith("tel:") ||
              value.startsWith("javascript:")
            ) {
              return null;
            }

            try {
              const parsed =
                new URL(
                  value,
                  window.location.href
                );

              if (
                ![
                  "http:",
                  "https:"
                ].includes(
                  parsed.protocol
                )
              ) {
                return null;
              }

              if (
                parsed.origin !==
                currentOrigin
              ) {
                return null;
              }

              parsed.hash = "";

              const href =
                parsed.toString();

              if (seen.has(href)) {
                return null;
              }

              seen.add(href);

              return {
                href,
                text:
                  element.innerText
                    ?.replace(/\s+/g, " ")
                    .trim() ||
                  element.getAttribute("aria-label") ||
                  ""
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .slice(0, 30);
      }
    );

  inspection.renderedInternalRoutes =
    renderedInternalRoutes;

  inspection.routeHealth =
    await page.evaluate(
      async routes => {
        const results = [];

        for (
          const route of routes
        ) {
          const startedAt =
            Date.now();

          try {
            const response =
              await fetch(
                route.href,
                {
                  method: "GET",
                  redirect:
                    "follow",
                  credentials:
                    "same-origin",
                  cache:
                    "no-store"
                }
              );

            const finalUrl =
              response.url ||
              route.href;

            let status =
              "working";

            if (
              response.status ===
                403 ||
              response.status ===
                405 ||
              response.status ===
                429
            ) {
              status =
                "blocked";
            } else if (
              response.status >=
              400
            ) {
              status =
                "broken";
            } else if (
              finalUrl !==
              route.href
            ) {
              status =
                "redirected";
            }

            results.push({
              url:
                route.href,

              path:
                new URL(
                  route.href
                ).pathname,

              status,

              statusCode:
                response.status,

              finalUrl,

              redirected:
                finalUrl !==
                route.href,

              redirectedOffOrigin:
                (() => {
                  try {
                    return (
                      new URL(finalUrl).origin !==
                      new URL(route.href).origin
                    );
                  } catch {
                    return false;
                  }
                })(),

              responseTime:
                Date.now() -
                startedAt,

              anchorText:
                route.text
            });

          } catch (error) {

            results.push({
              url:
                route.href,

              path:
                new URL(
                  route.href
                ).pathname,

              status:
                "unreachable",

              statusCode:
                null,

              finalUrl:
                route.href,

              redirected:
                false,

              responseTime:
                Date.now() -
                startedAt,

              anchorText:
                route.text,

              error:
                error?.message ||
                "Route could not be reached."
            });
          }
        }

        return results;
      },
      renderedInternalRoutes
    );

    /*
     * --------------------------------------------------------
     * BOUNDED IMPORTANT-PAGE FORM INSPECTION
     * --------------------------------------------------------
     *
     * The homepage is inspected first. Then a very small,
     * explicitly bounded set of internal conversion/contact
     * routes discovered from the rendered navigation is
     * browser-rendered so forms that live on /contact,
     * /quote, /booking, etc. are not missed.
     *
     * This does not submit forms and does not start another
     * crawler. Maximum additional browser pages: 4.
     */
    const importantRoutePatterns = [
      /\/contact(?:[-_]?us)?(?:\/|$)/i,
      /\/(?:quote|get[-_]?a[-_]?quote|request[-_]?a[-_]?quote)(?:\/|$)/i,
      /\/(?:book|booking|appointment|schedule)(?:\/|$)/i,
      /\/(?:enquir(?:y|ies)|inquir(?:y|ies)|request)(?:\/|$)/i
    ];

    const importantRoutes =
      renderedInternalRoutes
        .map(route => {
          let path = "";

          try {
            path = new URL(route.href).pathname;
          } catch {}

          const routeHealthEntry =
            routeHealth.find(
              item =>
                item?.url === route.href
            );

          const matchedPattern =
            importantRoutePatterns.findIndex(
              pattern =>
                pattern.test(path) ||
                pattern.test(route.text || "")
            );

          return {
            ...route,
            path,
            priority:
              matchedPattern >= 0
                ? 100 - matchedPattern
                : 0,
            routeHealthEntry
          };
        })
        .filter(
          route =>
            route.priority > 0
        )
        .sort(
          (a, b) =>
            b.priority - a.priority
        )
        .slice(0, 4);

    for (
      const route of importantRoutes
    ) {
      let routeForms = [];

      try {
        /*
         * First use the site's own navigation so SPA/router handlers
         * get a chance to render the destination exactly as a visitor
         * would reach it.
         */
        const clicked =
          await page.evaluate(
            targetUrl => {
              const target =
                new URL(targetUrl);

              const normalisePath =
                value => {
                  try {
                    const parsed =
                      new URL(
                        value,
                        window.location.href
                      );

                    let pathname =
                      parsed.pathname || "/";

                    while (
                      pathname.length > 1 &&
                      pathname.endsWith("/")
                    ) {
                      pathname =
                        pathname.slice(0, -1);
                    }

                    return pathname;
                  } catch {
                    return "";
                  }
                };

              const targetPath =
                normalisePath(
                  target.href
                );

              const links =
                Array.from(
                  document.querySelectorAll(
                    "a[href], [data-href], [data-url], [data-route]"
                  )
                );

              const link =
                links.find(
                  element => {
                    const destination =
                      element.getAttribute("href") ||
                      element.getAttribute("data-href") ||
                      element.getAttribute("data-url") ||
                      element.getAttribute("data-route") ||
                      "";

                    return (
                      normalisePath(
                        destination
                      ) === targetPath
                    );
                  }
                );

              if (!link) {
                return false;
              }

              if (
                link.hasAttribute("target")
              ) {
                link.setAttribute(
                  "target",
                  "_self"
                );
              }

              link.setAttribute(
                "data-site-rescue-form-route-target",
                "true"
              );
              return true;
            },
            route.href
          );

        if (clicked) {
          const previousUrl =
            page.url();

          try {
            /*
             * This activates only the discovered internal navigation
             * link. It never targets, fills, clicks or submits a form
             * control.
             */
            await page.click(
              '[data-site-rescue-form-route-target="true"]'
            );
          } catch {}

          await new Promise(
            resolve =>
              setTimeout(resolve, 3500)
          );

          /*
           * Give client-side routers a little extra bounded time to
           * finish rendering after the navigation click.
           */
          if (
            page.url() === previousUrl
          ) {
            await new Promise(
              resolve =>
                setTimeout(resolve, 1500)
            );
          }

          routeForms =
            await collectRenderedForms(page);
        }

        /*
         * Some sites intercept normal clicks differently in a
         * headless browser, or render the destination from a server
         * response that is itself HTTP 404. If the click produced no
         * form evidence, make one bounded direct navigation attempt.
         * We inspect the rendered DOM regardless of the HTTP status;
         * the separate route-health check remains responsible for
         * reporting the direct HTTP result.
         */
        if (routeForms.length === 0) {
          try {
            await page.goto(
              route.href,
              {
                waitUntil:
                  "domcontentloaded",
                timeout:
                  BROWSER_TIMEOUT
              }
            );
          } catch (error) {
            if (
              !String(
                error?.message || ""
              )
                .toLowerCase()
                .includes("timeout")
            ) {
              throw error;
            }
          }

          await new Promise(
            resolve =>
              setTimeout(resolve, 3000)
          );

          /*
           * Give lazy-rendered forms a small additional opportunity
           * to appear without interacting with or submitting them.
           */
          try {
            await page.waitForSelector(
              "input, textarea, select",
              {
                visible: true,
                timeout: 3000
              }
            );
          } catch {}

          routeForms =
            await collectRenderedForms(page);
        }

        /*
         * A form may be rendered below the initial viewport. Scrolling
         * is non-interactive and helps expose lazy-rendered controls
         * before the final bounded collection attempt.
         */
        if (routeForms.length === 0) {
          await page.evaluate(() => {
            window.scrollTo(
              0,
              document.body.scrollHeight
            );
          });

          await new Promise(
            resolve =>
              setTimeout(resolve, 1000)
          );

          routeForms =
            await collectRenderedForms(page);
        }

        inspection.renderedForms.push(
          ...routeForms.map(
            form => ({
              ...form,
              url:
                page.url()
            })
          )
        );

        /*
         * Always restore the homepage before inspecting the next
         * important route so route state cannot leak between checks.
         */
        await page.goto(
          url,
          {
            waitUntil:
              "domcontentloaded",
            timeout:
              BROWSER_TIMEOUT
          }
        );

        await new Promise(
          resolve =>
            setTimeout(resolve, 1000)
        );
      } catch (error) {
        /*
         * A failed important-page inspection must not invalidate the
         * successful homepage inspection. Direct route-health evidence
         * remains authoritative for HTTP route status.
         */
        try {
          await page.goto(
            url,
            {
              waitUntil:
                "domcontentloaded",
              timeout:
                BROWSER_TIMEOUT
            }
          );
        } catch {}
      }
    }

    const testedRouteUrls =
      new Set(
        renderedInternalRoutes.map(
          route =>
            route.href
        )
      );

    for (
      let index = failedResources.length - 1;
      index >= 0;
      index--
    ) {
      const failure =
        failedResources[index];

      if (
        failure?.status >= 400 &&
        testedRouteUrls.has(
          failure.url
        )
      ) {
        failedResources.splice(
          index,
          1
        );
      }
    }

    inspection.consoleErrors =
      [
        ...new Set(
          consoleErrors
        )
      ].slice(0, 50);

    inspection.failedResources =
      deduplicateResources(
        failedResources
      ).slice(0, 100);

    inspection.lcpElement =
      await getLcpElement(
        page
      );

    inspection.layoutWarnings =
      await getLayoutWarnings(
        page
      );

    inspection.durationMs =
      Date.now() -
      startedAt;

    return inspection;

  } catch (error) {

    inspection.durationMs =
      Date.now() -
      startedAt;

    inspection.unavailableReason =
      error.message ||
      "Browser inspection failed.";

    return inspection;

  } finally {

    if (browser) {
      try {
        await browser.close();
      } catch {}
    }

  }
};

function deduplicateResources(
  resources
) {
  const seen =
    new Set();

  return resources.filter(
    resource => {
      const key =
        JSON.stringify(
          resource
        );

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

async function getLcpElement(
  page
) {
  try {

    return await page.evaluate(
      () =>
        new Promise(resolve => {

          if (
            !window.PerformanceObserver
          ) {
            resolve(null);
            return;
          }

          let largest = null;

          try {

            const observer =
              new PerformanceObserver(
                list => {

                  const entries =
                    list.getEntries();

                  if (
                    entries.length
                  ) {
                    largest =
                      entries[
                        entries.length -
                          1
                      ];
                  }
                }
              );

            observer.observe({
              type:
                "largest-contentful-paint",
              buffered:
                true
            });

            setTimeout(
              () => {

                if (!largest) {
                  resolve(null);
                  return;
                }

                const element =
                  largest.element;

                resolve({
                  text:
                    element?.innerText
                      ?.replace(
                        /\s+/g,
                        " "
                      )
                      .trim() ||
                    null,
                  tag:
                    element?.tagName
                      ?.toLowerCase() ||
                    null,
                  url:
                    element?.currentSrc ||
                    element?.src ||
                    null
                });

              },
              100
            );

          } catch {
            resolve(null);
          }

        })
    );

  } catch {
    return null;
  }
}

async function getLayoutWarnings(
  page
) {
  try {

    return await page.evaluate(
      () => {

        const warnings = [];

        const documentWidth =
          document.documentElement
            .scrollWidth;

        const viewportWidth =
          window.innerWidth;

        if (
          documentWidth >
          viewportWidth + 2
        ) {
          warnings.push({
            type:
              "horizontal-overflow",
            documentWidth,
            viewportWidth
          });
        }

        return warnings;

      }
    );

  } catch {
    return [];
  }
}

module.exports =
  runBrowserInspection;

module.exports.buildBrowserInspectionFindings =
  buildBrowserInspectionFindings;
