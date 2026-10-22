"""
Domain Entities for RetailSphere Multi-Echelon Retail Inventory & ERP System.
Modelled on large Indian retail operations (DMart-style: Central DC supplying Stores).
Zero external dependencies - uses standard library dataclasses, enums, and typing.
"""

from dataclasses import dataclass, field, asdict
from datetime import date, datetime
from typing import Optional, List, Dict, Any
from enum import Enum


# -----------------------------------------------------------------------------
# Enumerations
# -----------------------------------------------------------------------------
class LocationType(str, Enum):
    DC = "DC"
    STORE = "STORE"


class FootfallTier(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class BatchStatus(str, Enum):
    ACTIVE = "ACTIVE"
    NEAR_EXPIRY = "NEAR_EXPIRY"
    EXPIRED = "EXPIRED"
    BLOCKED = "BLOCKED"
    QUARANTINED = "QUARANTINED"
    SCRAP = "SCRAP"


class MovementType(str, Enum):
    GRN_RECEIPT = "GRN_RECEIPT"
    DC_TRANSFER_OUT = "DC_TRANSFER_OUT"
    STORE_RECEIVE_IN = "STORE_RECEIVE_IN"
    POS_SALE = "POS_SALE"
    VENDOR_RETURN = "VENDOR_RETURN"
    SCRAP_CONVERSION = "SCRAP_CONVERSION"
    AUDIT_ADJUSTMENT = "AUDIT_ADJUSTMENT"


class ReplenishmentStatus(str, Enum):
    REQUESTED = "REQUESTED"
    ALLOCATED = "ALLOCATED"
    PICKED = "PICKED"
    IN_TRANSIT = "IN_TRANSIT"
    RECEIVED = "RECEIVED"
    CANCELLED = "CANCELLED"


class AuditStatus(str, Enum):
    PENDING_COUNT = "PENDING_COUNT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class MarkdownStatus(str, Enum):
    SUGGESTED = "SUGGESTED"
    APPROVED = "APPROVED"
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    REJECTED = "REJECTED"


class ReturnStatus(str, Enum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    SUPPLIER_ACKNOWLEDGED = "SUPPLIER_ACKNOWLEDGED"
    CREDIT_RECEIVED = "CREDIT_RECEIVED"
    CANCELLED = "CANCELLED"


class DebitNoteStatus(str, Enum):
    ISSUED = "ISSUED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    SETTLED = "SETTLED"


# -----------------------------------------------------------------------------
# 1. Location Entity (Distribution Centers & Stores)
# -----------------------------------------------------------------------------
@dataclass
class Location:
    location_id: Optional[int]
    code: str  # e.g. 'DC-01', 'STORE-101'
    name: str  # e.g. 'Central DC Mumbai', 'DMart Store Thane'
    type: LocationType = LocationType.STORE
    footfall_tier: FootfallTier = FootfallTier.MEDIUM
    address: Optional[str] = None
    created_at: Optional[datetime] = None

    def is_dc(self) -> bool:
        return self.type == LocationType.DC

    def is_high_footfall(self) -> bool:
        return self.footfall_tier == FootfallTier.HIGH

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.location_id,
            "code": self.code,
            "name": self.name,
            "type": self.type.value if isinstance(self.type, Enum) else self.type,
            "footfall_tier": self.footfall_tier.value if isinstance(self.footfall_tier, Enum) else self.footfall_tier,
            "address": self.address
        }


# -----------------------------------------------------------------------------
# 2. Supplier Entity (Vendor Master)
# -----------------------------------------------------------------------------
@dataclass
class Supplier:
    supplier_id: Optional[int]
    supplier_name: str
    gstin: Optional[str] = None
    contact_email: Optional[str] = None
    phone: Optional[str] = None
    expiry_return_window_days: int = 30  # Days before expiry supplier accepts returns
    credit_period_days: int = 30
    created_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.supplier_id,
            "name": self.supplier_name,
            "gstin": self.gstin,
            "contact_email": self.contact_email,
            "phone": self.phone,
            "expiry_return_window_days": self.expiry_return_window_days,
            "credit_period_days": self.credit_period_days
        }


