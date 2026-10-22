"""
Core Domain Engine for Batch & Lot Controlled Inventory, FEFO Allocation,
Near-Expiry Alerts, Markdowns, Store Physical Audits, and Scrap/Debit Notes.
RetailSphere - Multi-Echelon Retail System (DMart-Style).
"""

import uuid
from datetime import date, datetime, timedelta
from typing import List, Dict, Optional, Tuple, Any

from domain_entities import (
    Location, Supplier, Batch, BatchStock, GRNLineItem, GoodsReceivedNote,
    StockMovement, ReplenishmentLineItem, StoreReplenishment, CodeManagementAudit,
    AuditLineItem, MarkdownPromotion, VendorExpiryReturn, DebitNote,
    LocationType, FootfallTier, BatchStatus, MovementType, ReplenishmentStatus,
    AuditStatus, MarkdownStatus, ReturnStatus, DebitNoteStatus
)


class BatchEngineError(Exception):
    """Base exception for batch engine errors."""
    pass


class ValidationError(BatchEngineError):
    """Raised when GRN or input data fails validation."""
    pass


class InsufficientStockError(BatchEngineError):
    """Raised when insufficient batch stock exists to satisfy request."""
    pass


class PolicyViolationError(BatchEngineError):
    """Raised when a business policy (floor price, shelf-life, unauthorized override) is violated."""
    pass


class SegregationOfDutiesError(BatchEngineError):
    """Raised when an actor attempts to approve/post a transaction they drafted/proposed."""
    pass


class StoreScopingError(BatchEngineError):
    """Raised when a store-scoped user (store_executive, store_supervisor) attempts to access another store."""
    pass


# -----------------------------------------------------------------------------
# Enterprise Governance: Segregation of Duties, Scoping & Auditing
# -----------------------------------------------------------------------------
def enforce_store_scoping(user_role: str = "admin", user_store_id: Optional[int] = None, target_store_id: Optional[int] = None):
    """
    Enforces store-level data isolation for store-bound roles:
    - 'store_executive' and 'store_supervisor' can ONLY access their own store_id.
    - 'cashier' is also tied to their store.
    - 'admin', 'category_manager', 'accounts' have cross-store visibility.
    - 'warehouse_picker' is scoped to DC (location_id = 1).
    """
    if user_role in ("store_executive", "store_supervisor", "cashier"):
        if user_store_id is None:
            raise StoreScopingError(f"User role '{user_role}' has no store assigned.")
        if target_store_id is not None and int(user_store_id) != int(target_store_id):
            raise StoreScopingError(
                f"Access denied: Role '{user_role}' is scoped to Store #{user_store_id}, "
                f"cannot perform actions at Store #{target_store_id}."
            )
        return int(user_store_id), user_role
    elif user_role == "warehouse_picker":
        if user_store_id is not None and target_store_id is not None and int(user_store_id) != int(target_store_id):
            raise StoreScopingError(
                f"Access denied: DC Picker is assigned to Location #{user_store_id}, "
                f"cannot perform actions at Location #{target_store_id}."
            )
        return (int(user_store_id) if user_store_id is not None else 1), user_role

    target_int = int(target_store_id) if target_store_id is not None and str(target_store_id).isdigit() else None
    return target_int, user_role


def validate_segregation_of_duties(creator_username: str, actor_username: str, action_description: str = "approval"):
    """
    Segregation of duties: Creator/drafter cannot approve or post their own proposal.
    """
    if not creator_username or not actor_username:
        return
    if str(creator_username).strip().lower() == str(actor_username).strip().lower():
        raise SegregationOfDutiesError(
            f"Segregation of Duties Violation: You cannot {action_description} an item you drafted or proposed ({creator_username})."
        )


def log_audit_event(cur, action_type: str, entity_type: str, entity_id: str,
                    user_id: int, username: str, user_role: str,
                    store_id: Optional[int] = None, details: Optional[Dict[str, Any]] = None,
                    ip_address: Optional[str] = None):
    """
    Writes an immutable event into system_audit_log.
    """
    import json
    details_json = json.dumps(details) if details else None
    cur.execute("""
        INSERT INTO system_audit_log (action_type, entity_type, entity_id, user_id, username, user_role, store_id, details, ip_address)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (action_type, entity_type, str(entity_id), user_id, username, user_role, store_id, details_json, ip_address))


def get_system_policy(cur, policy_key: str, default_val: Any = None) -> Any:
    """Retrieves policy value from system_policies table."""
    cur.execute("SELECT policy_value FROM system_policies WHERE policy_key = %s", (policy_key,))
    row = cur.fetchone()
    if row:
        return row[0]
    return default_val


def update_system_policy(cur, policy_key: str, policy_value: str, updated_by: str):
    """Updates a system policy setting and validates format."""
    cur.execute("SELECT policy_key FROM system_policies WHERE policy_key = %s", (policy_key,))
    if not cur.fetchone():
        raise ValidationError(f"Unknown system policy key: '{policy_key}'.")
    cur.execute("""
        UPDATE system_policies 
        SET policy_value = %s, updated_by = %s, updated_at = NOW() 
        WHERE policy_key = %s
    """, (str(policy_value), updated_by, policy_key))


# -----------------------------------------------------------------------------
# 1. GRN Inward Receipt & Validation
# -----------------------------------------------------------------------------
def validate_batch_grn_item(product_id: int, batch_number: str, mfg_date: Any,
                            expiry_date: Any, received_qty: int, unit_cost: float) -> GRNLineItem:
    """Validates line item attributes for DC GRN receipt."""
    if not batch_number or not str(batch_number).strip():
        raise ValidationError("Batch number is required for batch-controlled goods.")

    if received_qty <= 0:
        raise ValidationError(f"Received quantity must be positive integer (got {received_qty}).")

    if unit_cost < 0:
        raise ValidationError(f"Unit cost cannot be negative (got {unit_cost}).")

    # Parse dates
    mfg = datetime.strptime(str(mfg_date).split("T")[0], "%Y-%m-%d").date() if isinstance(mfg_date, str) else mfg_date
    exp = datetime.strptime(str(expiry_date).split("T")[0], "%Y-%m-%d").date() if isinstance(expiry_date, str) else expiry_date

    if exp <= mfg:
        raise ValidationError(f"Expiry date ({exp}) must be strictly after manufacturing date ({mfg}).")

    if exp < date.today():
        raise ValidationError(f"Cannot accept already expired stock at GRN (expiry: {exp}, today: {date.today()}).")

    return GRNLineItem(
        product_id=product_id,
        batch_number=str(batch_number).strip(),
        mfg_date=mfg,
        expiry_date=exp,
        received_qty=received_qty,
        unit_cost=float(unit_cost)
    )


def record_grn(cur, location_id: int, supplier_id: int, received_by: str,
               items_data: List[Dict[str, Any]], invoice_no: Optional[str] = None,
               remarks: Optional[str] = None) -> Dict[str, Any]:
    """
    Records a Goods Received Note at DC.
    Atomically updates batches, batch_stock (at DC), Products.stock_quantity,
    and writes stock_movements ledger.
    """
    if not items_data:
        raise ValidationError("GRN must contain at least one line item.")

    # Validate location is a DC
    cur.execute("SELECT code, name, type FROM locations WHERE location_id = %s", (location_id,))
    loc = cur.fetchone()
    if not loc:
        raise ValidationError(f"Location ID #{location_id} not found.")

    cur.execute("SELECT supplier_id, supplier_name FROM suppliers WHERE supplier_id = %s", (supplier_id,))
    sup = cur.fetchone()
    if not sup:
        raise ValidationError(f"Supplier ID #{supplier_id} not found.")

    grn_number = f"GRN-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    cur.execute("""
        INSERT INTO grn_receipts (grn_number, location_id, supplier_id, invoice_no, received_by, status, remarks)
        VALUES (%s, %s, %s, %s, %s, 'RECEIVED', %s)
    """, (grn_number, location_id, supplier_id, invoice_no, received_by, remarks))
    grn_id = cur.lastrowid

    recorded_items = []
    total_qty = 0
    total_value = 0.0

    for raw in items_data:
        pid = int(raw["product_id"])
        b_no = str(raw["batch_number"]).strip()
        mfg = raw["mfg_date"]
        exp = raw["expiry_date"]
        qty = int(raw["received_qty"])
        cost = float(raw.get("unit_cost", 0.0))

        valid_item = validate_batch_grn_item(pid, b_no, mfg, exp, qty, cost)

        # Check or insert into batches master
        cur.execute("SELECT batch_id FROM batches WHERE product_id = %s AND batch_number = %s", (pid, b_no))
        b_row = cur.fetchone()
        if b_row:
            batch_id = b_row[0]
        else:
            cur.execute("""
                INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, supplier_id, cost_price, mrp, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'ACTIVE')
            """, (pid, b_no, valid_item.mfg_date, valid_item.expiry_date, supplier_id, cost, raw.get("mrp", cost * 1.2)))
            batch_id = cur.lastrowid

        # Insert into grn_items
        cur.execute("""
            INSERT INTO grn_items (grn_id, product_id, batch_id, batch_number, mfg_date, expiry_date, received_qty, unit_cost)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (grn_id, pid, batch_id, b_no, valid_item.mfg_date, valid_item.expiry_date, qty, cost))

        # Update batch_stock at DC location
        cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE quantity_saleable = quantity_saleable + VALUES(quantity_saleable)
        """, (pid, location_id, batch_id, qty))

        # Update aggregate Products table stock
        cur.execute("UPDATE Products SET stock_quantity = stock_quantity + %s WHERE product_id = %s", (qty, pid))

        # Record movement in traceability ledger
        record_movement(
            cur, product_id=pid, batch_id=batch_id, batch_number=b_no,
            from_loc=None, to_loc=location_id, movement_type='GRN_RECEIPT',
            qty=qty, ref_type='GRN', ref_id=grn_number, user=received_by,
            notes=f"GRN from {sup[1]}"
        )

        recorded_items.append({
            "product_id": pid,
            "batch_id": batch_id,
            "batch_number": b_no,
            "expiry_date": str(valid_item.expiry_date),
            "received_qty": qty,
            "unit_cost": cost
        })
        total_qty += qty
        total_value += qty * cost

    return {
        "grn_id": grn_id,
        "grn_number": grn_number,
        "location": loc[1],
        "supplier": sup[1],
        "total_items": len(recorded_items),
        "total_quantity": total_qty,
        "total_value": round(total_value, 2),
        "items": recorded_items
    }


def record_movement(cur, product_id: int, batch_id: int, batch_number: str,
                    from_loc: Optional[int], to_loc: Optional[int],
                    movement_type: str, qty: int, ref_type: Optional[str],
                    ref_id: Optional[str], user: str, notes: Optional[str] = None):
    """Writes an immutable movement record for end-to-end traceability."""
    cur.execute("""
        INSERT INTO stock_movements (
            product_id, batch_id, batch_number, from_location_id, to_location_id,
            movement_type, quantity, reference_doc_type, reference_doc_id, performed_by, notes
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (product_id, batch_id, batch_number, from_loc, to_loc, movement_type, qty, ref_type, ref_id, user, notes))


