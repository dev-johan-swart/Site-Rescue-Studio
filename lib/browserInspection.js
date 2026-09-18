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

function createEmptyInspection() {
  return {
    attempted: true,
    available: false,
    renderedTitle: null,
    renderedHeadings: [],
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
      await page.$$eval(
        "form",
        forms =>
          forms.map(form => ({
            action:
              form.action ||
              null,
            method:
              (
                form.method ||
                "get"
              ).toUpperCase(),
            inputCount:
              form.querySelectorAll(
                "input, textarea, select"
              ).length,
            hasSubmitControl:
              Boolean(
                form.querySelector(
                  'button[type="submit"], input[type="submit"], button:not([type])'
                )
              )
          }))
      );

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
      "a[href]",
      links => {
        const currentOrigin =
          window.location.origin;

        const seen =
          new Set();

        return links
          .map(link => ({
            href:
              link.href ||
              "",
            text:
              link.innerText
                ?.replace(
                  /\s+/g,
                  " "
                )
                .trim() ||
              ""
          }))
          .map(link => {
            try {
              const parsed =
                new URL(
                  link.href,
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

              if (
                seen.has(href)
              ) {
                return null;
              }

              seen.add(href);

              return {
                href,
                text:
                  link.text
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .slice(0, 15);
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
