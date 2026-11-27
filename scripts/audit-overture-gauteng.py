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
import re
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
    "adidas.com", "regus.com", "sportscene.co.za", "f45training.com",
    "cashbuild.co.za", "goldwagen.com", "cashcrusaders.co.za", "freshstop.co.za",
    "sportsmanswarehouse.co.za", "sterns.co.za", "incredible.co.za",
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


CHAIN_NAME_TOKENS = {
    "sasol", "engen", "shell", "spar", "savemor", "kfc", "nandos", "nando s",
    "ocean basket", "total energies", "totalenergies", "total elarduspark", "marriott",
    "protea hotels", "glasfit", "seriously addictive mathematics",
    "dischem", "clicks", "pick n pay", "checkers", "woolworths",
    "shoprite", "makro", "builders warehouse", "ackermans", "mr price",
    "truworths", "foschini", "edgars", "mcdonalds", "burger king",
    "steers", "debonaire", "spur", "wimpy", "chicken licken", "mc donald s", "roman s pizza",
    "hungry lion", "romans pizza", "fishaways", "pedros", "rocomamas",
    "mugg bean", "vida e caffe", "seattle coffee", "city lodge",
    "sun international", "tsogo sun", "radisson", "hilton", "holiday inn",
    "standard bank", "absa", "nedbank", "capitec", "investec", "discovery",
    "momentum", "old mutual", "sanlam", "vodacom", "mtn", "telkom", "cell c",
    "toyota", "volkswagen", "ford", "bmw", "mercedes", "audi", "hyundai",
    "kia", "nissan", "renault", "suzuki", "haval", "chery", "mahindra",
    "we buy cars", "motus", "avis", "hertz", "europcar", "safair", "airlink",
    "south african airways", "adidas", "regus", "sportscene", "f45 training",
    "cashbuild", "goldwagen", "cash crusaders", "freshstop", "sportsmans warehouse",
    "sterns", "incredible connection",
}
CHAIN_DOMAIN_ROOTS = {
    "sasol.co.za", "engen.co.za", "shell.com", "spar.co.za", "kfc.co.za",
    "nandos.co.za", "oceanbasket.com", "totalenergies.co.za", "hm.com",
    "marriott.com", "glasfit.com", "dischem.co.za", "clicks.co.za",
    "pnp.co.za", "checkers.co.za", "woolworths.co.za", "shoprite.co.za",
    "makro.co.za", "game.co.za", "builders.co.za", "ackermans.co.za",
    "mrprice.com", "truworths.co.za", "foschini.co.za", "mcdonalds.co.za",
    "burgerking.co.za", "steers.co.za", "spursteakranches.com", "wimpy.co.za",
    "chickenlicken.co.za", "hungrylion.co.za", "romanspizza.co.za",
    "fishaways.co.za", "pedros.co.za", "rocomamas.com", "muggandbean.co.za",
    "vidaecaffe.com", "seattlecoffeecompany.com", "citylodgehotels.com",
    "suninternational.com", "tsogosun.com", "radissonhotels.com", "hilton.com",
    "ihg.com", "fnb.co.za", "standardbank.co.za", "absa.co.za", "nedbank.co.za",
    "capitecbank.co.za", "investec.com", "discovery.co.za", "momentum.co.za",
    "oldmutual.co.za", "sanlam.co.za", "vodacom.co.za", "mtn.co.za",
    "telkom.co.za", "cellc.co.za", "toyota.co.za", "vw.co.za", "ford.co.za",
    "bmw.co.za", "mercedes-benz.co.za", "audi.co.za", "hyundai.co.za",
    "kia.co.za", "nissan.co.za", "renault.co.za", "suzukiauto.co.za",
    "haval.co.za", "chery.co.za", "mahindra.co.za", "webuycars.co.za",
    "motus.co.za", "avis.co.za", "hertz.co.za", "europcar.co.za",
    "safair.co.za", "flysaa.com", "airlink.co.za",
}
STORE_LOCATOR_MARKERS = (
    "/store-finder", "/store-locator", "/find-a-store", "/branch-locator",
    "/service-stations/", "/locations/", "/location/", "/find-us",
    "/store-details", "/find-a-branch", "/our-stores",
)


def is_chain_or_locator(name: str, websites: list[str]) -> bool:
    normalized_name = re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).strip()
    padded_name = f" {normalized_name} "
    if any(f" {token} " in padded_name for token in CHAIN_NAME_TOKENS):
        return True
    for website in websites:
        parsed = urlparse(str(website or "") if "://" in str(website or "") else "https://" + str(website or ""))
        host = website_host(website)
        if host and any(host == root or host.endswith("." + root) for root in CHAIN_DOMAIN_ROOTS):
            return True
        path = (parsed.path or "").lower()
        if any(marker in path for marker in STORE_LOCATOR_MARKERS):
            return True
    return False


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
    brand = props.get("brand") or {}
    has_brand = bool(brand and (brand.get("names") or brand.get("wikidata")))
    chain_or_locator = is_chain_or_locator(name, websites)
    allowed, datasets, provenance_reason = provenance(props)
    eligible = bool(
        name and hosts and city and is_gauteng_region(region) and allowed
        and confidence is not None and confidence >= 0.7
        and status != "permanently_closed"
        and not has_brand and not chain_or_locator
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
        "has_brand": has_brand,
        "excluded_chain_or_locator": chain_or_locator,
        "brand_name": str(((brand.get("names") or {}).get("primary")) or ""),
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
        if result["has_brand"]:
            counts["excluded_branded"] += 1
        if result["excluded_chain_or_locator"]:
            counts["excluded_chain_or_locator"] += 1
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
                ids = current["locationEvidence"].setdefault("also_seen_source_ids", [])
                if result["id"] not in ids and len(ids) < 20:
                    ids.append(result["id"])

    candidates = sorted(
        by_host.values(),
        key=lambda item: (item["_priority"], -item["confidence"], item["city"], item["name"], item["website_normalized"]),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output_path, "wt", encoding="utf-8") as stream:
        for candidate in candidates:
            candidate.pop("_priority", None)
            stream.write(json.dumps(candidate, ensure_ascii=False, separators=(",", ":")) + "\n")
    return len(candidates)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="Overture Places GeoJSONSeq file")
    parser.add_argument("--export", type=Path, help="Optional gzip JSONL candidate feed output")
    parser.add_argument("--summary", type=Path, help="Optional JSON summary output")
    args = parser.parse_args()

    result = audit(args.input)
    if args.export:
        result["exported_unique_website_hosts"] = export_candidates(args.input, args.export)
        result["export_file"] = str(args.export)
    if args.summary:
        args.summary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