# -----------------------------------------------------------------------------
# 2. System-Enforced FEFO (First Expired, First Out)
# -----------------------------------------------------------------------------
def allocate_fefo(cur, product_id: int, location_id: int, requested_qty: int,
                  allow_split: bool = True, override_batch_id: Optional[int] = None,
                  override_reason: Optional[str] = None, user_role: Optional[str] = None,
                  min_shelf_life_days: int = 0) -> List[Dict[str, Any]]:
    """
    Allocates stock according to FEFO (earliest expiry first).
    - Excludes expired or non-active batches.
    - Supports multi-batch splitting when one lot is insufficient.
    - Tie-breaks equal expiry dates by earliest batch_id.
    - Handles supervisor/admin permission-gated override with mandatory reason.
    - Enforces row-level locking via SELECT ... FOR UPDATE.
    """
    if requested_qty <= 0:
        raise ValidationError("Requested allocation quantity must be greater than zero.")

    # 1. Manual Override Branch
    if override_batch_id:
        if user_role not in ("admin", "store_supervisor"):
            raise PolicyViolationError(
                f"Unauthorized: Role '{user_role}' cannot override FEFO. Requires 'admin' or 'store_supervisor'."
            )
        if not override_reason or not str(override_reason).strip():
            raise PolicyViolationError("A mandatory override reason is required for manual FEFO overrides.")

        cur.execute("""
            SELECT bs.batch_id, b.batch_number, b.expiry_date, bs.quantity_saleable - bs.quantity_reserved, b.status
            FROM batch_stock bs
            JOIN batches b ON bs.batch_id = b.batch_id
            WHERE bs.batch_id = %s AND bs.location_id = %s AND bs.product_id = %s
            FOR UPDATE
        """, (override_batch_id, location_id, product_id))
        row = cur.fetchone()
        if not row:
            raise InsufficientStockError(f"Specified override batch #{override_batch_id} not found at location.")
        bid, b_no, exp, avail, status = row
        if status != "ACTIVE":
            raise PolicyViolationError(f"Cannot allocate batch #{override_batch_id} with status '{status}'.")
        if avail < requested_qty:
            raise InsufficientStockError(
                f"Override batch #{override_batch_id} has insufficient stock ({avail} available, {requested_qty} requested)."
            )

        return [{
            "batch_id": bid,
            "batch_number": b_no,
            "expiry_date": str(exp),
            "allocated_qty": requested_qty,
            "is_override": True,
            "override_reason": override_reason.strip()
        }]

    # 2. System-Enforced FEFO Branch
    cur.execute("""
        SELECT bs.batch_id, b.batch_number, b.mfg_date, b.expiry_date, 
               (bs.quantity_saleable - bs.quantity_reserved) AS available_qty, b.status
        FROM batch_stock bs
        JOIN batches b ON bs.batch_id = b.batch_id
        WHERE bs.product_id = %s 
          AND bs.location_id = %s 
          AND (bs.quantity_saleable - bs.quantity_reserved) > 0
          AND b.status = 'ACTIVE'
          AND b.expiry_date >= CURRENT_DATE()
        ORDER BY b.expiry_date ASC, b.batch_id ASC
        FOR UPDATE
    """, (product_id, location_id))
    candidates = cur.fetchall()

    if not candidates:
        raise InsufficientStockError(f"No active, non-expired stock available for product #{product_id} at location #{location_id}.")

    # Apply minimum remaining shelf-life rule if configured
    valid_candidates = []
    today = date.today()
    for row in candidates:
        bid, b_no, mfg, exp, avail, status = row
        exp_date = datetime.strptime(str(exp).split("T")[0], "%Y-%m-%d").date() if isinstance(exp, str) else exp
        days_rem = (exp_date - today).days
        if min_shelf_life_days > 0 and days_rem < min_shelf_life_days:
            continue  # Excluded due to shelf-life threshold
        valid_candidates.append((bid, b_no, exp_date, avail))

    if not valid_candidates:
        raise InsufficientStockError(
            f"Available batches for product #{product_id} do not satisfy minimum shelf life rule ({min_shelf_life_days} days)."
        )

    allocations = []
    remaining = requested_qty

    for bid, b_no, exp_date, avail in valid_candidates:
        if avail <= 0:
            continue
        take = min(avail, remaining)
        allocations.append({
            "batch_id": bid,
            "batch_number": b_no,
            "expiry_date": str(exp_date),
            "allocated_qty": take,
            "is_override": False,
            "override_reason": None
        })
        remaining -= take
        if remaining == 0:
            break
        if not allow_split:
            # Single lot requested but first lot wasn't enough
            allocations = []
            break

    if remaining > 0:
        total_avail = sum(c[3] for c in valid_candidates)
        raise InsufficientStockError(
            f"Insufficient stock for FEFO pick. Requested: {requested_qty}, Available across valid lots: {total_avail}."
        )

    return allocations


