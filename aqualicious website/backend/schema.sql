-- Fresh database only. MySQL 8+ / MariaDB 10.4+. No default credentials.
CREATE DATABASE IF NOT EXISTS aqualicious_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aqualicious_db;
CREATE TABLE users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, username VARCHAR(120) NOT NULL UNIQUE,
 password VARCHAR(255) NOT NULL, role ENUM('Administrator','Staff','Customer') NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 address VARCHAR(500) NOT NULL DEFAULT '', phone VARCHAR(30) NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE products (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, sku VARCHAR(60) NOT NULL UNIQUE, name VARCHAR(160) NOT NULL,
 product_type ENUM('REFILL','CONTAINER_WITH_WATER','EMPTY_CONTAINER','ACCESSORY') NOT NULL, volume_label VARCHAR(80) NOT NULL,
 image_url VARCHAR(500) NOT NULL DEFAULT '', production_cost DECIMAL(12,2) NOT NULL, selling_price DECIMAL(12,2) NOT NULL,
 stock INT NOT NULL DEFAULT 0, reorder_pt INT NOT NULL DEFAULT 0, lead_time_days INT NOT NULL DEFAULT 2,
 safety_stock INT NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE,
 CHECK(stock>=0), CHECK(production_cost>=0), CHECK(selling_price>=0), CHECK(reorder_pt>=0), CHECK(lead_time_days>=0), CHECK(safety_stock>=0)
) ENGINE=InnoDB;
CREATE TABLE orders (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, customer_id BIGINT UNSIGNED NOT NULL,
 status ENUM('PENDING','CONFIRMED','OUT_FOR_DELIVERY','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
 fulfillment ENUM('PICKUP','DELIVERY') NOT NULL, address VARCHAR(500) NOT NULL DEFAULT '', total DECIMAL(12,2) NOT NULL,
 request_key VARCHAR(80) NOT NULL, request_hash CHAR(64) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(customer_id,request_key), FOREIGN KEY(customer_id) REFERENCES users(id), INDEX(created_at)
) ENGINE=InnoDB;
CREATE TABLE order_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL,
 product_name VARCHAR(160) NOT NULL, qty INT NOT NULL, unit_price DECIMAL(12,2) NOT NULL, unit_cost_snapshot DECIMAL(12,2) NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(product_id) REFERENCES products(id), CHECK(qty>0)
) ENGINE=InnoDB;
CREATE TABLE order_payments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL UNIQUE,
 method ENUM('CASH','GCASH_QR','MAYA_QR') NOT NULL, reference_number VARCHAR(120) NULL,
 status ENUM('UNPAID','SUBMITTED','VERIFIED','REJECTED','REFUND_REQUIRED','REFUNDED') NOT NULL DEFAULT 'UNPAID',
 proof_mime VARCHAR(30) NULL, proof_data MEDIUMBLOB NULL, verified_at DATETIME NULL, verified_by BIGINT UNSIGNED NULL,
 UNIQUE(method,reference_number), FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(verified_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE sales (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NULL UNIQUE, created_by BIGINT UNSIGNED NOT NULL,
 total DECIMAL(12,2) NOT NULL, cash_tendered DECIMAL(12,2) NOT NULL, status ENUM('COMPLETED','VOIDED') NOT NULL DEFAULT 'COMPLETED',
 request_key VARCHAR(80) NOT NULL, request_hash CHAR(64) NOT NULL, sold_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 void_reason VARCHAR(500) NULL, voided_by BIGINT UNSIGNED NULL, voided_at DATETIME NULL,
 UNIQUE(created_by,request_key), FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(created_by) REFERENCES users(id),
 FOREIGN KEY(voided_by) REFERENCES users(id), INDEX(sold_at)
) ENGINE=InnoDB;
CREATE TABLE sale_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, sale_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL,
 product_name VARCHAR(160) NOT NULL, qty INT NOT NULL, unit_price DECIMAL(12,2) NOT NULL, unit_cost_snapshot DECIMAL(12,2) NOT NULL,
 FOREIGN KEY(sale_id) REFERENCES sales(id), FOREIGN KEY(product_id) REFERENCES products(id), CHECK(qty>0)
) ENGINE=InnoDB;
CREATE TABLE stock_movements (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, product_id BIGINT UNSIGNED NOT NULL, change_qty INT NOT NULL,
 previous_balance INT NOT NULL, new_balance INT NOT NULL,
 movement_type ENUM('SALE','RESTOCK','ADJUSTMENT','VOID_RETURN','ORDER_RESERVE','ORDER_CANCEL') NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL, notes VARCHAR(500) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(user_id) REFERENCES users(id),
 CHECK(new_balance=previous_balance+change_qty), CHECK(new_balance>=0), INDEX(product_id,created_at)
) ENGINE=InnoDB;
CREATE TABLE auth_attempts (bucket CHAR(64) PRIMARY KEY, attempts INT NOT NULL DEFAULT 1, window_start DATETIME NOT NULL) ENGINE=InnoDB;
CREATE TABLE audit_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, action VARCHAR(60) NOT NULL,
 entity_id BIGINT UNSIGNED NOT NULL, details VARCHAR(1000) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
DELIMITER //
CREATE TRIGGER stock_immutable_update BEFORE UPDATE ON stock_movements FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory ledger is immutable'; END//
CREATE TRIGGER stock_immutable_delete BEFORE DELETE ON stock_movements FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory ledger is immutable'; END//
CREATE TRIGGER audit_immutable_update BEFORE UPDATE ON audit_events FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit ledger is immutable'; END//
CREATE TRIGGER audit_immutable_delete BEFORE DELETE ON audit_events FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit ledger is immutable'; END//
DELIMITER ;
-- Record opening stock through the inventory API, after provisioning an Administrator.
INSERT INTO products(sku,name,product_type,volume_label,production_cost,selling_price,reorder_pt,safety_stock) VALUES
('REF-SLIM-5GAL','Mineral Refill','REFILL','5-Gallon Slim',10,30,10,5),
('NEW-SLIM-5GAL','New Slim Bottle + Water','CONTAINER_WITH_WATER','5-Gallon Slim',180,250,5,2),
('NEW-ROUND-5GAL','New Round Bottle + Water','CONTAINER_WITH_WATER','5-Gallon Round',160,220,5,2),
('EMPTY-5GAL','Empty Container','EMPTY_CONTAINER','5-Gallon Round',120,180,5,2),
('WATER-500ML','Purified Water','CONTAINER_WITH_WATER','500ml',3,8,30,10),
('WATER-1L','Purified Water','CONTAINER_WITH_WATER','1L',4,12,30,10),
('WATER-1.5L','Mineral Water','CONTAINER_WITH_WATER','1.5L',7,18,20,10),
('CAP-5GAL','Container Cap','ACCESSORY','5-Gallon',1,5,20,10);
