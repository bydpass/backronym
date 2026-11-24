/* 仅本地测试：手动时钟。隐藏的窗格里定时器不走，用 __tick(ms) 推进 */
(function(){var now=0,q=[],id=0,dead={};
window.setTimeout=function(f,d){q.push({id:++id,t:now+(d||0),f:f});return id};
window.clearTimeout=function(i){q=q.filter(function(x){return x.id!==i})};
window.setInterval=function(f,d){var my=++id;(function again(){q.push({id:my,t:now+d,f:function(){f();if(!dead[my])again()}})})();return my};
window.clearInterval=function(i){dead[i]=1;q=q.filter(function(x){return x.id!==i})};
window.requestAnimationFrame=function(f){return window.setTimeout(f,16)};
window.__now=function(){return now};var base=Date.now();performance.now=function(){return now};Date.now=function(){return base+now};
window.__tick=function(ms){var end=now+ms;for(;;){q.sort(function(a,b){return a.t-b.t});if(!q.length||q[0].t>end)break;var x=q.shift();now=x.t;try{x.f()}catch(e){(window.__err=window.__err||[]).push(String(e))}}now=end};
})();