# -----------------------------------------------------------------------------
# 3. Store Replenishment Workflow (Request -> Allocate FEFO -> Pick -> Receive)
# -----------------------------------------------------------------------------
def create_replenishment_request(cur, from_location_id: int, to_location_id: int,
                                 requested_by: str, items_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Creates a store replenishment order requesting goods from a DC."""
    req_number = f"REQ-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    cur.execute("""
        INSERT INTO store_replenishments (request_number, from_location_id, to_location_id, requested_by, status)
        VALUES (%s, %s, %s, %s, 'REQUESTED')
    """, (req_number, from_location_id, to_location_id, requested_by))
    rep_id = cur.lastrowid

    for itm in items_data:
        cur.execute("""
            INSERT INTO replenishment_items (replenishment_id, product_id, requested_qty)
            VALUES (%s, %s, %s)
        """, (rep_id, itm["product_id"], itm["requested_qty"]))

    return {"replenishment_id": rep_id, "request_number": req_number, "status": "REQUESTED"}


def process_replenishment_allocation(cur, replenishment_id: int, allocated_by: str,
                                     user_role: str, overrides: Optional[Dict[int, Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Applies system-enforced FEFO allocation for a replenishment order.
    Reserves quantity in batch_stock.
    """
    cur.execute("SELECT from_location_id, to_location_id, status FROM store_replenishments WHERE replenishment_id = %s FOR UPDATE", (replenishment_id,))
    rep = cur.fetchone()
    if not rep:
        raise ValidationError(f"Replenishment request #{replenishment_id} not found.")
    from_loc, to_loc, status = rep
    if status != "REQUESTED":
        raise PolicyViolationError(f"Cannot allocate replenishment in status '{status}'. Must be 'REQUESTED'.")

    cur.execute("SELECT item_id, product_id, requested_qty FROM replenishment_items WHERE replenishment_id = %s", (replenishment_id,))
    req_items = cur.fetchall()

    # Normalize overrides (supports dict or list of dicts)
    ovr_map = {}
    if isinstance(overrides, list):
        for o in overrides:
            if isinstance(o, dict):
                k = o.get("product_id") or o.get("item_id")
                if k is not None:
                    ovr_map[k] = o
    elif isinstance(overrides, dict):
        ovr_map = overrides

    pick_list = []
    for item_id, pid, req_qty in req_items:
        ovr = ovr_map.get(pid) or ovr_map.get(item_id) or {}
        ovr_batch_id = ovr.get("override_batch_id") or ovr.get("batch_id")
        ovr_reason = ovr.get("reason")

        allocs = allocate_fefo(
            cur, product_id=pid, location_id=from_loc, requested_qty=req_qty,
            allow_split=True, override_batch_id=ovr_batch_id,
            override_reason=ovr_reason, user_role=user_role
        )

        for a in allocs:
            # Reserve stock in batch_stock at DC
            cur.execute("""
                UPDATE batch_stock 
                SET quantity_reserved = quantity_reserved + %s 
                WHERE product_id = %s AND batch_id = %s AND location_id = %s
            """, (a["allocated_qty"], pid, a["batch_id"], from_loc))

            cur.execute("""
                UPDATE replenishment_items 
                SET allocated_batch_id = %s, allocated_batch_number = %s, expiry_date = %s, 
                    allocated_qty = %s, is_override = %s, override_reason = %s, override_approved_by = %s
                WHERE item_id = %s
            """, (a["batch_id"], a["batch_number"], a["expiry_date"], a["allocated_qty"],
                  1 if a["is_override"] else 0, a["override_reason"], allocated_by if a["is_override"] else None, item_id))

            pick_list.append({
                "item_id": item_id,
                "product_id": pid,
                "batch_id": a["batch_id"],
                "batch_number": a["batch_number"],
                "expiry_date": a["expiry_date"],
                "quantity": a["allocated_qty"],
                "is_override": a["is_override"]
            })

    cur.execute("UPDATE store_replenishments SET status = 'ALLOCATED', allocated_by = %s WHERE replenishment_id = %s",
                (allocated_by, replenishment_id))

    return {
        "replenishment_id": replenishment_id,
        "status": "ALLOCATED",
        "pick_list": pick_list
    }


def dispatch_replenishment_transfer(cur, replenishment_id: int, picker: str) -> Dict[str, Any]:
    """
    Warehouse picker confirms picking.
    Deducts stock from DC and puts into in-transit transfer status.
    """
    cur.execute("SELECT from_location_id, to_location_id, request_number, status FROM store_replenishments WHERE replenishment_id = %s FOR UPDATE", (replenishment_id,))
    rep = cur.fetchone()
    if not rep or rep[3] != "ALLOCATED":
        raise PolicyViolationError(f"Replenishment order #{replenishment_id} must be in 'ALLOCATED' status to pick.")

    from_loc, to_loc, req_no, _ = rep

    cur.execute("""
        SELECT product_id, allocated_batch_id, allocated_batch_number, allocated_qty 
        FROM replenishment_items 
        WHERE replenishment_id = %s AND allocated_batch_id IS NOT NULL
    """, (replenishment_id,))
    items = cur.fetchall()

    for pid, bid, b_no, qty in items:
        # Release reservation and deduct saleable from DC
        cur.execute("""
            UPDATE batch_stock 
            SET quantity_saleable = quantity_saleable - %s,
                quantity_reserved = quantity_reserved - %s
            WHERE product_id = %s AND batch_id = %s AND location_id = %s
        """, (qty, qty, pid, bid, from_loc))

        record_movement(
            cur, product_id=pid, batch_id=bid, batch_number=b_no,
            from_loc=from_loc, to_loc=to_loc, movement_type='DC_TRANSFER_OUT',
            qty=qty, ref_type='REPLENISHMENT', ref_id=req_no, user=picker
        )

    cur.execute("UPDATE store_replenishments SET status = 'IN_TRANSIT' WHERE replenishment_id = %s", (replenishment_id,))
    return {"replenishment_id": replenishment_id, "status": "IN_TRANSIT"}


def receive_replenishment_at_store(cur, replenishment_id: int, receiver: str) -> Dict[str, Any]:
    """
    Store supervisor receives goods from DC at the retail store.
    Increments store batch stock.
    """
    cur.execute("SELECT from_location_id, to_location_id, request_number, status FROM store_replenishments WHERE replenishment_id = %s FOR UPDATE", (replenishment_id,))
    rep = cur.fetchone()
    if not rep or rep[3] != "IN_TRANSIT":
        raise PolicyViolationError(f"Replenishment #{replenishment_id} must be 'IN_TRANSIT' to receive at store.")

    from_loc, to_loc, req_no, _ = rep

    cur.execute("""
        SELECT product_id, allocated_batch_id, allocated_batch_number, allocated_qty 
        FROM replenishment_items 
        WHERE replenishment_id = %s AND allocated_batch_id IS NOT NULL
    """, (replenishment_id,))
    items = cur.fetchall()

    for pid, bid, b_no, qty in items:
        cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE quantity_saleable = quantity_saleable + VALUES(quantity_saleable)
        """, (pid, to_loc, bid, qty))

        record_movement(
            cur, product_id=pid, batch_id=bid, batch_number=b_no,
            from_loc=from_loc, to_loc=to_loc, movement_type='STORE_RECEIVE_IN',
            qty=qty, ref_type='REPLENISHMENT', ref_id=req_no, user=receiver
        )

    cur.execute("UPDATE store_replenishments SET status = 'RECEIVED' WHERE replenishment_id = %s", (replenishment_id,))
    return {"replenishment_id": replenishment_id, "status": "RECEIVED"}


# -----------------------------------------------------------------------------
# 4. Batch Traceability Query
# -----------------------------------------------------------------------------
def get_batch_traceability(cur, batch_number: str) -> Dict[str, Any]:
    """
    Returns full cradle-to-grave traceability for any batch number:
    Supplier -> GRN -> DC -> Store Transfer -> POS Sale / Scrap / Return.
    """
    cur.execute("""
        SELECT b.batch_id, b.product_id, p.p_name, p.category, b.batch_number, 
               b.mfg_date, b.expiry_date, b.cost_price, b.mrp, b.status,
               s.supplier_name, s.gstin
        FROM batches b
        JOIN Products p ON b.product_id = p.product_id
        LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
        WHERE b.batch_number = %s
    """, (batch_number,))
    batch_info = cur.fetchone()
    if not batch_info:
        raise ValidationError(f"Batch '{batch_number}' not found in system.")

    bid = batch_info[0]

    # Inventory breakdown by location
    cur.execute("""
        SELECT l.name, l.type, bs.quantity_saleable, bs.quantity_reserved, bs.quantity_scrap
        FROM batch_stock bs
        JOIN locations l ON bs.location_id = l.location_id
        WHERE bs.batch_id = %s
    """, (bid,))
    stock_breakdown = [
        {
            "location": r[0],
            "type": r[1],
            "saleable": r[2],
            "reserved": r[3],
            "scrap": r[4]
        }
        for r in cur.fetchall()
    ]

    # Chronological timeline from stock_movements
    cur.execute("""
        SELECT sm.movement_type, sm.quantity, sm.from_location_id, sm.to_location_id,
               sm.reference_doc_type, sm.reference_doc_id, sm.performed_by, sm.notes, sm.created_at,
               lf.name AS from_loc_name, lt.name AS to_loc_name
        FROM stock_movements sm
        LEFT JOIN locations lf ON sm.from_location_id = lf.location_id
        LEFT JOIN locations lt ON sm.to_location_id = lt.location_id
        WHERE sm.batch_id = %s
        ORDER BY sm.created_at ASC, sm.movement_id ASC
    """, (bid,))
    timeline = []
    for r in cur.fetchall():
        timeline.append({
            "type": r[0],
            "quantity": r[1],
            "from_location": r[9] or "External / Supplier",
            "to_location": r[10] or "Customer / Scrap",
            "reference_doc": f"{r[4]}: {r[5]}" if r[4] else "Direct",
            "performed_by": r[6],
            "notes": r[7],
            "timestamp": r[8].isoformat() if hasattr(r[8], "isoformat") else str(r[8])
        })

    mfg_dt = batch_info[5]
    exp_dt = batch_info[6]
    exp_date_obj = datetime.strptime(str(exp_dt).split("T")[0], "%Y-%m-%d").date() if isinstance(exp_dt, str) else exp_dt
    days_left = (exp_date_obj - date.today()).days

    return {
        "batch_id": bid,
        "product_id": batch_info[1],
        "product_name": batch_info[2],
        "category": batch_info[3],
        "batch_number": batch_info[4],
        "mfg_date": str(mfg_dt),
        "expiry_date": str(exp_dt),
        "days_to_expiry": days_left,
        "is_expired": days_left < 0,
        "cost_price": float(batch_info[7]),
        "mrp": float(batch_info[8]),
        "status": batch_info[9],
        "supplier_name": batch_info[10] or "Direct Inward",
        "supplier_gstin": batch_info[11] or "N/A",
        "inventory": stock_breakdown,
        "movement_count": len(timeline),
        "timeline": timeline
    }


# -----------------------------------------------------------------------------
# 5. Near-Expiry Reports, Dump Stock, and Transfer Advice
# -----------------------------------------------------------------------------
def get_expiry_stock_report(cur, days_threshold: int = 30, location_id: Optional[int] = None,
                            category: Optional[str] = None, supplier_id: Optional[int] = None,
                            product_id: Optional[int] = None) -> Dict[str, Any]:
    """Generates Expiry Stock Report filterable by presets (30/60/90 days), DC/Store, Category, Supplier."""
    query = """
        SELECT p.product_id, p.p_name, p.category, b.batch_id, b.batch_number,
               b.expiry_date, DATEDIFF(b.expiry_date, CURRENT_DATE()) AS days_to_expiry,
               bs.quantity_saleable, b.cost_price, (bs.quantity_saleable * b.cost_price) AS inventory_cost,
               l.location_id, l.name AS location_name, l.type AS location_type,
               s.supplier_name
        FROM batch_stock bs
        JOIN batches b ON bs.batch_id = b.batch_id
        JOIN Products p ON bs.product_id = p.product_id
        JOIN locations l ON bs.location_id = l.location_id
        LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
        WHERE bs.quantity_saleable > 0
          AND DATEDIFF(b.expiry_date, CURRENT_DATE()) <= %s
    """
    params = [days_threshold]

    if location_id:
        query += " AND bs.location_id = %s"
        params.append(location_id)
    if category:
        query += " AND p.category = %s"
        params.append(category)
    if supplier_id:
        query += " AND b.supplier_id = %s"
        params.append(supplier_id)
    if product_id:
        query += " AND bs.product_id = %s"
        params.append(product_id)

    query += " ORDER BY days_to_expiry ASC, b.expiry_date ASC"
    cur.execute(query, params)

    items = []
    total_qty = 0
    total_cost_val = 0.0

    for r in cur.fetchall():
        days_exp = int(r[6])
        qty = int(r[7])
        cost = float(r[8])
        val = float(r[9])

        items.append({
            "product_id": r[0],
            "product_name": r[1],
            "category": r[2],
            "batch_id": r[3],
            "batch_number": r[4],
            "expiry_date": str(r[5]),
            "days_to_expiry": days_exp,
            "status": "EXPIRED" if days_exp < 0 else "NEAR_EXPIRY",
            "quantity": qty,
            "cost_price": cost,
            "inventory_value_cost": round(val, 2),
            "location_id": r[10],
            "location_name": r[11],
            "location_type": r[12],
            "supplier_name": r[13] or "N/A"
        })
        total_qty += qty
        total_cost_val += val

    return {
        "filter_days": days_threshold,
        "total_records": len(items),
        "total_units": total_qty,
        "total_cost_value": round(total_cost_val, 2),
        "records": items
    }


def detect_dump_stock(cur, days_threshold: int = 30, sales_lookback_days: int = 30) -> List[Dict[str, Any]]:
    """
    Identifies slow-moving 'dump' stock where:
    days_of_stock_cover > days_to_expiry.
    """
    # 1. Fetch near-expiry items
    cur.execute("""
        SELECT bs.location_id, l.name AS location_name, bs.product_id, p.p_name,
               bs.batch_id, b.batch_number, b.expiry_date,
               DATEDIFF(b.expiry_date, CURRENT_DATE()) AS days_to_expiry,
               bs.quantity_saleable, b.cost_price
        FROM batch_stock bs
        JOIN batches b ON bs.batch_id = b.batch_id
        JOIN Products p ON bs.product_id = p.product_id
        JOIN locations l ON bs.location_id = l.location_id
        WHERE bs.quantity_saleable > 0 
          AND DATEDIFF(b.expiry_date, CURRENT_DATE()) BETWEEN 1 AND %s
          AND b.status = 'ACTIVE'
    """, (days_threshold,))
    candidate_lots = cur.fetchall()

    dump_items = []
    for r in candidate_lots:
        loc_id, loc_name, pid, p_name, bid, b_no, exp, days_to_exp, qty, cost = r

        # Calculate average daily sales at this location over lookback days
        cur.execute("""
            SELECT COALESCE(SUM(quantity), 0)
            FROM Sales
            WHERE product_id = %s 
              AND (location_id = %s OR location_id IS NULL)
              AND Date >= DATE_SUB(NOW(), INTERVAL %s DAY)
        """, (pid, loc_id, sales_lookback_days))
        sales_qty = cur.fetchone()[0] or 0
        avg_daily_sales = float(sales_qty) / float(sales_lookback_days)

        if avg_daily_sales > 0:
            days_cover = round(qty / avg_daily_sales, 1)
        else:
            days_cover = 999.0  # Zero sales velocity

        if days_cover > days_to_exp:
            dump_items.append({
                "location_id": loc_id,
                "location_name": loc_name,
                "product_id": pid,
                "product_name": p_name,
                "batch_id": bid,
                "batch_number": b_no,
                "expiry_date": str(exp),
                "days_to_expiry": days_to_exp,
                "current_stock": qty,
                "avg_daily_sales": round(avg_daily_sales, 2),
                "days_of_stock_cover": days_cover,
                "unsellable_units_at_risk": max(0, int(qty - (avg_daily_sales * days_to_exp))),
                "risk_severity": "CRITICAL" if days_cover > (days_to_exp * 2) else "HIGH"
            })

    dump_items.sort(key=lambda x: x["days_to_expiry"])
    return dump_items


def get_interstore_transfer_suggestions(cur) -> List[Dict[str, Any]]:
    """
    Suggests rebalancing stock from Low Footfall stores to High Footfall stores
    to prevent expiry dumping. Suggestions only; no automatic transfer.
    """
    # Find near-expiry batches (<= 45 days) sitting in low-footfall stores
    cur.execute("""
        SELECT bs.location_id, lf.name AS source_store, bs.product_id, p.p_name,
               bs.batch_id, b.batch_number, b.expiry_date,
               DATEDIFF(b.expiry_date, CURRENT_DATE()) AS days_to_exp,
               bs.quantity_saleable, b.cost_price
        FROM batch_stock bs
        JOIN locations lf ON bs.location_id = lf.location_id
        JOIN batches b ON bs.batch_id = b.batch_id
        JOIN Products p ON bs.product_id = p.product_id
        WHERE lf.footfall_tier IN ('LOW', 'MEDIUM')
          AND bs.quantity_saleable > 5
          AND DATEDIFF(b.expiry_date, CURRENT_DATE()) BETWEEN 7 AND 45
          AND b.status = 'ACTIVE'
    """)
    candidates = cur.fetchall()

    suggestions = []
    # Identify high footfall destinations
    cur.execute("SELECT location_id, name FROM locations WHERE footfall_tier = 'HIGH' AND type = 'STORE'")
    high_stores = cur.fetchall()
    if not high_stores:
        return []

    for r in candidates:
        src_id, src_name, pid, p_name, bid, b_no, exp, days_to_exp, qty, cost = r

        for dest_id, dest_name in high_stores:
            if dest_id == src_id:
                continue

            # Check destination sales velocity
            cur.execute("""
                SELECT COALESCE(SUM(quantity), 0) FROM Sales 
                WHERE product_id = %s AND location_id = %s AND Date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            """, (pid, dest_id))
            dest_sales_30 = cur.fetchone()[0]

            if dest_sales_30 > 10:  # Destination has high velocity
                suggested_move_qty = min(qty - 2, int(dest_sales_30 / 2))
                if suggested_move_qty > 0:
                    suggestions.append({
                        "product_id": pid,
                        "product_name": p_name,
                        "batch_id": bid,
                        "batch_number": b_no,
                        "expiry_date": str(exp),
                        "days_to_expiry": days_to_exp,
                        "source_store": src_name,
                        "source_location_id": src_id,
                        "suggested_destination": dest_name,
                        "destination_location_id": dest_id,
                        "suggested_transfer_quantity": suggested_move_qty,
                        "destination_monthly_velocity": dest_sales_30,
                        "rationale": f"High footfall at {dest_name} can absorb {suggested_move_qty} units before expiry ({days_to_exp}d left)."
                    })

    return suggestions


# -----------------------------------------------------------------------------
# 6. Code Management (Store Physical Audits)
# -----------------------------------------------------------------------------
def create_code_audit(cur, location_id: int, created_by: str) -> Dict[str, Any]:
    """Generates a scheduled physical count task for a store listing batches."""
    audit_number = f"AUD-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    cur.execute("""
        INSERT INTO code_management_audits (audit_number, location_id, created_by, status)
        VALUES (%s, %s, %s, 'PENDING_COUNT')
    """, (audit_number, location_id, created_by))
    audit_id = cur.lastrowid

    # Populate audit items from current batch_stock
    cur.execute("""
        SELECT bs.product_id, bs.batch_id, bs.quantity_saleable
        FROM batch_stock bs
        JOIN batches b ON bs.batch_id = b.batch_id
        WHERE bs.location_id = %s AND bs.quantity_saleable > 0
    """, (location_id,))
    rows = cur.fetchall()

    for pid, bid, sys_qty in rows:
        cur.execute("""
            INSERT INTO audit_items (audit_id, product_id, batch_id, system_qty)
            VALUES (%s, %s, %s, %s)
        """, (audit_id, pid, bid, sys_qty))

    return {
        "audit_id": audit_id,
        "audit_number": audit_number,
        "total_batches_to_count": len(rows),
        "status": "PENDING_COUNT"
    }


def submit_code_audit(cur, audit_id: int, physical_counts: List[Dict[str, Any]], submitted_by: str) -> Dict[str, Any]:
    """Store executive records physical counts and calculates discrepancies."""
    cur.execute("SELECT status, location_id FROM code_management_audits WHERE audit_id = %s FOR UPDATE", (audit_id,))
    row = cur.fetchone()
    if not row or row[0] != "PENDING_COUNT":
        raise PolicyViolationError(f"Audit #{audit_id} is not in 'PENDING_COUNT' status.")

    total_discrepancies = 0
    for count in physical_counts:
        item_id = count["audit_item_id"]
        phys_qty = int(count["physical_qty"])
        remarks = count.get("remarks", "")

        cur.execute("SELECT system_qty FROM audit_items WHERE audit_item_id = %s", (item_id,))
        sys_qty = cur.fetchone()[0]
        disc = phys_qty - sys_qty
        if disc != 0:
            total_discrepancies += 1

        cur.execute("""
            UPDATE audit_items 
            SET physical_qty = %s, discrepancy_qty = %s, remarks = %s
            WHERE audit_item_id = %s
        """, (phys_qty, disc, remarks, item_id))

    cur.execute("""
        UPDATE code_management_audits 
        SET status = 'SUBMITTED', submitted_by = %s 
        WHERE audit_id = %s
    """, (submitted_by, audit_id))
    return {"audit_id": audit_id, "status": "SUBMITTED", "discrepant_batches": total_discrepancies}


def approve_code_audit(cur, audit_id: int, approved_by: str, user_role: str = "store_supervisor") -> Dict[str, Any]:
    """
    Supervisor approves audit and applies adjustments to batch_stock and movements.
    Strictly enforces Segregation of Duties: approver != person who submitted physical counts.
    """
    cur.execute("""
        SELECT location_id, audit_number, status, created_by, submitted_by 
        FROM code_management_audits 
        WHERE audit_id = %s FOR UPDATE
    """, (audit_id,))
    audit = cur.fetchone()
    if not audit or audit[2] != "SUBMITTED":
        raise PolicyViolationError(f"Audit #{audit_id} must be 'SUBMITTED' before approval.")

    loc_id, audit_no, _, creator, submitter = audit

    # Segregation of Duties validation
    count_submitter = submitter or creator
    validate_segregation_of_duties(count_submitter, approved_by, f"Audit #{audit_no} Discrepancy Approval")

    cur.execute("""
        SELECT ai.product_id, ai.batch_id, ai.system_qty, ai.physical_qty, ai.discrepancy_qty, b.batch_number
        FROM audit_items ai
        JOIN batches b ON ai.batch_id = b.batch_id
        WHERE ai.audit_id = %s AND ai.discrepancy_qty IS NOT NULL AND ai.discrepancy_qty != 0
    """, (audit_id,))
    discrepancies = cur.fetchall()

    for pid, bid, sys_qty, phys_qty, disc, b_no in discrepancies:
        cur.execute("""
            UPDATE batch_stock SET quantity_saleable = %s 
            WHERE product_id = %s AND batch_id = %s AND location_id = %s
        """, (phys_qty, pid, bid, loc_id))

        cur.execute("UPDATE Products SET stock_quantity = stock_quantity + %s WHERE product_id = %s", (disc, pid))

        record_movement(
            cur, product_id=pid, batch_id=bid, batch_number=b_no,
            from_loc=loc_id if disc < 0 else None,
            to_loc=loc_id if disc > 0 else None,
            movement_type='AUDIT_ADJUSTMENT', qty=abs(disc),
            ref_type='AUDIT', ref_id=audit_no, user=approved_by,
            notes=f"Physical count adjustment: was {sys_qty}, verified {phys_qty}"
        )

    cur.execute("""
        UPDATE code_management_audits 
        SET status = 'APPROVED', approved_by = %s, completed_at = NOW() 
        WHERE audit_id = %s
    """, (approved_by, audit_id))

    log_audit_event(
        cur, action_type="AUDIT_DISCREPANCY_APPROVED", entity_type="AUDIT", entity_id=audit_no,
        user_id=0, username=approved_by, user_role=user_role,
        store_id=loc_id, details={"audit_id": audit_id, "adjustments_count": len(discrepancies), "submitted_by": count_submitter}
    )

    return {"audit_id": audit_id, "status": "APPROVED", "adjustments_applied": len(discrepancies)}


def propose_markdown(cur, location_id: int, product_id: int, batch_id: int,
                     proposed_discount: float, proposed_by: str, notes: Optional[str] = None) -> Dict[str, Any]:
    """Store executive or supervisor proposes a markdown promotion on near-expiry stock."""
    cur.execute("""
        SELECT p.price, p.cost, COALESCE(p.floor_price_percent, 50.00), bs.quantity_saleable,
               DATEDIFF(b.expiry_date, CURRENT_DATE()), b.batch_number
        FROM Products p
        JOIN batches b ON b.product_id = p.product_id
        JOIN batch_stock bs ON bs.batch_id = b.batch_id AND bs.location_id = %s
        WHERE p.product_id = %s AND b.batch_id = %s
    """, (location_id, product_id, batch_id))
    row = cur.fetchone()
    if not row:
        raise ValidationError("Specified product/batch/location not found.")

    price, cost, floor_pct, stock_qty, days_left, b_no = row
    orig_price = float(price)
    discounted_price = round(orig_price * (1.0 - (proposed_discount / 100.0)), 2)
    floor_price = max(float(cost), round(orig_price * (float(floor_pct) / 100.0), 2))
    is_below_floor = discounted_price < floor_price

    promo_code = f"MKD-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    cur.execute("""
        INSERT INTO markdown_promotions (
            promotion_code, product_id, batch_id, location_id, days_to_expiry_at_creation,
            suggested_discount_percent, approved_discount_percent, original_price,
            markdown_price, floor_price, is_below_floor, status, created_by,
            approval_notes, start_date, end_date
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'PROPOSED', %s, %s, CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY))
    """, (
        promo_code, product_id, batch_id, location_id, days_left,
        proposed_discount, proposed_discount, orig_price, discounted_price,
        floor_price, 1 if is_below_floor else 0, proposed_by, notes
    ))
    mkd_id = cur.lastrowid
    return {
        "markdown_id": mkd_id,
        "promotion_code": promo_code,
        "status": "PROPOSED",
        "markdown_price": discounted_price,
        "floor_price": floor_price,
        "is_below_floor": is_below_floor
    }


def approve_markdown(cur, markdown_id: int, approved_discount: float, approved_by: str,
                     user_role: str, notes: Optional[str] = None) -> Dict[str, Any]:
    """Approves a markdown promotion, activating it for POS push-sale."""
    if user_role not in ("admin", "store_supervisor", "category_manager"):
        raise PolicyViolationError(f"Role '{user_role}' is not authorized to approve markdowns.")

    cur.execute("""
        SELECT m.markdown_id, m.product_id, m.batch_id, m.location_id, m.original_price,
               m.floor_price, m.status, m.created_by, b.batch_number, bs.quantity_saleable
        FROM markdown_promotions m
        JOIN batches b ON m.batch_id = b.batch_id
        JOIN batch_stock bs ON bs.batch_id = b.batch_id AND bs.location_id = m.location_id
        WHERE m.markdown_id = %s FOR UPDATE
    """, (markdown_id,))
    mkd = cur.fetchone()
    if not mkd:
        raise ValidationError(f"Markdown #{markdown_id} not found.")

    m_id, pid, bid, loc_id, orig_price, floor_price, status, creator, b_no, stock_qty = mkd
    if status != "PROPOSED":
        raise PolicyViolationError(f"Markdown #{markdown_id} is in '{status}' status, cannot approve.")

    # Segregation of Duties Check
    validate_segregation_of_duties(creator, approved_by, f"Markdown #{markdown_id} Approval")

    # Policy check: supervisor discount limit
    cur.execute("SELECT policy_value FROM system_policies WHERE policy_key = 'supervisor_max_discount_pct'")
    sup_lim_row = cur.fetchone()
    sup_max_disc = float(sup_lim_row[0]) if sup_lim_row else 20.0

    if user_role == "store_supervisor" and approved_discount > sup_max_disc:
        raise PolicyViolationError(
            f"Discount of {approved_discount}% exceeds Store Supervisor approval limit of {sup_max_disc}%. "
            f"Requires Category Manager or Admin approval."
        )

    orig_price_f = float(orig_price)
    floor_price_f = float(floor_price)
    new_price = round(orig_price_f * (1.0 - (approved_discount / 100.0)), 2)
    is_below_floor = new_price < floor_price_f

    if is_below_floor and user_role not in ("admin", "category_manager"):
        raise PolicyViolationError(
            f"Price ₹{new_price} is below floor policy ₹{floor_price_f}. Requires Category Manager or Admin approval."
        )

    cur.execute("""
        UPDATE markdown_promotions 
        SET approved_discount_percent = %s, markdown_price = %s, is_below_floor = %s,
            status = 'ACTIVE', approved_by = %s, approval_notes = %s,
            start_date = CURRENT_DATE(), end_date = DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY)
        WHERE markdown_id = %s
    """, (approved_discount, new_price, 1 if is_below_floor else 0, approved_by, notes, markdown_id))

    # Initialize or update sales tracking
    cur.execute("""
        INSERT INTO markdown_sales_tracking (markdown_id, batch_id, units_initially_marked_down, units_sold, revenue_generated)
        VALUES (%s, %s, %s, 0, 0.00)
        ON DUPLICATE KEY UPDATE units_initially_marked_down = VALUES(units_initially_marked_down)
    """, (markdown_id, bid, stock_qty))

    log_audit_event(
        cur, action_type="MARKDOWN_APPROVED", entity_type="MARKDOWN", entity_id=str(markdown_id),
        user_id=0, username=approved_by, user_role=user_role,
        store_id=loc_id, details={"discount_pct": approved_discount, "markdown_price": new_price, "floor_price": floor_price_f, "proposer": creator}
    )

    return {
        "markdown_id": markdown_id,
        "status": "ACTIVE",
        "approved_discount_percent": approved_discount,
        "markdown_price": new_price,
        "floor_price": floor_price_f
    }


def get_pending_approvals(cur, user_role: str, user_store_id: Optional[int], username: str) -> Dict[str, Any]:
    """Unified multi-role governance inbox returning items awaiting review with Segregation of Duties guard."""
    # 1. Pending Audits (status: SUBMITTED)
    audit_query = """
        SELECT a.audit_id, a.audit_number, a.location_id, l.name, a.created_by, a.submitted_by,
               a.created_at, COUNT(ai.audit_item_id) AS total_items,
               SUM(CASE WHEN ai.discrepancy_qty != 0 THEN 1 ELSE 0 END) AS discrepancies
        FROM code_management_audits a
        JOIN locations l ON a.location_id = l.location_id
        LEFT JOIN audit_items ai ON a.audit_id = ai.audit_id
        WHERE a.status = 'SUBMITTED'
    """
    params = []
    if user_role in ("store_supervisor", "store_executive") and user_store_id:
        audit_query += " AND a.location_id = %s"
        params.append(user_store_id)
    audit_query += " GROUP BY a.audit_id ORDER BY a.created_at DESC"
    cur.execute(audit_query, params)

    audits = []
    for r in cur.fetchall():
        sub = r[5] or r[4]
        can_app = (user_role in ("admin", "store_supervisor")) and (username != sub)
        audits.append({
            "audit_id": r[0], "audit_number": r[1], "location_id": r[2], "location_name": r[3],
            "created_by": r[4], "submitted_by": sub, "created_at": str(r[6]),
            "total_items": r[7], "discrepancies": r[8],
            "can_approve": can_app,
            "sod_blocked": username == sub
        })

    # 2. Pending Markdowns (status: PROPOSED)
    mkd_query = """
        SELECT m.markdown_id, m.promotion_code, m.product_id, p.p_name, m.batch_id, b.batch_number,
               m.location_id, l.name, m.suggested_discount_percent, m.original_price, m.markdown_price,
               m.floor_price, m.is_below_floor, m.created_by, m.created_at
        FROM markdown_promotions m
        JOIN Products p ON m.product_id = p.product_id
        JOIN batches b ON m.batch_id = b.batch_id
        JOIN locations l ON m.location_id = l.location_id
        WHERE m.status = 'PROPOSED'
    """
    mkd_params = []
    if user_role in ("store_supervisor", "store_executive") and user_store_id:
        mkd_query += " AND m.location_id = %s"
        mkd_params.append(user_store_id)
    mkd_query += " ORDER BY m.created_at DESC"
    cur.execute(mkd_query, mkd_params)

    markdowns = []
    for r in cur.fetchall():
        creator = r[13]
        disc = float(r[8])
        below_fl = bool(r[12])
        # Supervisor can approve if <= 20% and not below floor, otherwise Cat Mgr / Admin
        role_allowed = (user_role in ("admin", "category_manager")) or (user_role == "store_supervisor" and disc <= 20.0 and not below_fl)
        can_app = role_allowed and (username != creator)
        markdowns.append({
            "markdown_id": r[0], "promotion_code": r[1], "product_id": r[2], "product_name": r[3],
            "batch_id": r[4], "batch_number": r[5], "location_id": r[6], "location_name": r[7],
            "proposed_discount_percent": disc, "original_price": float(r[9]), "markdown_price": float(r[10]),
            "floor_price": float(r[11]), "is_below_floor": below_fl, "created_by": creator,
            "created_at": str(r[14]), "can_approve": can_app, "sod_blocked": username == creator
        })

    # 3. Pending Expiry Returns (status: DRAFT)
    ret_query = """
        SELECT r.return_id, r.return_number, r.location_id, l.name, r.product_id, p.p_name,
               r.batch_id, b.batch_number, r.quantity, r.total_claim_amount, r.created_by, r.created_at
        FROM vendor_expiry_returns r
        JOIN Products p ON r.product_id = p.product_id
        JOIN batches b ON r.batch_id = b.batch_id
        JOIN locations l ON r.location_id = l.location_id
        WHERE r.status = 'DRAFT'
    """
    ret_params = []
    if user_role in ("store_supervisor", "store_executive") and user_store_id:
        ret_query += " AND r.location_id = %s"
        ret_params.append(user_store_id)
    ret_query += " ORDER BY r.created_at DESC"
    cur.execute(ret_query, ret_params)

    returns = []
    for r in cur.fetchall():
        creator = r[10]
        can_app = (user_role in ("admin", "store_supervisor")) and (username != creator)
        returns.append({
            "return_id": r[0], "return_number": r[1], "location_id": r[2], "location_name": r[3],
            "product_id": r[4], "product_name": r[5], "batch_id": r[6], "batch_number": r[7],
            "quantity": r[8], "total_claim_amount": float(r[9]), "created_by": creator,
            "created_at": str(r[11]), "can_approve": can_app, "sod_blocked": username == creator
        })

    return {"pending_audits": audits, "pending_markdowns": markdowns, "pending_returns": returns}


# -----------------------------------------------------------------------------
# 7. Near-Expiry Markdowns & Push Sale
# -----------------------------------------------------------------------------
def calculate_markdown_suggestions(cur, location_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Calculates markdown suggestions based on near-expiry thresholds:
    - 30 days: 10%
    - 15 days: 25%
    - 7 days: 50%
    Enforces floor price policy: price cannot fall below cost without supervisor override.
    """
    query = """
        SELECT bs.location_id, l.name AS location_name, bs.product_id, p.p_name,
               p.price, p.cost, COALESCE(p.floor_price_percent, 50.00) AS floor_pct,
               bs.batch_id, b.batch_number, b.expiry_date,
               DATEDIFF(b.expiry_date, CURRENT_DATE()) AS days_to_expiry,
               bs.quantity_saleable
        FROM batch_stock bs
        JOIN batches b ON bs.batch_id = b.batch_id
        JOIN Products p ON bs.product_id = p.product_id
        JOIN locations l ON bs.location_id = l.location_id
        WHERE bs.quantity_saleable > 0 
          AND DATEDIFF(b.expiry_date, CURRENT_DATE()) BETWEEN 1 AND 30
          AND b.status = 'ACTIVE'
    """
    params = []
    if location_id:
        query += " AND bs.location_id = %s"
        params.append(location_id)

    cur.execute(query, params)
    suggestions = []

    for r in cur.fetchall():
        loc_id, loc_name, pid, p_name, price, cost, floor_pct, bid, b_no, exp, days_left, qty = r

        # Determine suggested discount %
        if days_left <= 7:
            suggested_pct = 50.0
        elif days_left <= 15:
            suggested_pct = 25.0
        else:
            suggested_pct = 10.0

        orig_price = float(price)
        markdown_price = round(orig_price * (1.0 - (suggested_pct / 100.0)), 2)
        # Floor price is maximum of item cost or floor percentage of original price
        floor_price = max(float(cost), round(orig_price * (float(floor_pct) / 100.0), 2))
        is_below_floor = markdown_price < floor_price

        suggestions.append({
            "location_id": loc_id,
            "location_name": loc_name,
            "product_id": pid,
            "product_name": p_name,
            "batch_id": bid,
            "batch_number": b_no,
            "expiry_date": str(exp),
            "days_to_expiry": days_left,
            "stock_quantity": qty,
            "original_price": orig_price,
            "cost_price": float(cost),
            "suggested_discount_percent": suggested_pct,
            "markdown_price": markdown_price,
            "floor_price": floor_price,
            "is_below_floor": is_below_floor
        })

    return suggestions





