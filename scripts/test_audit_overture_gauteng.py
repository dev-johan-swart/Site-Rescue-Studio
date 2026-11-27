import gzip
import json
import tempfile
import unittest
from pathlib import Path

import importlib.util

MODULE_PATH = Path(__file__).with_name("audit-overture-gauteng.py")
SPEC = importlib.util.spec_from_file_location("audit_overture_gauteng", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
assess_feature = MODULE.assess_feature
audit = MODULE.audit
export_candidates = MODULE.export_candidates


def feature(name, website, source="meta", license="CDLA-Permissive-2.0", status="open"):
    return {
        "type": "Feature",
        "properties": {
            "id": "gers-1",
            "names": {"primary": name},
            "websites": [website] if website else [],
            "addresses": [{"locality": "Pretoria", "region": "ZA-GP", "country": "ZA"}],
            "sources": [{"dataset": source, "license": license}],
            "confidence": 0.92,
            "operating_status": status,
            "basic_category": "professional_service",
        },
    }


class OvertureAuditTests(unittest.TestCase):
    def test_accepts_named_website_with_gauteng_address_and_permissive_source(self):
        result = assess_feature(feature("Example Business", "https://example.co.za"))
        self.assertTrue(result["eligible"])
        self.assertEqual(result["city"], "Pretoria")
        self.assertEqual(result["hosts"], ["example.co.za"])

    def test_excludes_any_foursquare_provenance(self):
        item = feature("Example Business", "https://example.co.za")
        item["properties"]["sources"].append(
            {"dataset": "Foursquare", "license": "Apache-2.0"}
        )
        result = assess_feature(item)
        self.assertFalse(result["eligible"])
        self.assertEqual(result["provenance_reason"], "foursquare_source")

    def test_excludes_unknown_or_missing_licenses(self):
        result = assess_feature(
            feature("Example Business", "https://example.co.za", source="unknown", license="")
        )
        self.assertFalse(result["eligible"])
        self.assertEqual(result["provenance_reason"], "unapproved_or_missing_license")

    def test_excludes_social_links_and_closed_businesses(self):
        social = assess_feature(feature("Example Business", "https://facebook.com/example"))
        closed = assess_feature(feature("Closed Business", "https://closed.co.za", status="permanently_closed"))
        self.assertFalse(social["eligible"])
        self.assertFalse(closed["eligible"])

    def test_excludes_platform_hosted_business_sites(self):
        wix = assess_feature(feature("Example Business", "https://example.wixsite.com/home"))
        wordpress = assess_feature(feature("Example Business", "https://example.wordpress.com"))
        self.assertFalse(wix["eligible"])
        self.assertFalse(wordpress["eligible"])

    def test_requires_an_explicit_high_confidence_score(self):
        item = feature("Example Business", "https://example.co.za")
        item["properties"]["confidence"] = None
        self.assertFalse(assess_feature(item)["eligible"])

    def test_excludes_places_outside_gauteng_even_inside_the_bounding_box(self):
        item = feature("North West Business", "https://example.co.za")
        item["properties"]["addresses"][0]["region"] = "ZA-NW"
        self.assertFalse(assess_feature(item)["eligible"])

    def test_accepts_common_gauteng_region_aliases(self):
        for region in ("GP", "Gauteng", "GAUTENG", "ZA-GT", "Tshwane"):
            item = feature("Gauteng Business", "https://example.co.za")
            item["properties"]["addresses"][0]["region"] = region
            self.assertTrue(assess_feature(item)["eligible"], region)

    def test_streams_geojson_sequence_and_counts_unique_hosts(self):
        records = [
            feature("One", "https://www.example.co.za"),
            feature("Two", "https://example.co.za"),
            feature("Foursquare", "https://four.co.za", source="Foursquare", license="Apache-2.0"),
        ]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "places.geojsonseq"
            path.write_text("\n".join(json.dumps(item) for item in records), encoding="utf-8")
            result = audit(path)
        self.assertEqual(result["counts"]["features"], 3)
        self.assertEqual(result["counts"]["eligible"], 2)
        self.assertEqual(result["unique_website_hosts_all_sources"], 2)
        self.assertEqual(result["eligible_unique_website_hosts"], 1)
        self.assertEqual(result["counts"]["excluded_foursquare"], 1)


    def test_exports_one_gzipped_candidate_per_unique_host_with_provenance(self):
        records = [
            feature("Pretoria Example", "https://www.example.co.za"),
            feature("Centurion Example", "https://example.co.za"),
            feature("Foursquare Example", "https://four.co.za", source="Foursquare", license="Apache-2.0"),
        ]
        records[0]["id"] = "gers-pretoria"
        records[1]["id"] = "gers-centurion"
        with tempfile.TemporaryDirectory() as folder:
            input_path = Path(folder) / "places.geojsonseq"
            output_path = Path(folder) / "gauteng.jsonl.gz"
            input_path.write_text("\n".join(json.dumps(item) for item in records), encoding="utf-8")
            exported = export_candidates(input_path, output_path)
            with gzip.open(output_path, "rt", encoding="utf-8") as stream:
                candidates = [json.loads(line) for line in stream if line.strip()]
        self.assertEqual(exported, 1)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["website_normalized"], "example.co.za")
        self.assertEqual(candidates[0]["source"], "overture_maps")
        self.assertTrue(candidates[0]["location_evidence"]["sources"])
        self.assertNotIn("phone", candidates[0])
        self.assertNotIn("email", candidates[0])


if __name__ == "__main__":
    unittest.main()
