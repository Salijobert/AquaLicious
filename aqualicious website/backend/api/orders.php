<?php
require_once __DIR__.'/../includes/helpers.php';
function orderView(int $id,array $u): array {
 $o=one('SELECT o.*,u.name customer_name,p.method,p.reference_number,p.status payment_status,p.verified_at FROM orders o JOIN users u ON u.id=o.customer_id JOIN order_payments p ON p.order_id=o.id WHERE o.id=?',[$id]);
 if(!$o || ($u['role']==='Customer' && $o['customer_id']!=$u['id']))fail('Order not found',404);
 $o['items']=sql('SELECT product_id,product_name,qty,unit_price FROM order_items WHERE order_id=?',[$id])->fetchAll(); return $o;
}
bootstrap(function() {
 $m=method('GET','POST','PATCH'); $u=auth();
 if($m==='GET') {
  if(isset($_GET['proof'])) { $id=integer($_GET['proof'],1); orderView($id,$u); if($u['role']==='Staff')fail('Administrator required',403); $p=one('SELECT proof_mime,proof_data FROM order_payments WHERE order_id=?',[$id]); return ['mime'=>$p['proof_mime'],'base64'=>base64_encode($p['proof_data']??'')]; }
  if(isset($_GET['id'])) return orderView(integer($_GET['id'],1),$u);
  $ids=sql('SELECT id FROM orders'.($u['role']==='Customer'?' WHERE customer_id=?':'').' ORDER BY id DESC LIMIT 200',$u['role']==='Customer'?[$u['id']]:[])->fetchAll(); return array_map(fn($o)=>orderView((int)$o['id'],$u),$ids);
 }
 $b=body();
 if($m==='POST') {
  if($u['role']!=='Customer')fail('Use POS for walk-in sales',403);
  $key=requestKey($b); $mode=$b['fulfillment']??''; $pay=$b['method']??'';
  if(!in_array($mode,['PICKUP','DELIVERY']) || !in_array($pay,['CASH','GCASH_QR','MAYA_QR','E_WALLET']))fail('Invalid fulfillment or payment method');
  if($mode==='PICKUP' && $pay==='CASH')fail('Pickup at Station orders require E-Wallet payment',422);
  if($pay!=='CASH' && !getenv($pay==='GCASH_QR'?'GCASH_QR_URL':'MAYA_QR_URL'))fail('Merchant QR is not configured',409);
  $address=txt($b,'address',500,$mode==='DELIVERY');
  return atomic(function()use($u,$b,$key,$mode,$pay,$address) {
   one('SELECT id FROM users WHERE id=? FOR UPDATE',[$u['id']]); $old=replay(one('SELECT * FROM orders WHERE customer_id=? AND request_key=?',[$u['id'],$key]),$b); if($old)return orderView((int)$old['id'],$u);
   $lines=cartLines($b); $total=totalLines($lines);
   if(isset($b['expected_total']) && money($b['expected_total'])!==$total)fail('Prices changed. Remove and re-add cart items before checkout.',409);
   sql('INSERT INTO orders(customer_id,fulfillment,address,total,request_key,request_hash) VALUES (?,?,?,?,?,?)',[$u['id'],$mode,$address,decimal($total),$key,requestHash($b)]); $id=(int)getDB()->lastInsertId();
   insertLines('order_items','order_id',$id,$lines); sql('INSERT INTO order_payments(order_id,method) VALUES (?,?)',[$id,$pay]);
   foreach($lines as $l)moveStock($l['product'],-$l['qty'],'ORDER_RESERVE',(int)$u['id'],'Order '.$id); return orderView($id,$u);
  });
 }
 $id=integer($b['id']??0,1); $action=$b['action']??'';
 return atomic(function()use($u,$b,$id,$action) {
  $o=one('SELECT * FROM orders WHERE id=? FOR UPDATE',[$id]); orderView($id,$u);
  $p=one('SELECT * FROM order_payments WHERE order_id=? FOR UPDATE',[$id]);
  if($action==='claim') {
   if($o['customer_id']!=$u['id'] || $o['status']!=='PENDING' || $p['method']==='CASH' || !in_array($p['status'],['UNPAID','REJECTED']))fail('Claim not allowed',409);
   $ref=txt($b,'reference_number',120); $data=base64_decode((string)($b['proof_base64']??''),true); if($data===false || strlen($data)>2000000 || strlen($data)<10)fail('Upload a PNG/JPEG receipt under 2 MB');
   $mime=(new finfo(FILEINFO_MIME_TYPE))->buffer($data); if(!in_array($mime,['image/png','image/jpeg']) || !getimagesizefromstring($data))fail('Invalid receipt image');
   sql("UPDATE order_payments SET reference_number=?,proof_mime=?,proof_data=?,status='SUBMITTED' WHERE order_id=?",[$ref,$mime,$data,$id]);
  } elseif(in_array($action,['verify','reject','refunded'])) {
   if($u['role']!=='Administrator')fail('Administrator required',403);
   if($action==='refunded') { if($p['status']!=='REFUND_REQUIRED')fail('No refund pending',409); $status='REFUNDED'; }
   else { if($o['status']==='CANCELLED' || $o['status']==='COMPLETED')fail('Order is closed',409); if($p['method']==='CASH' || $p['status']!=='SUBMITTED')fail('No QR claim awaiting review',409); $status=$action==='verify'?'VERIFIED':'REJECTED'; }
   sql('UPDATE order_payments SET status=?,verified_at=NOW(),verified_by=? WHERE order_id=?',[$status,$u['id'],$id]); audit((int)$u['id'],'PAYMENT_'.$status,$id,txt($b,'notes',500));
  } elseif($action==='status') {
   $next=$b['status']??''; $current=$o['status'];
   $allowed=['PENDING'=>['CONFIRMED','CANCELLED'],'CONFIRMED'=>['OUT_FOR_DELIVERY','COMPLETED','CANCELLED'],'OUT_FOR_DELIVERY'=>['COMPLETED','CANCELLED'],'COMPLETED'=>[],'CANCELLED'=>[]];
   if(!in_array($next,$allowed[$current]))fail('Invalid order transition',409);
   if($u['role']==='Customer' && !($current==='PENDING' && $next==='CANCELLED'))fail('Staff required',403);
   if($next==='OUT_FOR_DELIVERY' && $o['fulfillment']!=='DELIVERY')fail('Pickup order cannot be dispatched');
   if($next!=='CANCELLED' && $p['method']!=='CASH' && $p['status']!=='VERIFIED')fail('Verify QR payment first',409);
   if($next==='CANCELLED') {
    $reason=txt($b,'notes',500);
    foreach(sql('SELECT * FROM order_items WHERE order_id=? ORDER BY product_id',[$id])->fetchAll() as $l) { $product=one('SELECT * FROM products WHERE id=? FOR UPDATE',[$l['product_id']]); moveStock($product,(int)$l['qty'],'ORDER_CANCEL',(int)$u['id'],'Order '.$id.': '.$reason); }
    if(in_array($p['status'],['VERIFIED','SUBMITTED']))sql("UPDATE order_payments SET status='REFUND_REQUIRED' WHERE order_id=?",[$id]);
   }
   if($next==='COMPLETED') {
    if($p['method']==='CASH') { if(($b['cash_received']??false)!==true)fail('Confirm cash collection'); sql("UPDATE order_payments SET status='VERIFIED',verified_at=NOW(),verified_by=? WHERE order_id=?",[$u['id'],$id]); }
    sql('INSERT INTO sales(order_id,created_by,total,cash_tendered,request_key,request_hash) VALUES (?,?,?,?,?,?)',[$id,$u['id'],$o['total'],$o['total'],'order-complete-'.$id,hash('sha256','order-'.$id)]); $sid=(int)getDB()->lastInsertId();
    insertLines('sale_items','sale_id',$sid,sql('SELECT * FROM order_items WHERE order_id=?',[$id])->fetchAll());
   }
   sql('UPDATE orders SET status=? WHERE id=?',[$next,$id]); audit((int)$u['id'],'ORDER_'.$next,$id,txt($b,'notes',500,false));
  } else fail('Unknown action'); return orderView($id,$u);
 });
});
