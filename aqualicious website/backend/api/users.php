<?php
require_once __DIR__.'/../includes/helpers.php';
bootstrap(function() {
 $m=method('GET','POST','PATCH'); $u=auth(['Administrator']);
 if($m==='GET')return sql('SELECT id,name,username,role,active FROM users ORDER BY id')->fetchAll(); $b=body();
 return atomic(function()use($m,$u,$b) {
  // Serialize role changes so the last active Administrator cannot be removed.
  $admins=sql("SELECT id FROM users WHERE role='Administrator' AND active=1 ORDER BY id FOR UPDATE")->fetchAll();
  $role=txt($b,'role'); if(!in_array($role,['Administrator','Staff','Customer']))fail('Invalid role'); $active=integer($b['active']??1,0,1);
  if($m==='POST') { sql('INSERT INTO users(name,username,password,role,active) VALUES (?,?,?,?,?)',[txt($b,'name'),strtolower(txt($b,'username')),password_hash(passwordValue($b),PASSWORD_BCRYPT,['cost'=>12]),$role,$active]); $id=(int)getDB()->lastInsertId(); }
  else { $id=integer($b['id']??0,1); $old=one('SELECT * FROM users WHERE id=? FOR UPDATE',[$id]); if(!$old)fail('User not found',404); if($old['role']==='Administrator' && $old['active'] && count($admins)===1 && (!$active || $role!=='Administrator'))fail('Keep at least one active Administrator'); sql('UPDATE users SET name=?,role=?,active=? WHERE id=?',[txt($b,'name'),$role,$active,$id]); if(!empty($b['password']))sql('UPDATE users SET password=? WHERE id=?',[password_hash(passwordValue($b),PASSWORD_BCRYPT,['cost'=>12]),$id]); }
  audit((int)$u['id'],'USER_SAVE',$id,$role); return ['id'=>$id];
 });
});
