#!/usr/bin/env python3
"""Read-only audit of Overture Places in Gauteng; never writes to Neon.

The audit deliberately excludes any feature whose provenance includes Foursquare
and accepts only records whose source licenses are explicitly permissive/CC0.
It prints counts and a small public business/site sample for manual review.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

ALLOWED_LICENSES = {"cdla-permissive-2.0", "cc0-1.0"}
EXCLUDED_SOURCE_NAMES = {"foursquare"}
EXCLUDED_HOSTS = {
    "facebook.com", "instagram.com", "linkedin.com", "google.com", "maps.google.com",
    "goo.gl", "youtube.com", "yelp.com", "x.com", "twitter.com", "pinterest.com",
    "pin.it", "fb.me", "share.google", "t.co", "lnkd.in", "bit.ly", "tinyurl.com",
    "m.me", "wa.me", "whatsapp.com", "t.me", "threads.net", "tiktok.com", "snapchat.com",
    "share.here.com", "here.com", "maps.apple.com", "waze.com", "mapquest.com",
    "tripadvisor.com", "booking.com", "airbnb.com", "privateproperty.co.za",
    "citizen.co.za", "yellowpages.net.za", "yellowpages-south-africa.com",
    "myportmoni.com", "hotfrog.co.za", "opendi.co.za", "mycityinfo.co.za",
    "ccbc.co.za", "pretoriaeast.co.za", "pretoriahub.com", "websdocs.com",
    "yellowpages.com", "trustpilot.com", "crunchbase.com", "linktr.ee", "bio.site",
    "beacons.ai", "hugedomains.com", "sedo.com", "afternic.com", "dan.com",
    "atom.com", "brandbucket.com", "buydomains.com", "domainmarket.com",
    "parkingcrew.net", "bodis.com", "undeveloped.com", "sav.com",
    "domainnamesales.com", "expireddomains.com",
    "wixsite.com", "wordpress.com", "sites.google.com",
    "business.websdocs.com", "blogspot.com", "weebly.com", "business.site",
}


def iter_features(path: Path):
    with path.open("r", encoding="utf-8") as stream:
        for raw_line in stream:
            line = raw_line.strip().lstrip("\x1e").strip()
            if not line:
                continue
            record = json.loads(line)
            if record.get("type") == "FeatureCollection":
                yield from record.get("features", [])
            elif record.get("type") == "Feature":
                yield record


def website_host(value: str) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    parsed = urlparse(raw if "://" in raw else "https://" + raw)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    if host in EXCLUDED_HOSTS or any(host.endswith("." + item) for item in EXCLUDED_HOSTS):
        return None
    return host


def provenance(feature: dict) -> tuple[bool, list[str], str | None]:
    sources = feature.get("sources") or []
    datasets = [str(item.get("dataset") or "").strip().lower() for item in sources]
    datasets = [item for item in datasets if item]
    if not datasets:
        return False, [], "missing_source"
    if any(item in EXCLUDED_SOURCE_NAMES for item in datasets):
        return False, datasets, "foursquare_source"
    licenses = [str(item.get("license") or "").strip().lower() for item in sources]
    if not licenses or any(item not in ALLOWED_LICENSES for item in licenses):
        return False, datasets, "unapproved_or_missing_license"
    return True, datasets, None


def assess_feature(feature: dict) -> dict:
    props = feature.get("properties") or feature
    name = str((props.get("names") or {}).get("primary") or "").strip()
    websites = props.get("websites") or []
    hosts = sorted({host for item in websites if (host := website_host(item))})
    addresses = props.get("addresses") or []
    address = next(
        (item for item in addresses
         if str(item.get("country") or "").upper() == "ZA"
         and str(item.get("locality") or "").strip()),
        None,
    )
    city = str((address or {}).get("locality") or "").strip()
    region = str((address or {}).get("region") or "").strip()
    confidence = props.get("confidence")
    try:
        confidence = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        confidence = None
    status = str(props.get("operating_status") or "").lower()
    allowed, datasets, provenance_reason = provenance(props)
    eligible = bool(
        name and hosts and city and region == "ZA-GP" and allowed
        and confidence is not None and confidence >= 0.7
        and status != "permanently_closed"
    )
    return {
        "eligible": eligible,
        "name": name,
        "hosts": hosts,
        "city": city,
        "region": region,
        "country": str((address or {}).get("country") or ""),
        "confidence": confidence,
        "status": status,
        "category": str(props.get("basic_category") or (props.get("taxonomy") or {}).get("primary") or ""),
        "datasets": datasets,
        "provenance_reason": provenance_reason,
        "id": str(feature.get("id") or props.get("id") or ""),
    }


def audit(path: Path) -> dict:
    counts = Counter()
    sources = Counter()
    categories = Counter()
    regions = Counter()
    eligible = []
    seen_hosts = set()
    eligible_hosts = set()
    for feature in iter_features(path):
        result = assess_feature(feature)
        counts["features"] += 1
        if result["name"]:
            counts["named"] += 1
        if result["hosts"]:
            counts["with_website"] += 1
            seen_hosts.update(result["hosts"])
        if result["city"] and result["region"]:
            counts["with_city_region"] += 1
            regions[result["region"]] += 1
        if result["region"] == "ZA-GP":
            counts["gauteng_region"] += 1
        if result["provenance_reason"] == "foursquare_source":
            counts["excluded_foursquare"] += 1
        elif result["provenance_reason"]:
            counts["excluded_unapproved_provenance"] += 1
        if result["status"] == "permanently_closed":
            counts["closed"] += 1
        if result["eligible"]:
            counts["eligible"] += 1
            eligible.append(result)
            eligible_hosts.update(result["hosts"])
            categories[result["category"] or "uncategorized"] += 1
            sources.update(result["datasets"])
    return {
        "counts": dict(counts),
        "unique_website_hosts_all_sources": len(seen_hosts),
        "eligible_unique_website_hosts": len(eligible_hosts),
        "region_counts_in_bbox": dict(regions.most_common()),
        "eligible_source_counts": dict(sources.most_common()),
        "eligible_category_counts": dict(categories.most_common(20)),
        "sample": eligible[:25],
    }


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: audit-overture-gauteng.py <places.geojsonseq>", file=sys.stderr)
        return 2
    result = audit(Path(sys.argv[1]))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
