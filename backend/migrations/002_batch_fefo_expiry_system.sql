-- ============================================================================
-- RetailSphere: DMart-Style Batch/Lot & FEFO Expiry Architecture Migration
-- ============================================================================

USE `sql_class`;

-- 1. Locations Table (Distribution Centers & Retail Stores)
CREATE TABLE IF NOT EXISTS `locations` (
    `location_id` INT AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(20) UNIQUE NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `type` ENUM('DC', 'STORE') NOT NULL DEFAULT 'STORE',
    `footfall_tier` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL DEFAULT 'MEDIUM',
    `address` VARCHAR(255),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Suppliers Table (Vendor Master with Negotiated Expiry Return Window)
CREATE TABLE IF NOT EXISTS `suppliers` (
    `supplier_id` INT AUTO_INCREMENT PRIMARY KEY,
    `supplier_name` VARCHAR(100) NOT NULL,
    `gstin` VARCHAR(15),
    `contact_email` VARCHAR(100),
    `phone` VARCHAR(20),
    `expiry_return_window_days` INT NOT NULL DEFAULT 30,
    `credit_period_days` INT DEFAULT 30,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Batches / Lots Master Table
CREATE TABLE IF NOT EXISTS `batches` (
    `batch_id` INT AUTO_INCREMENT PRIMARY KEY,
    `product_id` INT NOT NULL,
    `batch_number` VARCHAR(50) NOT NULL,
    `mfg_date` DATE NOT NULL,
    `expiry_date` DATE NOT NULL,
    `supplier_id` INT NULL,
    `cost_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `mrp` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `status` ENUM('ACTIVE', 'NEAR_EXPIRY', 'EXPIRED', 'BLOCKED', 'QUARANTINED', 'SCRAP') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_batch_product` FOREIGN KEY (`product_id`) REFERENCES `Products`(`product_id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_batch_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON DELETE SET NULL,
    UNIQUE KEY `uq_prod_batch` (`product_id`, `batch_number`),
    INDEX `idx_prod_expiry` (`product_id`, `expiry_date`),
    INDEX `idx_batch_expiry_status` (`expiry_date`, `status`)
) ENGINE=InnoDB;

-- 4. Location Batch Stock Ledger (Multi-Echelon Per-Location Inventory)
CREATE TABLE IF NOT EXISTS `batch_stock` (
    `stock_id` INT AUTO_INCREMENT PRIMARY KEY,
    `product_id` INT NOT NULL,
    `location_id` INT NOT NULL,
    `batch_id` INT NOT NULL,
    `quantity_saleable` INT NOT NULL DEFAULT 0,
    `quantity_reserved` INT NOT NULL DEFAULT 0,
    `quantity_scrap` INT NOT NULL DEFAULT 0,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_bs_product` FOREIGN KEY (`product_id`) REFERENCES `Products`(`product_id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_bs_location` FOREIGN KEY (`location_id`) REFERENCES `locations`(`location_id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_bs_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`batch_id`) ON DELETE RESTRICT,
    UNIQUE KEY `uq_prod_loc_batch` (`product_id`, `location_id`, `batch_id`),
    INDEX `idx_bs_fefo` (`location_id`, `product_id`, `quantity_saleable`)
) ENGINE=InnoDB;

-- 5. Goods Received Notes (DC GRN Inward)
CREATE TABLE IF NOT EXISTS `grn_receipts` (
    `grn_id` INT AUTO_INCREMENT PRIMARY KEY,
    `grn_number` VARCHAR(50) UNIQUE NOT NULL,
    `location_id` INT NOT NULL,
    `supplier_id` INT NOT NULL,
    `invoice_no` VARCHAR(50),
    `receipt_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `received_by` VARCHAR(50) NOT NULL,
    `status` ENUM('RECEIVED', 'VERIFIED', 'CANCELLED') DEFAULT 'RECEIVED',
    `remarks` TEXT,
    CONSTRAINT `fk_grn_location` FOREIGN KEY (`location_id`) REFERENCES `locations`(`location_id`),
    CONSTRAINT `fk_grn_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `grn_items` (
    `grn_item_id` INT AUTO_INCREMENT PRIMARY KEY,
    `grn_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `batch_id` INT NOT NULL,
    `batch_number` VARCHAR(50) NOT NULL,
    `mfg_date` DATE NOT NULL,
    `expiry_date` DATE NOT NULL,
    `received_qty` INT NOT NULL,
    `unit_cost` DECIMAL(10,2) NOT NULL,
    CONSTRAINT `fk_grni_grn` FOREIGN KEY (`grn_id`) REFERENCES `grn_receipts`(`grn_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_grni_product` FOREIGN KEY (`product_id`) REFERENCES `Products`(`product_id`),
    CONSTRAINT `fk_grni_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`batch_id`)
) ENGINE=InnoDB;

-- 6. Stock Movements / End-to-End Audit & Traceability Ledger
CREATE TABLE IF NOT EXISTS `stock_movements` (
    `movement_id` INT AUTO_INCREMENT PRIMARY KEY,
    `product_id` INT NOT NULL,
    `batch_id` INT NOT NULL,
    `batch_number` VARCHAR(50) NOT NULL,
    `from_location_id` INT NULL,
    `to_location_id` INT NULL,
    `movement_type` ENUM('GRN_RECEIPT', 'DC_TRANSFER_OUT', 'STORE_RECEIVE_IN', 'POS_SALE', 'VENDOR_RETURN', 'SCRAP_CONVERSION', 'AUDIT_ADJUSTMENT') NOT NULL,
    `quantity` INT NOT NULL,
    `reference_doc_type` VARCHAR(30),
    `reference_doc_id` VARCHAR(50),
    `performed_by` VARCHAR(50) NOT NULL,
    `notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_trace_batch` (`batch_id`, `created_at`),
    INDEX `idx_trace_batch_no` (`batch_number`, `created_at`),
    INDEX `idx_trace_product` (`product_id`, `created_at`)
) ENGINE=InnoDB;

-- 7. Store Replenishment Requests & Pick Lists (FEFO Allocation)
CREATE TABLE IF NOT EXISTS `store_replenishments` (
    `replenishment_id` INT AUTO_INCREMENT PRIMARY KEY,
    `request_number` VARCHAR(50) UNIQUE NOT NULL,
    `from_location_id` INT NOT NULL,
    `to_location_id` INT NOT NULL,
    `status` ENUM('REQUESTED', 'ALLOCATED', 'PICKED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED') DEFAULT 'REQUESTED',
    `requested_by` VARCHAR(50) NOT NULL,
    `allocated_by` VARCHAR(50) NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_sr_from_loc` FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`location_id`),
    CONSTRAINT `fk_sr_to_loc` FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`location_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `replenishment_items` (
    `item_id` INT AUTO_INCREMENT PRIMARY KEY,
    `replenishment_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `requested_qty` INT NOT NULL,
    `allocated_batch_id` INT NULL,
    `allocated_batch_number` VARCHAR(50) NULL,
    `expiry_date` DATE NULL,
    `allocated_qty` INT DEFAULT 0,
    `picked_qty` INT DEFAULT 0,
    `is_override` TINYINT(1) DEFAULT 0,
    `override_reason` TEXT NULL,
    `override_approved_by` VARCHAR(50) NULL,
    CONSTRAINT `fk_ri_replenish` FOREIGN KEY (`replenishment_id`) REFERENCES `store_replenishments`(`replenishment_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ri_product` FOREIGN KEY (`product_id`) REFERENCES `Products`(`product_id`),
    CONSTRAINT `fk_ri_batch` FOREIGN KEY (`allocated_batch_id`) REFERENCES `batches`(`batch_id`)
) ENGINE=InnoDB;

-- 8. Code Management Audits (Store Physical Count Verification)
CREATE TABLE IF NOT EXISTS `code_management_audits` (
    `audit_id` INT AUTO_INCREMENT PRIMARY KEY,
    `audit_number` VARCHAR(50) UNIQUE NOT NULL,
    `location_id` INT NOT NULL,
    `status` ENUM('PENDING_COUNT', 'SUBMITTED', 'APPROVED', 'REJECTED') DEFAULT 'PENDING_COUNT',
    `created_by` VARCHAR(50) NOT NULL,
    `approved_by` VARCHAR(50) NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `completed_at` DATETIME NULL,
    CONSTRAINT `fk_cma_loc` FOREIGN KEY (`location_id`) REFERENCES `locations`(`location_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `audit_items` (
    `audit_item_id` INT AUTO_INCREMENT PRIMARY KEY,
    `audit_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `batch_id` INT NOT NULL,
    `system_qty` INT NOT NULL,
    `physical_qty` INT NULL,
    `discrepancy_qty` INT NULL,
    `remarks` TEXT,
    CONSTRAINT `fk_ai_audit` FOREIGN KEY (`audit_id`) REFERENCES `code_management_audits`(`audit_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ai_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`batch_id`)
) ENGINE=InnoDB;

-- 9. Near-Expiry Markdowns & Push Sale Promotions
CREATE TABLE IF NOT EXISTS `markdown_promotions` (
    `markdown_id` INT AUTO_INCREMENT PRIMARY KEY,
    `promotion_code` VARCHAR(50) UNIQUE NOT NULL,
    `product_id` INT NOT NULL,
    `batch_id` INT NOT NULL,
    `location_id` INT NOT NULL,
    `days_to_expiry_at_creation` INT NOT NULL,
    `suggested_discount_percent` DECIMAL(5,2) NOT NULL,
    `approved_discount_percent` DECIMAL(5,2) NULL,
    `original_price` DECIMAL(10,2) NOT NULL,
    `markdown_price` DECIMAL(10,2) NOT NULL,
    `floor_price` DECIMAL(10,2) NOT NULL,
    `is_below_floor` TINYINT(1) DEFAULT 0,
    `status` ENUM('SUGGESTED', 'APPROVED', 'ACTIVE', 'EXPIRED', 'REJECTED') DEFAULT 'SUGGESTED',
    `created_by` VARCHAR(50) NOT NULL,
    `approved_by` VARCHAR(50) NULL,
    `approval_notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    CONSTRAINT `fk_mp_product` FOREIGN KEY (`product_id`) REFERENCES `Products`(`product_id`),
    CONSTRAINT `fk_mp_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`batch_id`),
    CONSTRAINT `fk_mp_location` FOREIGN KEY (`location_id`) REFERENCES `locations`(`location_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `markdown_sales_tracking` (
    `tracking_id` INT AUTO_INCREMENT PRIMARY KEY,
    `markdown_id` INT NOT NULL,
    `batch_id` INT NOT NULL,
    `units_initially_marked_down` INT NOT NULL,
    `units_sold` INT NOT NULL DEFAULT 0,
    `units_scrapped` INT NOT NULL DEFAULT 0,
    `revenue_generated` DECIMAL(12,2) DEFAULT 0.00,
    CONSTRAINT `fk_mst_markdown` FOREIGN KEY (`markdown_id`) REFERENCES `markdown_promotions`(`markdown_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 10. Vendor Expiry Returns, Scrap Ledger & Debit Notes
CREATE TABLE IF NOT EXISTS `vendor_expiry_returns` (
    `return_id` INT AUTO_INCREMENT PRIMARY KEY,
    `return_number` VARCHAR(50) UNIQUE NOT NULL,
    `location_id` INT NOT NULL,
    `supplier_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `batch_id` INT NOT NULL,
    `grn_id` INT NULL,
    `quantity` INT NOT NULL,
    `unit_cost` DECIMAL(10,2) NOT NULL,
    `total_claim_amount` DECIMAL(12,2) NOT NULL,
    `reason` VARCHAR(255) NOT NULL DEFAULT 'Hit Supplier Expiry Return Window',
    `status` ENUM('DRAFT', 'POSTED', 'SUPPLIER_ACKNOWLEDGED', 'CREDIT_RECEIVED', 'CANCELLED') DEFAULT 'DRAFT',
    `posted_at` DATETIME NULL,
    `posted_by` VARCHAR(50) NULL,
    `idempotency_key` VARCHAR(64) UNIQUE NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ver_loc` FOREIGN KEY (`location_id`) REFERENCES `locations`(`location_id`),
    CONSTRAINT `fk_ver_sup` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`),
    CONSTRAINT `fk_ver_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`batch_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `debit_notes` (
    `debit_note_id` INT AUTO_INCREMENT PRIMARY KEY,
    `debit_note_number` VARCHAR(50) UNIQUE NOT NULL,
    `return_id` INT NOT NULL,
    `supplier_id` INT NOT NULL,
    `issue_date` DATE NOT NULL,
    `taxable_amount` DECIMAL(12,2) NOT NULL,
    `gst_amount` DECIMAL(12,2) NOT NULL,
    `total_amount` DECIMAL(12,2) NOT NULL,
    `status` ENUM('ISSUED', 'ACKNOWLEDGED', 'SETTLED') DEFAULT 'ISSUED',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_dn_return` FOREIGN KEY (`return_id`) REFERENCES `vendor_expiry_returns`(`return_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_dn_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`)
) ENGINE=InnoDB;

