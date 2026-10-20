"""
Unit Tests for GST Item Classification & Tax Calculation Engine.
Covers:
  - 6- and 8-digit HSN format validation
  - Rate lookups for 6- and 8-digit codes
  - Unknown HSN and Invalid HSN error handling (no silent defaults)
  - Processing & branding variations for staples (loose 0% vs pre-packed & branded 5%)
  - General Interpretative Rules (GIR): Specific over General (e.g. Menthol Toothpaste)
  - General Interpretative Rules (GIR): Essential Character for mixtures/composites
  - Bundling: Composite supply (principal item's rate)
  - Bundling: Mixed supply (highest rate among components)
  - Explicit HSN precedence over resolvers
"""

import os
import sys
import unittest

# Ensure backend directory is in python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from gst_classifier import (
    GSTClassifier,
    InvalidHSNError,
    UnknownHSNError,
    ClassificationError,
    validate_hsn_format,
    lookup_rate,
    resolve_specific_over_general,
    resolve_essential_character,
    calculate_bundle_tax,
    get_item_gst_details
)


class TestGSTClassification(unittest.TestCase):

    def setUp(self):
        self.classifier = GSTClassifier()

    # -------------------------------------------------------------------------
    # 1. HSN Format Validation
    # -------------------------------------------------------------------------
    def test_valid_hsn_formats(self):
        """Should accept valid 6-digit and 8-digit numeric HSN codes."""
        self.assertEqual(self.classifier.validate_hsn_format("420222"), "420222")
        self.assertEqual(self.classifier.validate_hsn_format("84719000"), "84719000")
        self.assertEqual(self.classifier.validate_hsn_format(420222), "420222")
        self.assertEqual(self.classifier.validate_hsn_format(84719000), "84719000")

    def test_invalid_hsn_non_numeric(self):
        """Should reject HSN codes containing alphabetic or special characters."""
        with self.assertRaises(InvalidHSNError):
            self.classifier.validate_hsn_format("42AB22")

        with self.assertRaises(InvalidHSNError):
            self.classifier.validate_hsn_format("8471-900")

        with self.assertRaises(InvalidHSNError):
            self.classifier.validate_hsn_format("ABCDEF")

    def test_invalid_hsn_lengths(self):
        """Should reject codes not exactly 6 or 8 digits in length."""
        for invalid_len_code in ["123", "1234", "12345", "1234567", "123456789"]:
            with self.subTest(code=invalid_len_code):
                with self.assertRaises(InvalidHSNError):
                    self.classifier.validate_hsn_format(invalid_len_code)

    def test_invalid_hsn_none_or_empty(self):
        """Should reject None and empty string."""
        with self.assertRaises(InvalidHSNError):
            self.classifier.validate_hsn_format("")

        with self.assertRaises(InvalidHSNError):
            self.classifier.validate_hsn_format(None)

    # -------------------------------------------------------------------------
    # 2. Rate Lookups (6- and 8-digit)
    # -------------------------------------------------------------------------
    def test_rate_lookup_6_digit_cloth_handbag(self):
        """HSN 420222 (cloth/handbag) should return 18% GST (9% CGST + 9% SGST)."""
        res = self.classifier.lookup_rate("420222")
        self.assertEqual(res["hsn_code"], "420222")
        self.assertAlmostEqual(res["gst_rate"], 0.18)
        self.assertAlmostEqual(res["cgst_rate"], 0.09)
        self.assertAlmostEqual(res["sgst_rate"], 0.09)
        self.assertEqual(res["percentage"], 18)

    def test_rate_lookup_8_digit_computer_peripherals(self):
        """HSN 84719000 (computer peripherals) should return 18% GST (9% CGST + 9% SGST)."""
        res = self.classifier.lookup_rate("84719000")
        self.assertEqual(res["hsn_code"], "84719000")
        self.assertAlmostEqual(res["gst_rate"], 0.18)
        self.assertAlmostEqual(res["cgst_rate"], 0.09)
        self.assertAlmostEqual(res["sgst_rate"], 0.09)
        self.assertEqual(res["percentage"], 18)

    def test_unknown_hsn_raises_error(self):
        """Unknown HSN code must raise UnknownHSNError without silently defaulting."""
        with self.assertRaises(UnknownHSNError):
            self.classifier.lookup_rate("999999")

        with self.assertRaises(UnknownHSNError):
            self.classifier.lookup_rate("12345678")

    # -------------------------------------------------------------------------
    # 3. Processing and Brand Status (Staples Rule)
    # -------------------------------------------------------------------------
    def test_staple_pulses_loose_vs_branded(self):
        """
        Pulses (HSN 07130000):
        - Loose/unbranded -> 0% GST
        - Pre-packed and branded -> 5% GST
        """
        # Loose & unbranded
        loose = self.classifier.lookup_rate("07130000", is_packaged=False, is_branded=False)
        self.assertEqual(loose["gst_rate"], 0.0)
        self.assertEqual(loose["percentage"], 0)

        # Packaged but unbranded (loose rate applies)
        pkg_unbranded = self.classifier.lookup_rate("07130000", is_packaged=True, is_branded=False)
        self.assertEqual(pkg_unbranded["gst_rate"], 0.0)

        # Unpackaged but branded
        loose_branded = self.classifier.lookup_rate("07130000", is_packaged=False, is_branded=True)
        self.assertEqual(loose_branded["gst_rate"], 0.0)

        # Pre-packed and branded
        branded = self.classifier.lookup_rate("07130000", is_packaged=True, is_branded=True)
        self.assertEqual(branded["gst_rate"], 0.05)
        self.assertEqual(branded["percentage"], 5)
        self.assertAlmostEqual(branded["cgst_rate"], 0.025)
        self.assertAlmostEqual(branded["sgst_rate"], 0.025)

    def test_staple_rice_grains_loose_vs_branded(self):
        """
        Rice/Grains (HSN 10063000):
        - Loose -> 0% GST
        - Pre-packed & branded -> 5% GST
        """
        loose = self.classifier.lookup_rate("10063000", is_packaged=False, is_branded=False)
        self.assertEqual(loose["gst_rate"], 0.0)

        branded = self.classifier.lookup_rate("10063000", is_packaged=True, is_branded=True)
        self.assertEqual(branded["gst_rate"], 0.05)

    def test_staple_milk_loose_vs_branded(self):
        """
        Milk (HSN 04012000):
        - Loose -> 0% GST
        - Pre-packed & branded -> 5% GST
        """
        loose = self.classifier.lookup_rate("04012000", is_packaged=False, is_branded=False)
        self.assertEqual(loose["gst_rate"], 0.0)

        branded = self.classifier.lookup_rate("04012000", is_packaged=True, is_branded=True)
        self.assertEqual(branded["gst_rate"], 0.05)

    # -------------------------------------------------------------------------
    # 4. General Interpretative Rules: Specific over General
    # -------------------------------------------------------------------------
    def test_gir_specific_over_general_menthol_toothpaste(self):
        """
        Specific over general:
        'Menthol Toothpaste' matches Heading 3306 (Dentifrices - specific, 33061020)
        over Heading 3304 (Cosmetics - general, 33049900).
        """
        resolved = self.classifier.resolve_specific_over_general(
            candidate_hsns=["33049900", "33061020"],
            product_name="Menthol Toothpaste",
            description="Oral care freshness"
        )
        self.assertEqual(resolved, "33061020")

    def test_gir_specific_over_general_by_product_name_alone(self):
        """Without candidate codes, keyword resolver identifies 33061020 for toothpaste."""
        resolved = self.classifier.resolve_specific_over_general(
            product_name="Herbal Dentifrice Toothpaste"
        )
        self.assertEqual(resolved, "33061020")

    def test_explicit_hsn_takes_precedence_over_gir(self):
        """An explicit HSN always wins over GIR resolvers."""
        item = {
            "name": "Menthol Toothpaste",
            "hsn_code": "33049900",  # Explicitly assigned general code by user
        }
        details = self.classifier.get_item_gst_details(item)
        self.assertEqual(details["hsn_code"], "33049900")

    # -------------------------------------------------------------------------
    # 5. General Interpretative Rules: Essential Character Rule
    # -------------------------------------------------------------------------
    def test_gir_essential_character_principal_flag(self):
        """
        Essential Character rule:
        Composite product resolves to the HSN of the principal component.
        """
        components = [
            {"name": "Hot Sauce", "hsn_code": "210390", "price": 150, "is_principal": True},
            {"name": "Promo Spoon", "hsn_code": "821599", "price": 20, "is_principal": False}
        ]
        resolved = self.classifier.resolve_essential_character(components)
        self.assertEqual(resolved["hsn_code"], "210390")
        self.assertEqual(resolved["principal_component"], "Hot Sauce")
        self.assertEqual(resolved["gst_rate"], 0.12)

    def test_gir_essential_character_by_value(self):
        """Without an explicit flag, principal component is deduced by value/prominence."""
        components = [
            {"name": "Special Sauce", "hsn_code": "210390", "price": 250},
            {"name": "Plastic Spoon", "hsn_code": "821599", "price": 10}
        ]
        resolved = self.classifier.resolve_essential_character(components)
        self.assertEqual(resolved["hsn_code"], "210390")
        self.assertEqual(resolved["principal_component"], "Special Sauce")

    # -------------------------------------------------------------------------
    # 6. Bundling Rules (Composite Supply vs Mixed Supply)
    # -------------------------------------------------------------------------
    def test_composite_supply_taxed_at_principal_item_rate(self):
        """
        Composite supply: naturally bundled with one clear principal item.
        Taxed at the principal item's GST rate.
        Example: Hot sauce (HSN 210390, 12%) + Promo spoon (HSN 821599, 18%).
        Principal item is Hot Sauce. Applicable rate is 12%.
        """
        items = [
            {"name": "Hot Sauce", "hsn_code": "210390", "is_principal": True},
            {"name": "Promo Spoon", "hsn_code": "821599", "is_principal": False}
        ]
        res = self.classifier.calculate_bundle_tax("composite", items)
        self.assertEqual(res["bundle_type"], "composite")
        self.assertEqual(res["governing_hsn"], "210390")
        self.assertAlmostEqual(res["gst_rate"], 0.12)
        self.assertAlmostEqual(res["cgst_rate"], 0.06)
        self.assertAlmostEqual(res["sgst_rate"], 0.06)
        self.assertEqual(res["percentage"], 12)

    def test_mixed_supply_taxed_at_highest_rate(self):
        """
        Mixed supply: deliberately bundled distinct items sold for single price.
        Taxed at the HIGHEST GST rate among all components.
        Example: Festive pack with:
          - Chocolates (HSN 180631, 18%)
          - Canned juice (HSN 200989, 12%)
          - Plastic container (HSN 392410, 18%)
        Highest rate is 18%.
        """
        items = [
            {"name": "Chocolates", "hsn_code": "180631"},
            {"name": "Canned Juice", "hsn_code": "200989"},
            {"name": "Plastic Container", "hsn_code": "392410"}
        ]
        res = self.classifier.calculate_bundle_tax("mixed", items)
        self.assertEqual(res["bundle_type"], "mixed")
        self.assertAlmostEqual(res["gst_rate"], 0.18)
        self.assertEqual(res["percentage"], 18)
        self.assertAlmostEqual(res["cgst_rate"], 0.09)
        self.assertAlmostEqual(res["sgst_rate"], 0.09)

    def test_mixed_supply_different_highest_rate(self):
        """Mixed supply with Canned Juice (12%) and Cashew Nuts (5%) -> highest is 12%."""
        items = [
            {"name": "Canned Juice", "hsn_code": "200989"},
            {"name": "Cashew Nuts", "hsn_code": "080131"}
        ]
        res = self.classifier.calculate_bundle_tax("mixed", items)
        self.assertEqual(res["bundle_type"], "mixed")
        self.assertAlmostEqual(res["gst_rate"], 0.12)
        self.assertEqual(res["percentage"], 12)

    def test_bundle_invalid_type(self):
        """Should reject unsupported bundle type."""
        with self.assertRaises(ValueError):
            self.classifier.calculate_bundle_tax("arbitrary_pack", [{"hsn_code": "210390"}])

    # -------------------------------------------------------------------------
    # 7. High-Level get_item_gst_details Dispatcher
    # -------------------------------------------------------------------------
    def test_get_item_gst_details_composite_bundle(self):
        """High-level dispatcher properly processes composite bundle."""
        data = {
            "name": "Hot Sauce Gift Set",
            "bundle_type": "composite",
            "bundle_items": [
                {"name": "Hot Sauce", "hsn_code": "210390", "is_principal": True},
                {"name": "Spoon", "hsn_code": "821599"}
            ]
        }
        res = self.classifier.get_item_gst_details(data)
        self.assertEqual(res["bundle_type"], "composite")
        self.assertEqual(res["gst_rate"], 0.12)

    def test_get_item_gst_details_mixed_bundle(self):
        """High-level dispatcher properly processes mixed bundle."""
        data = {
            "name": "Diwali Gift Hamper",
            "bundle_type": "mixed",
            "bundle_items": [
                {"name": "Chocolates", "hsn_code": "180631"},
                {"name": "Canned Juice", "hsn_code": "200989"}
            ]
        }
        res = self.classifier.get_item_gst_details(data)
        self.assertEqual(res["bundle_type"], "mixed")
        self.assertEqual(res["gst_rate"], 0.18)


if __name__ == "__main__":
    unittest.main()

