<?php
require_once __DIR__.'/../includes/helpers.php';
require_once __DIR__.'/../includes/analytics.php';
bootstrap(function() {
 method('GET'); $u=auth(['Administrator','Staff']);
 $today=one("SELECT COUNT(*) transactions,COALESCE(SUM(total),0) revenue FROM sales WHERE status='COMPLETED' AND sold_at>=CURDATE()");
 $products=one('SELECT COUNT(*) active_products,COALESCE(SUM(stock<=reorder_pt),0) low_stock FROM products WHERE active=1');
 $pending=one("SELECT COUNT(*) pending_orders FROM orders WHERE status='PENDING'");
 $result=['today'=>$today]+$products+$pending;
 if($u['role']!=='Administrator')return $result;
 $days=integer($_GET['days']??30,7,365); $start=date('Y-m-d',strtotime('-'.($days-1).' days'));
 $rows=sql("SELECT DATE(sold_at) day,SUM(total) revenue,COUNT(*) transactions FROM sales WHERE status='COMPLETED' AND sold_at>=? GROUP BY DATE(sold_at)",[$start])->fetchAll(); $map=array_column($rows,null,'day'); $series=[];
 for($i=$days-1;$i>=0;$i--) { $d=date('Y-m-d',strtotime("-$i days")); $series[]=['day'=>$d,'revenue'=>(float)($map[$d]['revenue']??0),'transactions'=>(int)($map[$d]['transactions']??0)]; }
 $seven=sql("SELECT DATE(sold_at) day,SUM(total) revenue FROM sales WHERE status='COMPLETED' AND sold_at>=CURDATE()-INTERVAL 7 DAY AND sold_at<CURDATE() GROUP BY DATE(sold_at)")->fetchAll(); $sm=array_column($seven,'revenue','day'); $values=[];
 for($i=7;$i>=1;$i--)$values[]=(float)($sm[date('Y-m-d',strtotime("-$i days"))]??0);
 $profit=one("SELECT COALESCE(SUM((i.unit_price-i.unit_cost_snapshot)*i.qty),0) gross_profit,COALESCE(SUM(i.qty),0) units FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.status='COMPLETED' AND s.sold_at>=?",[$start]);
 $top=sql("SELECT i.product_id,i.product_name,SUM(i.qty) units,SUM(i.qty*i.unit_price) revenue FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.status='COMPLETED' AND s.sold_at>=? GROUP BY i.product_id,i.product_name ORDER BY revenue DESC LIMIT 10",[$start])->fetchAll();
 return $result+['series'=>$series,'trend'=>trend($values),'gross_profit'=>$profit['gross_profit'],'units'=>$profit['units'],'top_products'=>$top];
});
