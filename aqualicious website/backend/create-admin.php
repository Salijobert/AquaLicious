<?php
if(PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once __DIR__.'/includes/helpers.php';
$username=$argv[1]??''; $name=$argv[2]??'Administrator';
$password=getenv('AQ_ADMIN_PASSWORD')?:'';
if(!$username || !$password) { fwrite(STDERR,"Set AQ_ADMIN_PASSWORD in the process environment, then: php create-admin.php username 'Full name'\n"); exit(1); }
sql("INSERT INTO users(name,username,password,role) VALUES (?,?,?,'Administrator')",[$name,strtolower($username),password_hash(passwordValue(['password'=>$password]),PASSWORD_BCRYPT,['cost'=>12])]);
echo "Administrator created. Clear AQ_ADMIN_PASSWORD from the environment.\n";
