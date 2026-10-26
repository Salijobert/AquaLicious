<?php
// Development only: php -S 0.0.0.0:8080 backend/router.php from web root.
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH));
if(str_contains($path,'..') || preg_match('#/backend/(?!api/[a-z]+\.php$)#',$path)) { http_response_code(404); exit; }
return false;
