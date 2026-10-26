<?php
require_once __DIR__.'/../includes/helpers.php';
bootstrap(function() {
 $m=method('GET','POST','PATCH');
 if($m==='GET') {
  $admin=false; if(!empty($_SERVER['HTTP_AUTHORIZATION'])) $admin=auth()['role']==='Administrator';
  $fields=$admin?'*':'id,sku,name,product_type,volume_label,image_url,selling_price,stock,reorder_pt,lead_time_days,safety_stock,active';
  return sql("SELECT $fields FROM products".($admin?'':' WHERE active=1').' ORDER BY id')->fetchAll();
 }
 $u=auth(['Administrator']); $b=body();
 return atomic(function()use($u,$b,$m) {
  if($m==='PATCH') { $id=integer($b['id']??0,1); if(!one('SELECT id FROM products WHERE id=? FOR UPDATE',[$id])) fail('Product not found',404); }
  $type=txt($b,'product_type'); if(!in_array($type,['REFILL','CONTAINER_WITH_WATER','EMPTY_CONTAINER','ACCESSORY'])) fail('Invalid product type');
  $img=txt($b,'image_url',500,false); if($img!=='' && !preg_match('#^https://#',$img)) fail('Image URL must use HTTPS');
  $args=[txt($b,'sku',60),txt($b,'name',160),$type,txt($b,'volume_label',80),$img,decimal(money($b['production_cost']??'')),decimal(money($b['selling_price']??'')),integer($b['reorder_pt']??0),integer($b['lead_time_days']??2,0,365),integer($b['safety_stock']??0),integer($b['active']??1,0,1)];
  if($m==='POST') { sql('INSERT INTO products(sku,name,product_type,volume_label,image_url,production_cost,selling_price,reorder_pt,lead_time_days,safety_stock,active) VALUES (?,?,?,?,?,?,?,?,?,?,?)',$args); $id=(int)getDB()->lastInsertId(); }
  else { $args[]=$id; sql('UPDATE products SET sku=?,name=?,product_type=?,volume_label=?,image_url=?,production_cost=?,selling_price=?,reorder_pt=?,lead_time_days=?,safety_stock=?,active=? WHERE id=?',$args); }
  audit((int)$u['id'],'PRODUCT_SAVE',$id); return one('SELECT * FROM products WHERE id=?',[$id]);
 });
});
