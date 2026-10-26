<?php
require __DIR__.'/../aqualicious website/backend/includes/analytics.php';
function check(bool $ok,string $label): void { if(!$ok)throw new RuntimeException($label); echo "PASS $label\n"; }
check(trend([0,0,0,0,0,0,0])['label']==='Stable','zero series');
check(trend([10,20,30,40,50,60,70])['label']==='Growing','positive trend');
check(trend([70,60,50,40,30,20,10])['label']==='Declining','negative trend');
check(trend([85,90,95,100,105,110,115])['label']==='Growing','inclusive +5% boundary');
check(trend([115,110,105,100,95,90,85])['label']==='Declining','inclusive -5% boundary');
check(trend([0,0,0,0,0,0,70])['sma']===10,'zero days in SMA');
