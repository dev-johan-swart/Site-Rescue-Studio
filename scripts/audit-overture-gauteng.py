#!/usr/bin/env python3
"""Read-only audit of Overture Places in Gauteng; never writes to Neon.

The audit deliberately excludes any feature whose provenance includes Foursquare
and accepts only records whose source licenses are explicitly permissive/CC0.
It prints counts and a small public business/site sample for manual review.
"""
from __future__ import annotations

import argparse
import gzip
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


def is_gauteng_region(value: str) -> bool:
    normalized = str(value or "").strip().upper().replace("_", "-")
    return normalized in {
        "ZA-GP", "GP", "GAUTENG", "GAUTENG (OLD)", "ZA-GT",
        "JOHANNESBURG", "TSHWANE",
    }


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
        name and hosts and city and is_gauteng_region(region) and allowed
        and confidence is not None and confidence >= 0.7
        and status != "permanently_closed"
    )
    source_details = [
        {
            "dataset": str(item.get("dataset") or "").strip().lower(),
            "license": str(item.get("license") or "").strip(),
        }
        for item in (props.get("sources") or [])
        if item.get("dataset")
    ]
    valid_websites = [
        str(item).strip()
        for item in websites
        if website_host(item)
    ]
    return {
        "eligible": eligible,
        "name": name,
        "hosts": hosts,
        "websites": valid_websites,
        "source_details": source_details,
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
        if is_gauteng_region(result["region"]):
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


def export_candidates(input_path: Path, output_path: Path) -> int:
    """Write one candidate per unique website host, preserving source evidence."""
    by_host = {}
    city_priority = {
        "pretoria": 0, "tshwane": 0, "centurion": 1, "johannesburg": 2,
    }
    for feature in iter_features(input_path):
        result = assess_feature(feature)
        if not result["eligible"]:
            continue
        for website in result["websites"]:
            host = website_host(website)
            if not host:
                continue
            city_key = result["city"].lower()
            priority = next(
                (rank for city, rank in city_priority.items() if city in city_key),
                3,
            )
            candidate = {
                "source": "overture_maps",
                "provider": "overture_maps",
                "website": website if "://" in website else "https://" + website,
                "website_normalized": host,
                "name": result["name"],
                "city": result["city"],
                "region": "Gauteng",
                "confidence": result["confidence"],
                "category": result["category"],
                "source_id": result["id"],
                "locationEvidence": {
                    "provider": "overture_maps",
                    "source_id": result["id"],
                    "city": result["city"],
                    "region": "Gauteng",
                    "region_code": "ZA-GP",
                    "country": "ZA",
                    "confidence": result["confidence"],
                    "category": result["category"],
                    "sources": result["source_details"],
                },
                "_priority": priority,
            }
            current = by_host.get(host)
            if current is None or (
                candidate["_priority"], -candidate["confidence"], candidate["name"]
            ) < (
                current["_priority"], -current["confidence"], current["name"]
            ):
                if current:
                    candidate["locationEvidence"]["also_seen_source_ids"] = [
                        current.get("source_id")
                    ] + current["locationEvidence"].get("also_seen_source_ids", [])
                by_host[host] = candidate
            elif current and result["id"] and result["id"] != current.get("source_id"):
                ids = current["location_evidence"].setdefault("also_seen_source_ids", [])
                if result["id"] not in ids and len(ids) < 20:
                    ids.append(result["id"])

    candidates = sorted(
        by_host.values(),
        key=lambda item: (item["_priority"], -item["confidence"], item["city"], item["name"], item["website_normalized"]),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output_path, "wt", encoding="utf-8", newline="\\n") as stream:
        for candidate in candidates:
            candidate.pop("_priority", None)
            stream.write(json.dumps(candidate, ensure_ascii=False, separators=(",", ":")) + "\\n")
    return len(candidates)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="Overture Places GeoJSONSeq file")
    parser.add_argument("--export", type=Path, help="Optional gzip JSONL candidate feed output")
    args = parser.parse_args()

    result = audit(args.input)
    if args.export:
        result["exported_unique_website_hosts"] = export_candidates(args.input, args.export)
        result["export_file"] = str(args.export)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