def get_active_markdown_for_batch(cur, batch_id: int, location_id: int) -> Optional[Dict[str, Any]]:
    """Checks if a batch currently has an active push-sale promotion."""
    cur.execute("""
        SELECT markdown_id, approved_discount_percent, markdown_price
        FROM markdown_promotions
        WHERE batch_id = %s AND location_id = %s AND status = 'ACTIVE' 
          AND CURRENT_DATE() BETWEEN start_date AND end_date
        LIMIT 1
    """, (batch_id, location_id))
    row = cur.fetchone()
    if row:
        return {
            "markdown_id": row[0],
            "approved_discount_percent": float(row[1]),
            "markdown_price": float(row[2])
        }
    return None


# -----------------------------------------------------------------------------
# 8. Vendor Expiry Returns, Scrap Ledger, and Debit Notes
# -----------------------------------------------------------------------------
def create_expiry_return(cur, location_id: int, supplier_id: int, product_id: int,
                         batch_id: int, qty: int, created_by: str, reason: str = "Hit Supplier Expiry Return Window") -> Dict[str, Any]:
    """Drafts an expiry return document for lots hitting the vendor return window."""
    if qty <= 0:
        raise ValidationError("Return quantity must be greater than zero.")

    cur.execute("SELECT cost_price, expiry_date, supplier_id FROM batches WHERE batch_id = %s", (batch_id,))
    b_row = cur.fetchone()
    if not b_row:
        raise ValidationError(f"Batch #{batch_id} not found.")
    cost, exp, b_sup = b_row
    unit_cost = float(cost)

    # Reference original GRN if available
    cur.execute("SELECT grn_id FROM grn_items WHERE batch_id = %s ORDER BY grn_item_id DESC LIMIT 1", (batch_id,))
    grn_row = cur.fetchone()
    grn_id = grn_row[0] if grn_row else None

    return_number = f"RET-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    idempotency_key = f"IDEMP-RET-{batch_id}-{location_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    total_claim = round(qty * unit_cost, 2)

    cur.execute("""
        INSERT INTO vendor_expiry_returns (
            return_number, location_id, supplier_id, product_id, batch_id, grn_id,
            quantity, unit_cost, total_claim_amount, reason, created_by, status, idempotency_key
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'DRAFT', %s)
    """, (return_number, location_id, supplier_id, product_id, batch_id, grn_id, qty, unit_cost, total_claim, reason, created_by, idempotency_key))
    ret_id = cur.lastrowid

    return {
        "return_id": ret_id,
        "return_number": return_number,
        "status": "DRAFT",
        "quantity": qty,
        "total_claim_amount": total_claim,
        "idempotency_key": idempotency_key
    }


def post_expiry_return_atomic(cur, return_id: int, posted_by: str) -> Dict[str, Any]:
    """
    Atomically posts vendor expiry return:
    1. Locks batch stock row via FOR UPDATE.
    2. Moves qty from quantity_saleable to quantity_scrap.
    3. Blocks units from POS.
    4. Generates an official debit note against the supplier.
    5. Writes stock_movements ledger.
    6. Guarantees idempotency.
    7. Enforces Segregation of Duties: drafter cannot approve & post.
    """
    cur.execute("""
        SELECT return_id, return_number, location_id, supplier_id, product_id,
               batch_id, grn_id, quantity, unit_cost, total_claim_amount, status, idempotency_key, created_by
        FROM vendor_expiry_returns
        WHERE return_id = %s
        FOR UPDATE
    """, (return_id,))
    ret = cur.fetchone()
    if not ret:
        raise ValidationError(f"Return document #{return_id} not found.")

    ret_id, ret_no, loc_id, sup_id, pid, bid, grn_id, qty, unit_cost, claim_amt, status, idemp_key = ret[:12]
    creator = ret[12] if len(ret) > 12 else "store_executive"

    if status != "DRAFT":
        raise PolicyViolationError(f"Idempotency Guard: Return #{ret_no} has already been posted (status: {status}).")

    # Segregation of Duties Check: drafter cannot approve & post
    validate_segregation_of_duties(creator, posted_by, f"Return #{ret_no} Posting")

    # Lock batch_stock row
    cur.execute("""
        SELECT quantity_saleable, quantity_scrap FROM batch_stock
        WHERE product_id = %s AND batch_id = %s AND location_id = %s
        FOR UPDATE
    """, (pid, bid, loc_id))
    stock_row = cur.fetchone()
    if not stock_row:
        raise InsufficientStockError("Batch stock record does not exist at location.")

    saleable, scrap = stock_row
    if saleable < qty:
        raise InsufficientStockError(f"Insufficient saleable stock to return. Have: {saleable}, Requested: {qty}.")

    # 1. Atomically transfer saleable -> scrap ledger
    cur.execute("""
        UPDATE batch_stock 
        SET quantity_saleable = quantity_saleable - %s,
            quantity_scrap = quantity_scrap + %s
        WHERE product_id = %s AND batch_id = %s AND location_id = %s
    """, (qty, qty, pid, bid, loc_id))

    # 2. Update aggregate catalog stock
    cur.execute("UPDATE Products SET stock_quantity = stock_quantity - %s WHERE product_id = %s", (qty, pid))

    # 3. Check if batch is completely scrapped
    cur.execute("SELECT SUM(quantity_saleable) FROM batch_stock WHERE batch_id = %s", (bid,))
    rem_saleable = cur.fetchone()[0] or 0
    if rem_saleable == 0:
        cur.execute("UPDATE batches SET status = 'SCRAP' WHERE batch_id = %s", (bid,))

    # 4. Generate official Debit Note against Supplier
    dn_number = f"DN-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    taxable_amount = float(claim_amt)
    gst_rate = 0.18  # Standard GST rate for return claim
    gst_amount = round(taxable_amount * gst_rate, 2)
    total_dn_amount = round(taxable_amount + gst_amount, 2)

    cur.execute("""
        INSERT INTO debit_notes (debit_note_number, return_id, supplier_id, issue_date, taxable_amount, gst_amount, total_amount, status)
        VALUES (%s, %s, %s, CURRENT_DATE(), %s, %s, %s, 'ISSUED')
    """, (dn_number, ret_id, sup_id, taxable_amount, gst_amount, total_dn_amount))
    dn_id = cur.lastrowid

    # 5. Record movement in audit ledger
    cur.execute("SELECT batch_number FROM batches WHERE batch_id = %s", (bid,))
    b_no = cur.fetchone()[0]
    record_movement(
        cur, product_id=pid, batch_id=bid, batch_number=b_no,
        from_loc=loc_id, to_loc=None, movement_type='VENDOR_RETURN',
        qty=qty, ref_type='DEBIT_NOTE', ref_id=dn_number, user=posted_by,
        notes=f"Moved {qty} units to scrap ledger and issued Debit Note {dn_number}"
    )

    # 6. Mark return as POSTED
    cur.execute("""
        UPDATE vendor_expiry_returns 
        SET status = 'POSTED', posted_at = NOW(), posted_by = %s 
        WHERE return_id = %s
    """, (posted_by, ret_id))

    log_audit_event(
        cur, action_type="EXPIRY_RETURN_POSTED", entity_type="RETURN", entity_id=ret_no,
        user_id=0, username=posted_by, user_role="store_supervisor",
        store_id=loc_id, details={"return_id": ret_id, "debit_note": dn_number, "qty": qty, "total_claim": total_dn_amount, "drafter": creator}
    )

    return {
        "return_id": ret_id,
        "return_number": ret_no,
        "status": "POSTED",
        "debit_note_id": dn_id,
        "debit_note_number": dn_number,
        "taxable_amount": taxable_amount,
        "gst_amount": gst_amount,
        "total_credit_amount": total_dn_amount,
        "message": f"Successfully moved {qty} units to scrap ledger and generated Debit Note {dn_number}."
    }


def acknowledge_debit_note(cur, debit_note_id: int, acknowledged_by: str, user_role: str) -> Dict[str, Any]:
    """Accounts officer marks debit note as acknowledged by supplier."""
    if user_role not in ("admin", "accounts"):
        raise PolicyViolationError(f"Role '{user_role}' is not authorized to acknowledge debit notes.")

    cur.execute("SELECT debit_note_id, debit_note_number, return_id, status FROM debit_notes WHERE debit_note_id = %s FOR UPDATE", (debit_note_id,))
    dn = cur.fetchone()
    if not dn:
        raise ValidationError(f"Debit Note #{debit_note_id} not found.")
    if dn[3] != "ISSUED":
        raise PolicyViolationError(f"Debit Note #{dn[1]} is in '{dn[3]}' status, cannot acknowledge.")

    cur.execute("""
        UPDATE debit_notes 
        SET status = 'ACKNOWLEDGED', acknowledged_by = %s, acknowledged_at = NOW() 
        WHERE debit_note_id = %s
    """, (acknowledged_by, debit_note_id))

    cur.execute("UPDATE vendor_expiry_returns SET status = 'SUPPLIER_ACKNOWLEDGED' WHERE return_id = %s", (dn[2],))

    log_audit_event(
        cur, action_type="DEBIT_NOTE_ACKNOWLEDGED", entity_type="DEBIT_NOTE", entity_id=dn[1],
        user_id=0, username=acknowledged_by, user_role=user_role, details={"debit_note_id": debit_note_id}
    )
    return {"debit_note_id": debit_note_id, "status": "ACKNOWLEDGED"}


def settle_debit_note(cur, debit_note_id: int, settled_by: str, user_role: str, credit_ref: Optional[str] = None) -> Dict[str, Any]:
    """Accounts officer or Admin marks credit received from supplier against debit note."""
    if user_role not in ("admin", "accounts"):
        raise PolicyViolationError(f"Role '{user_role}' is not authorized to settle credit notes.")

    cur.execute("SELECT debit_note_id, debit_note_number, return_id, status FROM debit_notes WHERE debit_note_id = %s FOR UPDATE", (debit_note_id,))
    dn = cur.fetchone()
    if not dn:
        raise ValidationError(f"Debit Note #{debit_note_id} not found.")
    if dn[3] not in ("ISSUED", "ACKNOWLEDGED"):
        raise PolicyViolationError(f"Debit Note #{dn[1]} is already settled or cancelled.")

    cur.execute("""
        UPDATE debit_notes 
        SET status = 'SETTLED', settled_by = %s, settled_at = NOW(), supplier_credit_ref = %s 
        WHERE debit_note_id = %s
    """, (settled_by, credit_ref, debit_note_id))

    cur.execute("UPDATE vendor_expiry_returns SET status = 'CREDIT_RECEIVED' WHERE return_id = %s", (dn[2],))

    log_audit_event(
        cur, action_type="DEBIT_NOTE_SETTLED", entity_type="DEBIT_NOTE", entity_id=dn[1],
        user_id=0, username=settled_by, user_role=user_role, details={"debit_note_id": debit_note_id, "credit_ref": credit_ref}
    )
    return {"debit_note_id": debit_note_id, "status": "SETTLED"}


# -----------------------------------------------------------------------------
# 9. POS Defense Guard (Blocks Expired / Scrap Batches at Scanning)
# -----------------------------------------------------------------------------
def validate_batch_for_pos(cur, product_id: int, batch_id: Optional[int], qty: int, location_id: int) -> Dict[str, Any]:
    """
    Validates that a batch scanned or chosen at POS is safe to sell:
    - Rejects expired batches.
    - Rejects batches in SCRAP, BLOCKED, or QUARANTINED status.
    - If batch_id is None, automatically allocates the earliest active batch (FEFO).
    """
    if batch_id:
        cur.execute("""
            SELECT b.batch_id, b.batch_number, b.expiry_date, b.status, bs.quantity_saleable
            FROM batches b
            JOIN batch_stock bs ON b.batch_id = bs.batch_id AND bs.location_id = %s
            WHERE b.batch_id = %s AND b.product_id = %s
        """, (location_id, batch_id, product_id))
        row = cur.fetchone()
        if not row:
            return {"valid": False, "reason": f"Batch #{batch_id} not available at this store location."}

        bid, b_no, exp, status, saleable = row
        exp_dt = datetime.strptime(str(exp).split("T")[0], "%Y-%m-%d").date() if isinstance(exp, str) else exp

        if status in ("SCRAP", "BLOCKED", "QUARANTINED"):
            return {
                "valid": False,
                "reason": f"POS Scan Rejected: Batch '{b_no}' is in {status} status and blocked from sale."
            }

        if exp_dt < date.today():
            return {
                "valid": False,
                "reason": f"POS Scan Rejected: Batch '{b_no}' has expired on {exp_dt}."
            }

        if saleable < qty:
            return {
                "valid": False,
                "reason": f"Insufficient batch stock for '{b_no}'. Available: {saleable}, Requested: {qty}."
            }

        return {
            "valid": True,
            "batch": {
                "batch_id": bid,
                "batch_number": b_no,
                "expiry_date": str(exp_dt),
                "saleable": saleable
            }
        }
    else:
        # Auto-pick earliest active non-expired batch (FEFO)
        try:
            allocs = allocate_fefo(cur, product_id, location_id, qty, allow_split=False)
            alloc = allocs[0]
            return {
                "valid": True,
                "batch": {
                    "batch_id": alloc["batch_id"],
                    "batch_number": alloc["batch_number"],
                    "expiry_date": alloc["expiry_date"],
                    "saleable": alloc["allocated_qty"]
                }
            }
        except InsufficientStockError as e:
            return {"valid": False, "reason": str(e)}