# -----------------------------------------------------------------------------
# 3. Batch Entity (Master Batch/Lot Record)
# -----------------------------------------------------------------------------
@dataclass
class Batch:
    batch_id: Optional[int]
    product_id: int
    batch_number: str
    mfg_date: date
    expiry_date: date
    cost_price: float = 0.00
    mrp: float = 0.00
    supplier_id: Optional[int] = None
    status: BatchStatus = BatchStatus.ACTIVE
    created_at: Optional[datetime] = None

    @property
    def days_to_expiry(self) -> int:
        if isinstance(self.expiry_date, str):
            exp = datetime.strptime(self.expiry_date, "%Y-%m-%d").date()
        else:
            exp = self.expiry_date
        return (exp - date.today()).days

    def is_expired(self) -> bool:
        return self.days_to_expiry < 0

    def is_near_expiry(self, threshold_days: int = 30) -> bool:
        return 0 <= self.days_to_expiry <= threshold_days

    def is_within_vendor_return_window(self, return_window_days: int) -> bool:
        return 0 <= self.days_to_expiry <= return_window_days

    def is_allocatable(self, min_shelf_life_days: int = 0) -> bool:
        stat = self.status.value if isinstance(self.status, Enum) else self.status
        if stat != "ACTIVE":
            return False
        if self.is_expired():
            return False
        if min_shelf_life_days > 0 and self.days_to_expiry < min_shelf_life_days:
            return False
        return True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "batch_id": self.batch_id,
            "product_id": self.product_id,
            "batch_number": self.batch_number,
            "mfg_date": self.mfg_date.isoformat() if isinstance(self.mfg_date, (date, datetime)) else str(self.mfg_date),
            "expiry_date": self.expiry_date.isoformat() if isinstance(self.expiry_date, (date, datetime)) else str(self.expiry_date),
            "days_to_expiry": self.days_to_expiry,
            "cost_price": float(self.cost_price),
            "mrp": float(self.mrp),
            "supplier_id": self.supplier_id,
            "status": self.status.value if isinstance(self.status, Enum) else self.status
        }


# -----------------------------------------------------------------------------
# 4. BatchStock Entity (Multi-Echelon Per-Location Inventory)
# -----------------------------------------------------------------------------
@dataclass
class BatchStock:
    stock_id: Optional[int]
    product_id: int
    location_id: int
    batch_id: int
    quantity_saleable: int = 0
    quantity_reserved: int = 0
    quantity_scrap: int = 0
    updated_at: Optional[datetime] = None

    @property
    def available_for_sale(self) -> int:
        return max(0, self.quantity_saleable - self.quantity_reserved)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stock_id": self.stock_id,
            "product_id": self.product_id,
            "location_id": self.location_id,
            "batch_id": self.batch_id,
            "quantity_saleable": self.quantity_saleable,
            "quantity_reserved": self.quantity_reserved,
            "quantity_scrap": self.quantity_scrap,
            "available_for_sale": self.available_for_sale
        }


# -----------------------------------------------------------------------------
# 5. Goods Received Note (GRN) & Items
# -----------------------------------------------------------------------------
@dataclass
class GRNLineItem:
    product_id: int
    batch_number: str
    mfg_date: date
    expiry_date: date
    received_qty: int
    unit_cost: float
    batch_id: Optional[int] = None
    grn_item_id: Optional[int] = None

    def validate(self) -> None:
        if self.received_qty <= 0:
            raise ValueError(f"Received quantity must be > 0 (got {self.received_qty})")
        mfg = datetime.strptime(self.mfg_date, "%Y-%m-%d").date() if isinstance(self.mfg_date, str) else self.mfg_date
        exp = datetime.strptime(self.expiry_date, "%Y-%m-%d").date() if isinstance(self.expiry_date, str) else self.expiry_date
        if exp <= mfg:
            raise ValueError(f"Expiry date ({exp}) must be strictly after manufacturing date ({mfg})")
        if exp < date.today():
            raise ValueError(f"Cannot accept expired stock at GRN entry (expiry: {exp}, today: {date.today()})")


@dataclass
class GoodsReceivedNote:
    grn_id: Optional[int]
    grn_number: str
    location_id: int  # DC Location
    supplier_id: int
    received_by: str
    invoice_no: Optional[str] = None
    receipt_date: Optional[datetime] = None
    status: str = "RECEIVED"
    items: List[GRNLineItem] = field(default_factory=list)

    def total_qty(self) -> int:
        return sum(item.received_qty for item in self.items)

    def total_cost(self) -> float:
        return sum(item.received_qty * item.unit_cost for item in self.items)


