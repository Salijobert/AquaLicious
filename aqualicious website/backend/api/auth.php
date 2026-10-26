<?php
require_once __DIR__.'/../includes/helpers.php';
bootstrap(function() {
 $m=method('GET','POST','PATCH');
 if($m==='GET') return auth();
 $b=body();
 if($m==='PATCH') { $u=auth(); sql('UPDATE users SET name=?,address=?,phone=? WHERE id=?',[txt($b,'name'),txt($b,'address',500,false),txt($b,'phone',30,false),$u['id']]); return auth(); }
 $action=$b['action']??'login'; throttle('auth');
 if($action==='register') {
  if(isset($b['role']) && $b['role']!=='Customer') fail('Public registration is for customers only',403);
  $name=txt($b,'name'); $username=strtolower(txt($b,'username')); $hash=password_hash(passwordValue($b),PASSWORD_BCRYPT,['cost'=>12]);
  sql("INSERT INTO users(name,username,password,role) VALUES (?,?,?,'Customer')",[$name,$username,$hash]);
  $u=one('SELECT id,name,username,role,address,phone FROM users WHERE id=?',[getDB()->lastInsertId()]);
 } elseif($action==='login') {
  $u=one('SELECT * FROM users WHERE username=? AND active=1',[strtolower(txt($b,'username'))]);
  if(!$u || !password_verify((string)($b['password']??''),$u['password'])) fail('Invalid username or password',401); unset($u['password']);
 } else fail('Unknown authentication action');
 return ['token'=>token($u),'user'=>$u,'expires_in'=>1800];
});
