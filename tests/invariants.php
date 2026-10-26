<?php
require __DIR__.'/../aqualicious website/backend/includes/helpers.php';
foreach(['UPDATE stock_movements SET notes=notes WHERE id=1','DELETE FROM stock_movements WHERE id=1','UPDATE audit_events SET details=details WHERE id=1','DELETE FROM audit_events WHERE id=1'] as $q) {
 try { sql($q); throw new RuntimeException('Immutable ledger accepted mutation'); } catch(PDOException $e) { if(!str_contains($e->getMessage(),'immutable'))throw $e; echo "PASS database blocks ledger mutation\n"; }
}
$rows=sql('SELECT p.id,p.stock,COALESCE(SUM(m.change_qty),0) ledger_stock FROM products p LEFT JOIN stock_movements m ON m.product_id=p.id GROUP BY p.id,p.stock')->fetchAll();
foreach($rows as $r)if((int)$r['stock']!==(int)$r['ledger_stock'])throw new RuntimeException('Stock ledger drift');
echo "PASS all product balances equal ledger totals\n";
$u=one("SELECT password FROM users WHERE username='test-owner'");
if(password_get_info($u['password'])['options']['cost']!==12)throw new RuntimeException('Wrong bcrypt cost');
echo "PASS bcrypt cost 12\n";
