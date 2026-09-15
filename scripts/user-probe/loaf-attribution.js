/* 長幀歸因 —— 貼進 DevTools Console,然後在表格列上連續掃滑鼠 20 秒(2026-09-15,對應 M32 錨例 (h))。
   回答的不是「多慢」,是「慢的那些幀裡在跑誰的 script」:用 Long Animation Frames API 的 scripts[].sourceURL /
   invoker 把長幀歸到來源檔。不是我們建置裡的 sourceURL(例如安全產品注入的 thin-client)→ 不是我們的問題,不要消融程式碼。
   出處:governance/memory/reference_perf_validation_same_host.md。跨網域比較無效,main 與分支必同網域。 */
(()=>{
var DUR=20000;
var box=document.createElement('div');box.style.cssText='position:fixed;right:10px;bottom:10px;z-index:2147483647;background:#000;color:#fff;font:12px/1.5 ui-monospace,Menlo,monospace;padding:10px 12px;border-radius:8px;white-space:pre;pointer-events:none;max-width:720px';document.body.appendChild(box);
var L=0,R=0,hist={},n=0,t0=performance.now(),heap0=0,loafs=[],lts=0,ltMs=0;
var mem=function(){try{return performance.memory.usedJSHeapSize/1048576}catch(e){return 0}};heap0=mem();
addEventListener('pointermove',function(){L=performance.now()},{capture:true,passive:true});
(function f(t){if(R&&t-L<100){var d=t-R;var k=Math.round(d/16.7)*17;hist[k]=(hist[k]||0)+1;n++}R=t;if(performance.now()-t0<DUR+500)requestAnimationFrame(f)})(performance.now());
try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){loafs.push(e)})}).observe({type:'long-animation-frame',buffered:false})}catch(e){}
try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){lts++;ltMs+=e.duration})}).observe({type:'longtask',buffered:false})}catch(e){}
function report(final){
  var keys=Object.keys(hist).map(Number).sort(function(a,b){return a-b});
  var h=keys.map(function(k){return k+'ms×'+hist[k]}).join('  ');
  var out='幀距分佈('+n+'幀): '+h+'\n長幀(≥50ms) '+loafs.length+' 個  長任務 '+lts+' 個 共 '+Math.round(ltMs)+'ms  heap +'+(mem()-heap0).toFixed(1)+'MB';
  if(final){
    var tot=0,script=0,render=0,forced=0,blk=0,src={};
    loafs.forEach(function(e){tot+=e.duration;blk+=e.blockingDuration||0;var rs=e.renderStart||0,st=e.startTime,end=st+e.duration;if(rs)render+=end-rs;
      (e.scripts||[]).forEach(function(s){script+=s.duration;forced+=s.forcedStyleAndLayoutDuration||0;var key=(s.invoker||s.sourceFunctionName||'?')+' @'+String(s.sourceURL||'').split('/').pop().slice(0,28);src[key]=src[key]||{d:0,f:0,c:0};src[key].d+=s.duration;src[key].f+=s.forcedStyleAndLayoutDuration||0;src[key].c++})});
    var top=Object.keys(src).map(function(k){return [k,src[k]]}).sort(function(a,b){return b[1].d-a[1].d}).slice(0,6).map(function(x){return '  '+Math.round(x[1].d)+'ms(強制版面 '+Math.round(x[1].f)+'ms,'+x[1].c+'次) '+x[0]}).join('\n');
    out+='\n長幀合計 '+Math.round(tot)+'ms:script '+Math.round(script)+'ms / 樣式+版面+繪製(renderStart之後) '+Math.round(render)+'ms / 強制版面 '+Math.round(forced)+'ms / blocking '+Math.round(blk)+'ms\n長幀裡的 script 來源(前 6):\n'+(top||'  (無)')+'\n完成 — 整塊回傳';
  }
  box.textContent=out;
}
var iv=setInterval(function(){if(performance.now()-t0>=DUR){clearInterval(iv);report(true);return}report(false)},500);
box.textContent='在表格列上連續掃滑鼠 20 秒…';
})()
