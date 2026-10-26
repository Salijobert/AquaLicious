<?php
declare(strict_types=1);
require_once __DIR__.'/../config/db.php';
require_once __DIR__.'/../vendor/autoload.php';
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
date_default_timezone_set('Asia/Manila');
function fail(string $message,int $status=422): never { throw new DomainException($message,$status); }
function out(mixed $data,int $code=200): never { http_response_code($code); header('Content-Type: application/json'); echo json_encode($data,JSON_THROW_ON_ERROR); exit; }
function sql(string $query,array $args=[]): PDOStatement { $s=getDB()->prepare($query); $s->execute($args); return $s; }
function one(string $q,array $a=[]): ?array { return sql($q,$a)->fetch()?:null; }
function body(): array { $raw=file_get_contents('php://input'); if(strlen($raw)>4200000) fail('Request too large',413); $b=json_decode($raw?:'{}',true,64,JSON_THROW_ON_ERROR); if(!is_array($b)) fail('JSON object required'); return $b; }
function txt(array $b,string $key,int $max=120,bool $required=true): string { $s=trim((string)($b[$key]??'')); if(($required && $s==='') || strlen($s)>$max) fail("Invalid $key"); return $s; }
function integer(mixed $v,int $min=0,int $max=1000000): int { if(filter_var($v,FILTER_VALIDATE_INT)===false || $v<$min || $v>$max) fail('Invalid integer quantity'); return (int)$v; }
function money(mixed $v): int { if(!is_scalar($v) || !preg_match('/^\d{1,8}(\.\d{1,2})?$/',(string)$v)) fail('Invalid monetary amount'); return (int)round((float)$v*100); }
function decimal(int $v): string { return number_format($v/100,2,'.',''); }
function secret(): string { $s=getenv('JWT_SECRET')?:''; if(strlen($s)<32) throw new RuntimeException('JWT_SECRET requires 32 bytes'); return $s; }
function token(array $u): string { return JWT::encode(['iss'=>'aqualicious','aud'=>'aqualicious-clients','sub'=>(string)$u['id'],'iat'=>time(),'exp'=>time()+1800],secret(),'HS256'); }
function auth(array $roles=[]): array {
 if(!preg_match('/^Bearer (\S+)$/',$_SERVER['HTTP_AUTHORIZATION']??'',$m)) fail('Sign in required',401);
 try { $c=JWT::decode($m[1],new Key(secret(),'HS256')); } catch(Throwable $e) { fail('Session expired or invalid',401); }
 if(($c->iss??'')!=='aqualicious' || ($c->aud??'')!=='aqualicious-clients') fail('Invalid token',401);
 $u=one('SELECT id,name,username,role,address,phone FROM users WHERE id=? AND active=1',[$c->sub??0]);
 if(!$u) fail('Account unavailable',401); if($roles && !in_array($u['role'],$roles,true)) fail('Permission denied',403); return $u;
}
function passwordValue(array $b): string { $p=(string)($b['password']??''); if(strlen($p)<12 || strlen($p)>72 || str_contains($p,"\0")) fail('Password must contain 12–72 bytes'); return $p; }
function throttle(string $scope,int $limit=15): void {
 $bucket=hash('sha256',$scope.'|'.($_SERVER['REMOTE_ADDR']??'cli'));
 sql('INSERT INTO auth_attempts(bucket,attempts,window_start) VALUES (?,1,NOW()) ON DUPLICATE KEY UPDATE attempts=IF(window_start < NOW()-INTERVAL 15 MINUTE,1,attempts+1),window_start=IF(window_start < NOW()-INTERVAL 15 MINUTE,NOW(),window_start)',[$bucket]);
 if((int)one('SELECT attempts FROM auth_attempts WHERE bucket=?',[$bucket])['attempts']>$limit) fail('Too many attempts; retry in 15 minutes',429);
}
function atomic(callable $fn): mixed { $db=getDB(); $db->beginTransaction(); try { $r=$fn(); $db->commit(); return $r; } catch(Throwable $e) { if($db->inTransaction())$db->rollBack(); throw $e; } }
function audit(int $uid,string $action,int $id,string $details=''): void { sql('INSERT INTO audit_events(user_id,action,entity_id,details) VALUES (?,?,?,?)',[$uid,$action,$id,$details]); }
function moveStock(array $p,int $delta,string $type,int $uid,string $notes): void {
 $before=(int)$p['stock']; if($before+$delta<0) fail('Insufficient stock for '.$p['name'],409);
 sql('UPDATE products SET stock=? WHERE id=?',[$before+$delta,$p['id']]);
 sql('INSERT INTO stock_movements(product_id,change_qty,previous_balance,new_balance,movement_type,user_id,notes) VALUES (?,?,?,?,?,?,?)',[$p['id'],$delta,$before,$before+$delta,$type,$uid,$notes]);
}
function cartLines(array $b): array {
 $items=$b['items']??[]; if(!is_array($items) || !$items || count($items)>100) fail('Cart needs 1–100 items'); $map=[];
 foreach($items as $i) { $id=integer($i['product_id']??0,1); $map[$id]=($map[$id]??0)+integer($i['qty']??0,1,10000); }
 ksort($map); $lines=[];
 foreach($map as $id=>$qty) { $p=one('SELECT * FROM products WHERE id=? FOR UPDATE',[$id]); if(!$p || !$p['active']) fail('Product unavailable',409); if($qty>$p['stock']) fail('Insufficient stock for '.$p['name'],409); $lines[]=['product_id'=>$id,'product_name'=>$p['name'],'qty'=>$qty,'unit_price'=>$p['selling_price'],'unit_cost_snapshot'=>$p['production_cost'],'product'=>$p]; } return $lines;
}
function totalLines(array $ls): int { return array_sum(array_map(fn($l)=>money($l['unit_price'])*(int)$l['qty'],$ls)); }
function insertLines(string $table,string $fk,int $id,array $ls): void { foreach($ls as $l) sql("INSERT INTO $table($fk,product_id,product_name,qty,unit_price,unit_cost_snapshot) VALUES (?,?,?,?,?,?)",[$id,$l['product_id'],$l['product_name'],$l['qty'],$l['unit_price'],$l['unit_cost_snapshot']]); }
function requestKey(array $b): string { $s=txt($b,'request_key',80); if(!preg_match('/^[a-zA-Z0-9_-]{16,80}$/',$s)) fail('Invalid request key'); return $s; }
function requestHash(array $b): string { return hash('sha256',json_encode($b,JSON_THROW_ON_ERROR)); }
function replay(?array $r,array $b): ?array { if($r && !hash_equals($r['request_hash'],requestHash($b))) fail('Request key already used with different data',409); return $r; }
function bootstrap(callable $fn): never {
 header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff'); $origin=$_SERVER['HTTP_ORIGIN']??'';
 if($origin) { $allowed=array_filter(array_map('trim',explode(',',getenv('CORS_ORIGINS')?:''))); $same=(!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off'?'https':'http').'://'.($_SERVER['HTTP_HOST']??''); if($origin!==$same && !in_array($origin,$allowed,true)) out(['error'=>'Origin not permitted'],403); header('Access-Control-Allow-Origin: '.$origin); header('Vary: Origin'); header('Access-Control-Allow-Headers: Authorization, Content-Type'); header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS'); }
 if($_SERVER['REQUEST_METHOD']==='OPTIONS') out(null,204);
 try { out($fn()); } catch(DomainException $e) { out(['error'=>$e->getMessage()],$e->getCode()?:422); } catch(JsonException $e) { out(['error'=>'Invalid JSON'],400); } catch(PDOException $e) { error_log((string)$e); out(['error'=>$e->getCode()==='23000'?'Duplicate or conflicting record':'Database operation failed'],$e->getCode()==='23000'?409:500); } catch(Throwable $e) { error_log((string)$e); out(['error'=>'Server configuration or operation failed'],500); }
}
function method(string ...$allowed): string { $m=$_SERVER['REQUEST_METHOD']; if(!in_array($m,$allowed,true)) fail('Method not allowed',405); return $m; }
