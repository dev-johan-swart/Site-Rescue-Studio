import json
import tempfile
import unittest
from pathlib import Path

from audit_overture_gauteng import assess_feature, audit


def feature(name, website, source="meta", license="CDLA-Permissive-2.0", status="open"):
    return {
        "type": "Feature",
        "properties": {
            "id": "gers-1",
            "names": {"primary": name},
            "websites": [website] if website else [],
            "addresses": [{"locality": "Pretoria", "region": "ZA-GT", "country": "ZA"}],
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
        self.assertEqual(result["unique_website_hosts"], 1)
        self.assertEqual(result["counts"]["excluded_foursquare"], 1)


if __name__ == "__main__":
    unittest.main()