# -----------------------------------------------------------------------------
# 6. Stock Movement Entity (Full Traceability Audit)
# -----------------------------------------------------------------------------
@dataclass
class StockMovement:
    movement_id: Optional[int]
    product_id: int
    batch_id: int
    batch_number: str
    movement_type: MovementType
    quantity: int
    performed_by: str
    from_location_id: Optional[int] = None
    to_location_id: Optional[int] = None
    reference_doc_type: Optional[str] = None
    reference_doc_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "movement_id": self.movement_id,
            "product_id": self.product_id,
            "batch_id": self.batch_id,
            "batch_number": self.batch_number,
            "movement_type": self.movement_type.value if isinstance(self.movement_type, Enum) else self.movement_type,
            "quantity": self.quantity,
            "from_location_id": self.from_location_id,
            "to_location_id": self.to_location_id,
            "reference_doc_type": self.reference_doc_type,
            "reference_doc_id": self.reference_doc_id,
            "performed_by": self.performed_by,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


# -----------------------------------------------------------------------------
# 7. Store Replenishment Request & Pick List Items (FEFO)
# -----------------------------------------------------------------------------
@dataclass
class ReplenishmentLineItem:
    product_id: int
    requested_qty: int
    allocated_batch_id: Optional[int] = None
    allocated_batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    allocated_qty: int = 0
    picked_qty: int = 0
    is_override: bool = False
    override_reason: Optional[str] = None
    override_approved_by: Optional[str] = None
    item_id: Optional[int] = None


@dataclass
class StoreReplenishment:
    replenishment_id: Optional[int]
    request_number: str
    from_location_id: int  # DC
    to_location_id: int    # Store
    requested_by: str
    status: ReplenishmentStatus = ReplenishmentStatus.REQUESTED
    allocated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    items: List[ReplenishmentLineItem] = field(default_factory=list)


# -----------------------------------------------------------------------------
# 8. Code Management Audit Entity (Store Physical Verification)
# -----------------------------------------------------------------------------
@dataclass
class AuditLineItem:
    product_id: int
    batch_id: int
    system_qty: int
    physical_qty: Optional[int] = None
    discrepancy_qty: Optional[int] = None
    remarks: Optional[str] = None
    audit_item_id: Optional[int] = None


@dataclass
class CodeManagementAudit:
    audit_id: Optional[int]
    audit_number: str
    location_id: int
    created_by: str
    status: AuditStatus = AuditStatus.PENDING_COUNT
    approved_by: Optional[str] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    items: List[AuditLineItem] = field(default_factory=list)


# -----------------------------------------------------------------------------
# 9. Near-Expiry Markdown Promotion Entity (Push Sale)
# -----------------------------------------------------------------------------
@dataclass
class MarkdownPromotion:
    markdown_id: Optional[int]
    promotion_code: str
    product_id: int
    batch_id: int
    location_id: int
    days_to_expiry_at_creation: int
    suggested_discount_percent: float
    original_price: float
    markdown_price: float
    floor_price: float
    start_date: date
    end_date: date
    created_by: str
    approved_discount_percent: Optional[float] = None
    is_below_floor: bool = False
    status: MarkdownStatus = MarkdownStatus.SUGGESTED
    approved_by: Optional[str] = None
    approval_notes: Optional[str] = None

    def validate_floor(self) -> bool:
        """Returns True if markdown price respects the floor price policy."""
        return self.markdown_price >= self.floor_price


# -----------------------------------------------------------------------------
# 10. Vendor Expiry Return & Debit Note Entities
# -----------------------------------------------------------------------------
@dataclass
class VendorExpiryReturn:
    return_id: Optional[int]
    return_number: str
    location_id: int
    supplier_id: int
    product_id: int
    batch_id: int
    quantity: int
    unit_cost: float
    idempotency_key: str
    grn_id: Optional[int] = None
    reason: str = "Hit Supplier Expiry Return Window"
    status: ReturnStatus = ReturnStatus.DRAFT
    posted_at: Optional[datetime] = None
    posted_by: Optional[str] = None
    created_at: Optional[datetime] = None

    @property
    def total_claim_amount(self) -> float:
        return round(self.quantity * self.unit_cost, 2)


@dataclass
class DebitNote:
    debit_note_id: Optional[int]
    debit_note_number: str
    return_id: int
    supplier_id: int
    issue_date: date
    taxable_amount: float
    gst_amount: float
    total_amount: float
    status: DebitNoteStatus = DebitNoteStatus.ISSUED
    created_at: Optional[datetime] = None

