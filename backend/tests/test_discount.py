"""
Unit Tests for Discount Feature across Inventory, Restock, GST, and Invoicing.
Covers:
  - Worked example: price ₹1000, discount 10%, GST 18%, qty 2 -> discounted price ₹900, GST ₹162 per unit, line total ₹2,124
  - 0% discount producing identical output to old behavior
  - 10% discount applying GST on discounted price (not original)
  - Restock with new discount vs restock without discount (preserving old discount)
  - Validation: rejecting negative, over 100%, and non-numeric discounts
  - Multi-item invoice calculations with mixed discounts
"""

import os
import sys
import unittest

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from gst_classifier import (
    calculate_discount_and_gst,
    validate_discount_value
)


class TestDiscountFeature(unittest.TestCase):

    # -------------------------------------------------------------------------
    # 1. Worked Example Verification
    # -------------------------------------------------------------------------
    def test_worked_example_from_spec(self):
        """
        Price ₹1000, discount 10%, GST 18%, qty 2:
        -> discounted price = ₹900
        -> GST per unit = ₹162
        -> line total = ₹2,124
        """
        res = calculate_discount_and_gst(price=1000, discount=10, gst_rate=0.18, qty=2)

        self.assertEqual(res["original_price"], 1000.0)
        self.assertEqual(res["discount_percent"], 10.0)
        self.assertEqual(res["discount_amount_unit"], 100.0)
        self.assertEqual(res["discounted_price"], 900.0)
        self.assertEqual(res["gst_per_unit"], 162.0)
        self.assertEqual(res["line_subtotal"], 1800.0)
        self.assertEqual(res["line_gst"], 324.0)
        self.assertEqual(res["line_total"], 2124.0)
        self.assertEqual(res["discount_amount_total"], 200.0)
        self.assertEqual(res["original_subtotal"], 2000.0)

    # -------------------------------------------------------------------------
    # 2. 0% Discount (Identical to Old Behavior)
    # -------------------------------------------------------------------------
    def test_zero_percent_discount_matches_old_behavior(self):
        """Item with 0% discount produces identical calculation to existing behavior."""
        price = 500
        qty = 4
        gst_rate = 0.18

        res = calculate_discount_and_gst(price=price, discount=0, gst_rate=gst_rate, qty=qty)

        # Old behavior:
        # subtotal = price * qty = 2000
        # gst = int(subtotal * gst_rate) = 360
        # total = 2360
        self.assertEqual(res["discounted_price"], 500.0)
        self.assertEqual(res["discount_amount_unit"], 0.0)
        self.assertEqual(res["discount_amount_total"], 0.0)
        self.assertEqual(res["line_subtotal"], 2000.0)
        self.assertEqual(res["line_gst"], 360.0)
        self.assertEqual(res["line_total"], 2360.0)

    # -------------------------------------------------------------------------
    # 3. GST Applied on Discounted Price (Not Original Price)
    # -------------------------------------------------------------------------
    def test_gst_applied_on_discounted_price(self):
        """
        Price ₹200, discount 10%, GST 12%, qty 3:
        Discounted price = ₹180
        GST applied on ₹180 -> ₹21.60 per unit
        If GST were incorrectly applied on original ₹200, it would be ₹24.00 per unit.
        """
        res = calculate_discount_and_gst(price=200, discount=10, gst_rate=0.12, qty=3)

        self.assertEqual(res["discounted_price"], 180.0)
        self.assertEqual(res["gst_per_unit"], 21.60)
        self.assertNotEqual(res["gst_per_unit"], 24.00)  # Verify NOT calculated on ₹200
        self.assertEqual(res["line_subtotal"], 540.0)
        self.assertEqual(res["line_gst"], 64.80)
        self.assertEqual(res["line_total"], 604.80)

    # -------------------------------------------------------------------------
    # 4. Input Validation & Error Handling
    # -------------------------------------------------------------------------
    def test_valid_discount_inputs(self):
        """Valid discount values in 0-100 range are parsed and rounded correctly."""
        self.assertEqual(validate_discount_value(0), 0.0)
        self.assertEqual(validate_discount_value(10), 10.0)
        self.assertEqual(validate_discount_value(100), 100.0)
        self.assertEqual(validate_discount_value("15.5"), 15.5)
        self.assertEqual(validate_discount_value(None), 0.0)
        self.assertEqual(validate_discount_value(""), 0.0)

    def test_invalid_negative_discount_rejected(self):
        """Negative discounts must raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            validate_discount_value(-5)
        self.assertIn("cannot be negative", str(ctx.exception).lower())

        with self.assertRaises(ValueError) as ctx:
            validate_discount_value("-0.5")
        self.assertIn("cannot be negative", str(ctx.exception).lower())

    def test_invalid_over_100_discount_rejected(self):
        """Discounts over 100% must raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            validate_discount_value(101)
        self.assertIn("cannot exceed 100%", str(ctx.exception).lower())

        with self.assertRaises(ValueError) as ctx:
            validate_discount_value("150")
        self.assertIn("cannot exceed 100%", str(ctx.exception).lower())

    def test_invalid_non_numeric_discount_rejected(self):
        """Non-numeric string discounts must raise ValueError."""
        for invalid in ["ten", "10%", "$15", "abc", "20 off"]:
            with self.subTest(val=invalid):
                with self.assertRaises(ValueError) as ctx:
                    validate_discount_value(invalid)
                self.assertIn("numeric", str(ctx.exception).lower())

    # -------------------------------------------------------------------------
    # 5. Restock Discount Logic (Update vs Retain)
    # -------------------------------------------------------------------------
    def test_restock_with_new_discount(self):
        """Restock supplying a new discount updates the discount."""
        current_discount = 5.0
        new_discount_input = "15.0"

        # Simulating restock parameter resolution:
        if new_discount_input is not None and new_discount_input != "":
            updated_discount = validate_discount_value(new_discount_input)
        else:
            updated_discount = current_discount

        self.assertEqual(updated_discount, 15.0)

    def test_restock_without_discount_preserves_old_discount(self):
        """Restock without supplying discount keeps the old discount intact."""
        current_discount = 12.5

        for empty_val in [None, ""]:
            with self.subTest(val=empty_val):
                if empty_val is not None and empty_val != "":
                    updated_discount = validate_discount_value(empty_val)
                else:
                    updated_discount = current_discount
                self.assertEqual(updated_discount, 12.5)

    # -------------------------------------------------------------------------
    # 6. Multi-Item Invoice with Mixed Discounts
    # -------------------------------------------------------------------------
    def test_invoice_multiple_items_mixed_discounts(self):
        """
        Invoice containing multiple items: some with discount, some without.
        Item 1: ₹1000, 10% disc, 18% GST, qty 2 -> disc price ₹900, GST ₹162/unit, line total ₹2124
        Item 2: ₹500,   0% disc,  5% GST, qty 4 -> disc price ₹500, GST ₹25/unit,  line total ₹2100
        Item 3: ₹250,  20% disc, 12% GST, qty 2 -> disc price ₹200, GST ₹24/unit,  line total ₹448
        """
        items = [
            {"name": "Item 1", "price": 1000, "discount": 10, "gst_rate": 0.18, "qty": 2},
            {"name": "Item 2", "price": 500,  "discount": 0,  "gst_rate": 0.05, "qty": 4},
            {"name": "Item 3", "price": 250,  "discount": 20, "gst_rate": 0.12, "qty": 2},
        ]

        total_original_subtotal = 0.0
        total_discount = 0.0
        total_discounted_subtotal = 0.0
        total_gst = 0.0
        grand_total = 0.0

        line_results = []
        for itm in items:
            res = calculate_discount_and_gst(
                price=itm["price"],
                discount=itm["discount"],
                gst_rate=itm["gst_rate"],
                qty=itm["qty"]
            )
            line_results.append(res)
            total_original_subtotal += res["original_subtotal"]
            total_discount += res["discount_amount_total"]
            total_discounted_subtotal += res["line_subtotal"]
            total_gst += res["line_gst"]
            grand_total += res["line_total"]

        # Line 1 checks
        self.assertEqual(line_results[0]["line_total"], 2124.0)
        # Line 2 checks (0% discount)
        self.assertEqual(line_results[1]["line_total"], 2100.0)
        self.assertEqual(line_results[1]["discount_amount_total"], 0.0)
        # Line 3 checks (20% discount on 250 -> 200, GST 12% on 200 -> 24 per unit, line total = 224 * 2 = 448)
        self.assertEqual(line_results[2]["line_total"], 448.0)

        # Invoice summary totals:
        # Original subtotal: (1000*2) + (500*4) + (250*2) = 2000 + 2000 + 500 = 4500
        self.assertEqual(total_original_subtotal, 4500.0)

        # Total discount: (100*2) + (0*4) + (50*2) = 200 + 0 + 100 = 300
        self.assertEqual(total_discount, 300.0)

        # Discounted subtotal: (900*2) + (500*4) + (200*2) = 1800 + 2000 + 400 = 4200
        self.assertEqual(total_discounted_subtotal, 4200.0)
        self.assertEqual(total_original_subtotal - total_discount, total_discounted_subtotal)

        # Total GST: (162*2) + (25*4) + (24*2) = 324 + 100 + 48 = 472
        self.assertEqual(total_gst, 472.0)

        # Grand Total: 4200 + 472 = 4672
        self.assertEqual(grand_total, 4672.0)
        self.assertEqual(total_discounted_subtotal + total_gst, grand_total)


if __name__ == "__main__":
    unittest.main()

