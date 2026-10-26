<?php
function trend(array $values): array {
 $n=count($values); if($n<2)throw new InvalidArgumentException('At least two daily values required');
 $mean=array_sum($values)/$n; $xm=($n-1)/2; $num=0; $den=0;
 foreach($values as $x=>$y) { $num+=($x-$xm)*($y-$mean); $den+=($x-$xm)**2; }
 $slope=$num/$den; $percent=$mean>0?$slope/$mean*100:0;
 return ['sma'=>$mean,'slope'=>$slope,'slope_percent'=>$percent,'label'=>$percent>=5?'Growing':($percent<=-5?'Declining':'Stable')];
}
