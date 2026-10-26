-- Used only by Docker's initial database bootstrap. No secrets in this file.
REVOKE ALL PRIVILEGES ON aqualicious_db.* FROM 'aqualicious'@'%';
GRANT SELECT,INSERT,UPDATE ON aqualicious_db.users TO 'aqualicious'@'%';
GRANT SELECT,INSERT,UPDATE ON aqualicious_db.products TO 'aqualicious'@'%';
GRANT SELECT,INSERT,UPDATE ON aqualicious_db.sales TO 'aqualicious'@'%';
GRANT SELECT,INSERT,UPDATE ON aqualicious_db.orders TO 'aqualicious'@'%';
GRANT SELECT,INSERT,UPDATE ON aqualicious_db.order_payments TO 'aqualicious'@'%';
GRANT SELECT,INSERT,UPDATE ON aqualicious_db.auth_attempts TO 'aqualicious'@'%';
GRANT SELECT,INSERT ON aqualicious_db.sale_items TO 'aqualicious'@'%';
GRANT SELECT,INSERT ON aqualicious_db.order_items TO 'aqualicious'@'%';
GRANT SELECT,INSERT ON aqualicious_db.stock_movements TO 'aqualicious'@'%';
GRANT SELECT,INSERT ON aqualicious_db.audit_events TO 'aqualicious'@'%';
