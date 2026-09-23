const CRITICAL_ROUTE_PATHS = new Set([
  "/contact", "/book", "/booking", "/quote", "/request-a-quote", "/enquiry", "/inquiry"
]);

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePath(value) {
  try {
    const path = new URL(String(value)).pathname || "/";
    return path.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    const path = String(value || "").split("?")[0].split("#")[0];
    return path.replace(/\/+$/, "").toLowerCase() || "/";
  }
}

function routeEvidence(scanData) {
  const routes = Array.isArray(scanData?.routeHealth?.routes) ? scanData.routeHealth.routes : [];
  const confirmedBroken = routes.filter(route =>
    route?.status === "broken" || route?.status === "unreachable"
  );
  const criticalBroken = confirmedBroken.filter(route =>
    CRITICAL_ROUTE_PATHS.has(normalizePath(route?.url || route?.path))
  );
  return { confirmedBroken, criticalBroken };
}

function linkEvidence(scanData) {
  const health = scanData?.linkHealth || {};
  const results = Array.isArray(scanData?.linkResults) ? scanData.linkResults : [];
  const brokenFromResults = results.filter(result =>
    result?.status === "broken" || result?.status === "unreachable"
  ).length;
  return {
    broken: Math.max(Number(health.broken || 0), brokenFromResults),
    tested: Number(health.tested || results.length || 0)
  };
}

function securityEvidence(scanData) {
  const securityScore = asNumber(scanData?.scores?.security);
  const checks = [
    ...(Array.isArray(scanData?.checks?.security) ? scanData.checks.security : []),
    ...(Array.isArray(scanData?.security?.checks) ? scanData.security.checks : [])
  ];
  const failures = checks.filter(check => check?.status === "fail");
  const insecure = failures.some(check =>
    /https|mixed content|insecure/i.test(String(check?.title || check?.name || ""))
  );
  return { securityScore, failures, insecure };
}

function hasUsableContactEvidence(scanData) {
  const evidence = scanData?.businessEvidence || {};
  return ["phone", "email", "whatsapp", "form", "location", "cta"].some(key =>
    Array.isArray(evidence[key]) && evidence[key].length > 0
  );
}

function hasFormFailure(scanData) {
  const text = JSON.stringify([
    scanData?.businessEvidence?.form || [],
    scanData?.checks?.business || [],
    scanData?.keyProblems || ""
  ]).toLowerCase();
  return /form.{0,80}(fail|broken|404|410|500|unreachable|insecure)|(?:fail|broken|404|410|500|unreachable|insecure).{0,80}form/.test(text);
}

function canonicalMismatch(scanData) {
  const text = JSON.stringify([
    scanData?.checks?.seo || [],
    scanData?.keyProblems || ""
  ]).toLowerCase();
  return /canonical.{0,100}(different hostname|mismatch|different domain)|canonical domain mismatch/.test(text);
}

function collectEvidence(scanData) {
  const { confirmedBroken, criticalBroken } = routeEvidence(scanData);
  const links = linkEvidence(scanData);
  const security = securityEvidence(scanData);
  return {
    confirmedBrokenRoutes: confirmedBroken.length,
    criticalBrokenRoutes: criticalBroken.length,
    brokenLinks: links.broken,
    testedLinks: links.tested,
    formFailure: hasFormFailure(scanData),
    canonicalMismatch: canonicalMismatch(scanData),
    insecure: security.insecure,
    securityFailures: security.failures.length,
    securityScore: security.securityScore,
    usableContactEvidence: hasUsableContactEvidence(scanData),
    overallScore: asNumber(scanData?.scores?.overall),
    technicalScore: asNumber(scanData?.scores?.technical),
    businessScore: asNumber(scanData?.scores?.business),
    accessibilityScore: asNumber(scanData?.scores?.accessibility),
    performanceScore: asNumber(scanData?.scores?.performance)
  };
}

function qualifyProspect(scanData) {
  const evidence = collectEvidence(scanData);

  if (!scanData || scanData.success === false) {
    return { priority: "failed", reason: "The website scan did not complete successfully.", evidence };
  }

  const highReasons = [];
  if (evidence.insecure) highReasons.push("Confirmed HTTPS or mixed-content security problem.");
  if (evidence.criticalBrokenRoutes > 0) {
    highReasons.push(`${evidence.criticalBrokenRoutes} confirmed customer-facing route(s) such as contact, booking or quote are broken/unreachable.`);
  }
  if (evidence.formFailure) highReasons.push("A contact/enquiry form failure was detected.");
  if (evidence.confirmedBrokenRoutes >= 2) {
    highReasons.push(`${evidence.confirmedBrokenRoutes} confirmed internal route failures were detected.`);
  }
  if (evidence.brokenLinks >= 3) {
    highReasons.push(`${evidence.brokenLinks} confirmed broken/unreachable links were detected.`);
  }
  if (highReasons.length > 0) {
    return { priority: "high", reason: highReasons[0], evidence, reasons: highReasons };
  }

  const moderateReasons = [];
  if (evidence.canonicalMismatch) moderateReasons.push("The public website and canonical hostname do not match.");
  if (evidence.securityFailures > 0 || (evidence.securityScore !== null && evidence.securityScore < 80)) {
    moderateReasons.push("Security and trust hardening opportunities were detected.");
  }
  if (evidence.performanceScore !== null && evidence.performanceScore < 70) {
    moderateReasons.push("Performance results indicate a meaningful optimisation opportunity.");
  }
  if (evidence.technicalScore !== null && evidence.technicalScore < 75) {
    moderateReasons.push("Technical health includes meaningful issues requiring review.");
  }
  if (evidence.businessScore !== null && evidence.businessScore < 80) {
    moderateReasons.push("Business/conversion health includes meaningful gaps.");
  }
  if (evidence.accessibilityScore !== null && evidence.accessibilityScore < 75) {
    moderateReasons.push("Accessibility results show meaningful improvement opportunities.");
  }
  if (evidence.overallScore !== null && evidence.overallScore < 85) {
    moderateReasons.push("The overall website health result indicates improvement opportunities.");
  }
  if (moderateReasons.length > 0) {
    return { priority: "moderate", reason: moderateReasons[0], evidence, reasons: moderateReasons };
  }

  return {
    priority: "healthy",
    reason: "No strong prospecting issue was confirmed by the available scan evidence.",
    evidence
  };
}

module.exports = { CRITICAL_ROUTE_PATHS, collectEvidence, qualifyProspect, normalizePath };
