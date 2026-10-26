<?php
require_once __DIR__.'/../includes/helpers.php';
bootstrap(function() {
 $m=method('GET','POST'); $u=auth(['Administrator','Staff']);
 if($m==='GET') {
  if(isset($_GET['ledger'])) return sql('SELECT m.*,p.name,u.name actor FROM stock_movements m JOIN products p ON p.id=m.product_id JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 500')->fetchAll();
  return sql("SELECT p.id,p.name,p.sku,p.stock,p.reorder_pt,p.lead_time_days,p.safety_stock,p.active,COALESCE(d.units,0)/7 average_daily_usage,GREATEST(p.reorder_pt,CEIL(COALESCE(d.units,0)/7*p.lead_time_days+p.safety_stock)) effective_rop FROM products p LEFT JOIN (SELECT i.product_id,SUM(i.qty) units FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.status='COMPLETED' AND s.sold_at>=CURDATE()-INTERVAL 7 DAY AND s.sold_at<CURDATE() GROUP BY i.product_id) d ON d.product_id=p.id ORDER BY p.id")->fetchAll();
 }
 if($u['role']!=='Administrator') fail('Administrator required',403); $b=body();
 return atomic(function()use($b,$u) {
  $p=one('SELECT * FROM products WHERE id=? FOR UPDATE',[integer($b['product_id']??0,1)]); if(!$p) fail('Product not found',404);
  $type=$b['type']??''; if(!in_array($type,['RESTOCK','ADJUSTMENT'])) fail('Invalid movement type');
  $qty=integer($b['quantity']??null,$type==='RESTOCK'?1:0); $delta=$type==='RESTOCK'?$qty:$qty-(int)$p['stock'];
  moveStock($p,$delta,$type,(int)$u['id'],txt($b,'notes',500)); return ['stock'=>(int)$p['stock']+$delta];
 });
});
