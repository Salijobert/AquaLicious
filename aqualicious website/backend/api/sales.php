<?php
require_once __DIR__.'/../includes/helpers.php';
function saleView(int $id): array { $s=one('SELECT * FROM sales WHERE id=?',[$id]); if(!$s)fail('Sale not found',404); $s['items']=sql('SELECT * FROM sale_items WHERE sale_id=?',[$id])->fetchAll(); return $s; }
bootstrap(function() {
 $m=method('GET','POST','PATCH'); $u=auth(['Administrator','Staff']);
 if($m==='GET') { if(isset($_GET['id'])) return saleView(integer($_GET['id'],1)); return sql('SELECT id,order_id,total,cash_tendered,status,sold_at,void_reason FROM sales ORDER BY id DESC LIMIT 500')->fetchAll(); }
 $b=body();
 if($m==='PATCH') {
  throttle('void',10); $reason=txt($b,'reason',500);
  $admin=one("SELECT * FROM users WHERE username=? AND role='Administrator' AND active=1",[txt($b,'admin_username')]);
  if(!$admin || !password_verify((string)($b['admin_password']??''),$admin['password'])) fail('Administrator approval failed',403);
  return atomic(function()use($b,$admin,$reason) {
   $s=one('SELECT * FROM sales WHERE id=? FOR UPDATE',[integer($b['id']??0,1)]); if(!$s)fail('Sale not found',404); if($s['status']==='VOIDED')return saleView((int)$s['id']);
   foreach(sql('SELECT * FROM sale_items WHERE sale_id=? ORDER BY product_id',[$s['id']])->fetchAll() as $l) { $p=one('SELECT * FROM products WHERE id=? FOR UPDATE',[$l['product_id']]); moveStock($p,(int)$l['qty'],'VOID_RETURN',(int)$admin['id'],'Sale '.$s['id'].': '.$reason); }
   sql("UPDATE sales SET status='VOIDED',void_reason=?,voided_by=?,voided_at=NOW() WHERE id=?",[$reason,$admin['id'],$s['id']]);
   if($s['order_id']) sql("UPDATE order_payments SET status='REFUND_REQUIRED' WHERE order_id=? AND status='VERIFIED'",[$s['order_id']]);
   audit((int)$admin['id'],'VOID',(int)$s['id'],$reason); return saleView((int)$s['id']);
  });
 }
 $key=requestKey($b);
 return atomic(function()use($b,$key,$u) {
  // Serializes retries from this cashier; all product locks use ascending IDs.
  one('SELECT id FROM users WHERE id=? FOR UPDATE',[$u['id']]);
  $old=replay(one('SELECT * FROM sales WHERE created_by=? AND request_key=?',[$u['id'],$key]),$b); if($old)return saleView((int)$old['id']);
  $lines=cartLines($b); $total=totalLines($lines);
  if(isset($b['expected_total']) && money($b['expected_total'])!==$total)fail('Prices changed. Remove and re-add cart items before checkout.',409);
  $cash=money($b['cash_tendered']??''); if($cash<$total)fail('Insufficient cash tendered');
  sql('INSERT INTO sales(created_by,total,cash_tendered,request_key,request_hash) VALUES (?,?,?,?,?)',[$u['id'],decimal($total),decimal($cash),$key,requestHash($b)]); $id=(int)getDB()->lastInsertId();
  insertLines('sale_items','sale_id',$id,$lines); foreach($lines as $l)moveStock($l['product'],-$l['qty'],'SALE',(int)$u['id'],'Sale '.$id);
  return saleView($id);
 });
});
