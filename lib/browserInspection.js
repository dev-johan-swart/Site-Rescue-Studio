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
  return page.evaluate(() => {
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

    const describeForm = (form, synthetic = false) => {
      const controls = Array.from(
        form.querySelectorAll("input, textarea, select, [contenteditable="true"])
      ).filter(isVisible);

      const fields = controls.map(control => ({
        type: (
          control.getAttribute("type") ||
          control.tagName.toLowerCase()
        ).toLowerCase(),
        name: control.getAttribute("name") || "",
        placeholder: control.getAttribute("placeholder") || "",
        ariaLabel: control.getAttribute("aria-label") || ""
      }));

      const text = (
        (form.innerText || form.textContent || "") +
        " " +
        fields
          .map(f =>
            [f.name, f.placeholder, f.ariaLabel].join(" ")
          )
          .join(" ")
      )
        .replace(/\s+/g, " ")
        .toLowerCase();

      const hasMessage = fields.some(
        f =>
          f.type === "textarea" ||
          /message|comment|enquir|question|details|request/i.test(
            [f.name, f.placeholder, f.ariaLabel].join(" ")
          )
      );

      const hasEmail = fields.some(
        f =>
          f.type === "email" ||
          /email|e-mail/i.test(
            [f.name, f.placeholder, f.ariaLabel].join(" ")
          )
      );

      const hasPhone = fields.some(
        f =>
          f.type === "tel" ||
          /phone|telephone|mobile|cell|contact-number/i.test(
            [f.name, f.placeholder, f.ariaLabel].join(" ")
          )
      );

      const hasName = fields.some(
        f =>
          /(^|[-_ ])name|full.?name|first.?name|surname/i.test(
            [f.name, f.placeholder, f.ariaLabel].join(" ")
          )
      );

      const hasPassword = fields.some(
        f => f.type === "password"
      );

      const hasSearch = fields.some(
        f =>
          f.type === "search" ||
          /(^|[-_ ])search|(^|[-_ ])query|(^|[-_ ])q$/i.test(
            f.name
          )
      );

      const quote =
        /request.?a?.?quote|get.?a?.?quote|quote/i.test(text);

      const booking =
        /book|booking|appointment|schedule/i.test(text);

      const enquiry =
        /contact|enquir|reach.?us|get.?in.?touch|send.?message|request/i.test(
          text
        );

      const submitControls = Array.from(
        form.querySelectorAll(
          'button[type="submit"], input[type="submit"], button:not([type]), [role="button"], a[href]'
        )
      )
        .filter(isVisible)
        .filter(element =>
          /send|submit|message|quote|book|appointment|request|enquir|contact/i.test(
            (
              element.innerText ||
              element.value ||
              element.getAttribute("aria-label") ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim()
          )
        );

      const hasSubmitControl =
        submitControls.length > 0;

      const submitText = submitControls
        .map(
          element =>
            (
              element.innerText ||
              element.value ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim()
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
      } else if (enquiry || hasMessage) {
        type = "contact";
      } else if (
        hasEmail &&
        /subscribe|newsletter|updates/i.test(text)
      ) {
        type = "newsletter";
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
        quote ||
        booking ||
        (hasName && hasEmail)
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
        action: form.action || null,
        method: (form.method || "get").toUpperCase(),
        fields: fields.length,
        inputCount: fields.length,
        fieldTypes: fields.map(f => f.type),
        fieldLabels: fields
          .map(
            f =>
              f.name ||
              f.placeholder ||
              f.ariaLabel ||
              ""
          )
          .filter(Boolean)
          .slice(0, 12),
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
      .map(form => describeForm(form, false));

    /*
     * Some modern React/Vue/SPA sites render a visible contact
     * form as a group of inputs and buttons without a literal
     * <form> element. Detect those groups without treating every
     * isolated input as a contact form.
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
        const containerControls =
          Array.from(
            container.querySelectorAll(
              "input, textarea, select"
            )
          ).filter(isVisible);

        const submitControls =
          Array.from(
            container.querySelectorAll(
              "button, input[type='submit'], [role='button'], a[href]"
            )
          )
            .filter(isVisible)
            .filter(element =>
              /send|submit|message|quote|book|appointment|request|enquir|contact/i.test(
                (
                  element.innerText ||
                  element.value ||
                  element.getAttribute("aria-label") ||
                  ""
                )
                  .replace(/\s+/g, " ")
                  .trim()
              )
            );

        const containerText =
          (
            container.innerText ||
            container.textContent ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim();

        const hasContactLanguage =
          /contact|enquir|send.?message|get.?in.?touch|request.?a?.?quote|quote|appointment|booking|message/i.test(
            containerText
          );

        if (
          containerControls.length >= 2 &&
          containerControls.length <= 12 &&
          submitControls.length > 0 &&
          hasContactLanguage
        ) {
          if (!seenContainers.has(container)) {
            seenContainers.add(container);
            syntheticForms.push(
              describeForm(container, true)
            );
          }
          break;
        }

        container = container.parentElement;
      }
    });

    return nativeForms.concat(syntheticForms);
  });
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
    renderedForms: [],
    renderedButtons: [],
    renderedInternalRoutes: [],
    routeHealth: [],
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

  if (!puppeteer) {
    puppeteer = await import("puppeteer-core");
  }

  let browser = null;

  try {
    const isWindows =
  process.platform === "win32";

browser =
  await puppeteer.launch({
    args: isWindows
      ? []
      : chromium.args,

    defaultViewport: {
      width: 1365,
      height: 900,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    },

    executablePath:
      isWindows
        ? LOCAL_CHROME_PATH
        : await chromium.executablePath(),

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
              )
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
        "a[href]",
        links => {
          const contactPattern =
            /contact|call|phone|whatsapp|get\s*in\s*touch|enquir|quote|booking|book\s*now|appointment|reach\s*us/i;

          return links
            .map(link => {
              const href =
                link.href || "";

              const text =
                link.innerText
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
                )
              ) {
                type = "whatsapp";
              } else if (
                contactPattern.test(
                  text
                ) ||
                contactPattern.test(
                  href
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

              link.click();
              return true;
            },
            route.href
          );

        if (clicked) {
          await new Promise(
            resolve =>
              setTimeout(resolve, 3000)
          );

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
