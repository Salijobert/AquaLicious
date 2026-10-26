<?php
require_once __DIR__.'/../includes/helpers.php';
bootstrap(function() { method('GET'); return ['gcash_qr_url'=>getenv('GCASH_QR_URL')?:null,'maya_qr_url'=>getenv('MAYA_QR_URL')?:null,'timezone'=>'Asia/Manila','sync_interval_ms'=>5000]; });
