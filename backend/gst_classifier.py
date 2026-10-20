"""
GST Item Classification & Tax Calculation Engine
Compliant with Indian Goods and Services Tax (GST) Act & General Interpretative Rules (GIR).
"""

import json
import os
from typing import Dict, List, Optional, Any, Union


class InvalidHSNError(ValueError):
    """Raised when an HSN code fails format validation (must be 6 or 8 numeric digits)."""
    pass


class UnknownHSNError(KeyError):
    """Raised when an HSN code is not found in the official registry table."""
    pass


class ClassificationError(Exception):
    """Raised when a product or composite supply cannot be resolved under GIR rules."""
    pass


class GSTClassifier:
    """
    Core GST Item Classification and Tax Calculation Engine.
    Implements:
      1. Strict 6/8-digit numeric HSN validation
      2. Data-driven HSN -> GST rate registry lookup
      3. GIR Rule: Specific over General description resolver
      4. GIR Rule: Essential Character rule for mixtures / composite goods
      5. Bundling: Composite supply (principal rate) vs Mixed supply (highest rate)
      6. Processing & Branding status: 0% loose/unbranded vs 5% pre-packed & branded staples
      7. Discount calculation and GST application on discounted prices
    """

    DEFAULT_DATA_PATH = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "data",
        "hsn_rates.json"
    )

    def __init__(self, data_path: Optional[str] = None):
        self.data_path = data_path or self.DEFAULT_DATA_PATH
        self._registry: Dict[str, Dict[str, Any]] = {}
        self._gir_rules: Dict[str, Any] = {}
        self.load_data()

    def load_data(self) -> None:
        """Loads HSN registry and interpretative rules from JSON file."""
        if not os.path.exists(self.data_path):
            raise FileNotFoundError(f"HSN rates configuration file not found at: {self.data_path}")

        with open(self.data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self._registry = data.get("hsns", {})
        self._gir_rules = data.get("gir_rules", {})

    def validate_hsn_format(self, hsn_code: Union[str, int]) -> str:
        """
        Validates HSN code format:
        - Must be numeric only.
        - Must be either 6 or 8 digits (for business turnover exceeding ₹5 crore).
        Raises InvalidHSNError if invalid.
        """
        if hsn_code is None:
            raise InvalidHSNError("HSN code cannot be None.")

        code_str = str(hsn_code).strip()

        if not code_str.isdigit():
            raise InvalidHSNError(
                f"Invalid HSN code '{hsn_code}'. HSN code must contain digits only."
            )

        if len(code_str) not in (6, 8):
            raise InvalidHSNError(
                f"Invalid HSN code '{hsn_code}'. HSN code must be exactly 6 or 8 digits (received {len(code_str)})."
            )

        return code_str

    def lookup_rate(
        self,
        hsn_code: Union[str, int],
        is_packaged: bool = True,
        is_branded: bool = True
    ) -> Dict[str, Any]:
        """
        Looks up the GST rate for a validated HSN code.
        Applies processing & branding status for staples:
          - Loose / unbranded staples (pulses, grains, milk) -> 0% GST.
          - Pre-packed and branded staples -> 5% GST.
        Raises UnknownHSNError if code is not in the registry table.
        """
        clean_code = self.validate_hsn_format(hsn_code)

        if clean_code not in self._registry:
            raise UnknownHSNError(
                f"Unknown HSN code '{clean_code}'. No GST rate entry found in configuration."
            )

        entry = self._registry[clean_code]
        conditional = entry.get("conditional")

        if conditional and conditional.get("staple"):
            # Loose or unbranded staple -> 0% GST
            # Pre-packed AND branded staple -> 5% GST
            if bool(is_packaged) and bool(is_branded):
                rate = conditional.get("packaged_branded_rate", 0.05)
            else:
                rate = conditional.get("loose_rate", 0.0)
            cgst_rate = round(rate / 2.0, 4)
            sgst_rate = round(rate / 2.0, 4)
        else:
            rate = float(entry.get("rate", 0.0))
            cgst_rate = float(entry.get("cgst_rate", round(rate / 2.0, 4)))
            sgst_rate = float(entry.get("sgst_rate", round(rate / 2.0, 4)))

        return {
            "hsn_code": clean_code,
            "description": entry.get("description", ""),
            "category": entry.get("category", ""),
            "gst_rate": rate,
            "cgst_rate": cgst_rate,
            "sgst_rate": sgst_rate,
            "percentage": int(round(rate * 100)),
            "is_packaged": bool(is_packaged),
            "is_branded": bool(is_branded),
            "is_staple": bool(conditional and conditional.get("staple"))
        }

    def resolve_specific_over_general(
        self,
        candidate_hsns: Optional[List[Union[str, int]]] = None,
        product_name: str = "",
        description: str = ""
    ) -> str:
        """
        General Interpretative Rule: Specific heading prevails over general heading.
        Example: "Menthol Toothpaste" resolves to Heading 3306 (Dentifrices, specific),
        not Heading 3304 (General Cosmetics).
        """
        text = f"{product_name} {description}".lower()

        # Check configured specific-over-general rules
        rules = self._gir_rules.get("specific_over_general", [])
        for rule in rules:
            keywords = rule.get("description_keywords", [])
            if any(kw in text for kw in keywords):
                specific = str(rule.get("specific_hsn"))
                if candidate_hsns:
                    clean_candidates = [str(c).strip() for c in candidate_hsns]
                    if specific in clean_candidates:
                        return specific
                else:
                    return specific

        # If candidates are provided, rank by specificity_rank in registry
        if candidate_hsns:
            valid_candidates = []
            for c in candidate_hsns:
                clean_c = self.validate_hsn_format(c)
                if clean_c in self._registry:
                    rank = self._registry[clean_c].get("specificity_rank", 1)
                    valid_candidates.append((rank, clean_c))
            if valid_candidates:
                # Highest rank wins
                valid_candidates.sort(key=lambda x: x[0], reverse=True)
                return valid_candidates[0][1]

        raise ClassificationError(
            f"Unable to resolve specific over general for product '{product_name}' "
            f"with candidates {candidate_hsns}."
        )

    def resolve_essential_character(self, components: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        General Interpretative Rule: Mixtures and composite goods consisting of different materials
        or made up of different components are classified by the component that gives them
        their essential character.
        """
        if not components:
            raise ClassificationError("Cannot resolve essential character: component list is empty.")

        # 1. Check for explicit principal indicator
        principal = None
        for item in components:
            if item.get("is_principal") or item.get("principal"):
                principal = item
                break

        # 2. If not explicitly flagged, check highest value or weight
        if not principal:
            def sort_key(c):
                return (
                    float(c.get("price", 0) or c.get("value", 0)),
                    float(c.get("weight", 0) or 0)
                )
            principal = max(components, key=sort_key)

        principal_hsn = principal.get("hsn_code") or principal.get("hsn")
        if not principal_hsn:
            raise ClassificationError(
                f"Principal component '{principal.get('name')}' is missing an HSN code."
            )

        details = self.lookup_rate(
            principal_hsn,
            is_packaged=principal.get("is_packaged", True),
            is_branded=principal.get("is_branded", True)
        )
        details["principal_component"] = principal.get("name")
        details["rule_applied"] = "GIR_ESSENTIAL_CHARACTER"
        return details

    def calculate_bundle_tax(
        self,
        bundle_type: str,
        items: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Calculates applicable GST rate for bundled supplies:
          - Composite supply: naturally bundled with one principal item.
            The entire bundle is taxed at the principal item's rate.
          - Mixed supply: deliberately bundled distinct items sold for a single price.
            The entire bundle is taxed at the highest GST rate among all components.
        """
        if not items:
            raise ClassificationError("Bundle items cannot be empty.")

        norm_bundle_type = str(bundle_type).strip().lower()
        if norm_bundle_type not in ("composite", "mixed"):
            raise ValueError(
                f"Invalid bundle_type '{bundle_type}'. Must be either 'composite' or 'mixed'."
            )

        item_rates = []
        principal_item = None

        for itm in items:
            hsn = itm.get("hsn_code") or itm.get("hsn")
            if not hsn:
                raise ClassificationError(f"Bundle item '{itm.get('name')}' must have an HSN code.")
            info = self.lookup_rate(
                hsn,
                is_packaged=itm.get("is_packaged", True),
                is_branded=itm.get("is_branded", True)
            )
            item_rates.append({
                "item": itm,
                "hsn_code": info["hsn_code"],
                "gst_rate": info["gst_rate"],
                "cgst_rate": info["cgst_rate"],
                "sgst_rate": info["sgst_rate"],
                "description": info["description"]
            })
            if itm.get("is_principal") or itm.get("principal"):
                principal_item = item_rates[-1]

        if norm_bundle_type == "composite":
            # Composite supply -> principal item's rate
            if not principal_item:
                # Default to first item if not explicitly flagged
                principal_item = item_rates[0]

            rate = principal_item["gst_rate"]
            cgst = principal_item["cgst_rate"]
            sgst = principal_item["sgst_rate"]
            governing_hsn = principal_item["hsn_code"]
            rationale = (
                f"Composite supply: taxed at principal item's rate "
                f"({principal_item['item'].get('name', governing_hsn)} @ {int(round(rate * 100))}%)."
            )
        else:
            # Mixed supply -> highest rate among all items
            highest = max(item_rates, key=lambda x: x["gst_rate"])
            rate = highest["gst_rate"]
            cgst = highest["cgst_rate"]
            sgst = highest["sgst_rate"]
            governing_hsn = highest["hsn_code"]
            rationale = (
                f"Mixed supply: taxed at highest rate among components "
                f"({highest['item'].get('name', governing_hsn)} @ {int(round(rate * 100))}%)."
            )

        return {
            "bundle_type": norm_bundle_type,
            "governing_hsn": governing_hsn,
            "hsn_code": governing_hsn,
            "gst_rate": rate,
            "cgst_rate": cgst,
            "sgst_rate": sgst,
            "percentage": int(round(rate * 100)),
            "item_breakdowns": item_rates,
            "rationale": rationale
        }

    def get_item_gst_details(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """
        High-level resolver for an item or supply at checkout or classification.
        Precedence:
          1. Bundles (composite / mixed) if bundle_type is set.
          2. Explicit HSN code (an explicit HSN always wins).
          3. Essential character resolution if components provided.
          4. Specific over general resolution if product name / candidates match.
        """
        # 1. Bundled supply
        bundle_type = item.get("bundle_type")
        bundle_items = item.get("bundle_items") or item.get("components")
        if bundle_type and bundle_items:
            return self.calculate_bundle_tax(bundle_type, bundle_items)

        # 2. Explicit HSN code
        explicit_hsn = item.get("hsn_code") or item.get("hsn")
        is_pkg = item.get("is_packaged", True)
        is_brd = item.get("is_branded", True)

        if explicit_hsn:
            return self.lookup_rate(explicit_hsn, is_packaged=is_pkg, is_branded=is_brd)

        # 3. Essential character for composite product without explicit HSN
        if bundle_items:
            return self.resolve_essential_character(bundle_items)

        # 4. GIR: Specific over general resolution
        p_name = item.get("name") or item.get("p_name") or ""
        p_desc = item.get("description") or item.get("category") or ""
        candidate_hsns = item.get("candidate_hsns")

        try:
            resolved_hsn = self.resolve_specific_over_general(
                candidate_hsns=candidate_hsns,
                product_name=p_name,
                description=p_desc
            )
            details = self.lookup_rate(resolved_hsn, is_packaged=is_pkg, is_branded=is_brd)
            details["rule_applied"] = "GIR_SPECIFIC_OVER_GENERAL"
            return details
        except ClassificationError:
            pass

        raise ClassificationError(
            f"Cannot classify item '{p_name}'. Product requires an explicit HSN code "
            f"or identifiable GIR characteristics."
        )


# Global default classifier instance
classifier = GSTClassifier()


# Module-level convenience functions
def validate_hsn_format(hsn_code: Union[str, int]) -> str:
    return classifier.validate_hsn_format(hsn_code)


def lookup_rate(
    hsn_code: Union[str, int],
    is_packaged: bool = True,
    is_branded: bool = True
) -> Dict[str, Any]:
    return classifier.lookup_rate(hsn_code, is_packaged=is_packaged, is_branded=is_branded)


def resolve_specific_over_general(
    candidate_hsns: Optional[List[Union[str, int]]] = None,
    product_name: str = "",
    description: str = ""
) -> str:
    return classifier.resolve_specific_over_general(
        candidate_hsns=candidate_hsns,
        product_name=product_name,
        description=description
    )


def resolve_essential_character(components: List[Dict[str, Any]]) -> Dict[str, Any]:
    return classifier.resolve_essential_character(components)


def calculate_bundle_tax(
    bundle_type: str,
    items: List[Dict[str, Any]]
) -> Dict[str, Any]:
    return classifier.calculate_bundle_tax(bundle_type, items)


def get_item_gst_details(item: Dict[str, Any]) -> Dict[str, Any]:
    return classifier.get_item_gst_details(item)


# -----------------------------------------------------------------------------
# Discount & GST Calculation Rule
# -----------------------------------------------------------------------------
def validate_discount_value(discount: Any) -> float:
    """
    Validates discount input:
    - Must be a numeric value (int, float, or numeric string).
    - Cannot be negative.
    - Cannot exceed 100%.
    Raises ValueError with a clear message if invalid.
    """
    if discount is None or discount == "":
        return 0.0
    try:
        val = float(discount)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid discount '{discount}'. Discount must be a numeric value.")

    if val < 0:
        raise ValueError(f"Invalid discount {val}%. Discount cannot be negative.")
    if val > 100:
        raise ValueError(f"Invalid discount {val}%. Discount cannot exceed 100%.")

    return round(val, 2)


def calculate_discount_and_gst(
    price: Union[float, int],
    discount: Union[float, int] = 0.0,
    gst_rate: float = 0.0,
    qty: Union[float, int] = 1
) -> Dict[str, Any]:
    """
    Core Discount & GST Calculation Rule:
      Discounted price = price - (price * discount / 100)
      GST is applied on the discounted price, not the original price:
        GST amount (per unit) = discounted price * GST rate
      Line total = (discounted price + GST) * quantity

    Worked Example Check:
      Price ₹1000, Discount 10%, GST 18%, Qty 2:
      -> discounted price = ₹900
      -> GST per unit = ₹162
      -> Line total = (₹900 + ₹162) * 2 = ₹2,124
    """
    price_val = float(price)
    disc_percent = validate_discount_value(discount)
    gst_r = float(gst_rate or 0.0)
    quantity = float(qty)

    discount_amount_unit = round(price_val * (disc_percent / 100.0), 2)
    discounted_price = round(price_val - discount_amount_unit, 2)
    gst_per_unit = round(discounted_price * gst_r, 2)

    line_subtotal = round(discounted_price * quantity, 2)
    original_subtotal = round(price_val * quantity, 2)
    discount_amount_total = round(discount_amount_unit * quantity, 2)
    line_gst = round(gst_per_unit * quantity, 2)
    line_total = round((discounted_price + gst_per_unit) * quantity, 2)

    return {
        "original_price": price_val,
        "discount_percent": disc_percent,
        "discount_amount_unit": discount_amount_unit,
        "discount_amount_total": discount_amount_total,
        "discounted_price": discounted_price,
        "gst_rate": gst_r,
        "gst_per_unit": gst_per_unit,
        "line_subtotal": line_subtotal,
        "original_subtotal": original_subtotal,
        "line_gst": line_gst,
        "line_total": line_total
    }
