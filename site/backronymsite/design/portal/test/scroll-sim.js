/* 仅本地测试：模拟各种下滑节奏，记录每个部分 / 子页面停了多久、内容有没有显示完 */
window.__S=(function(){
  var W=window,D=document;
  function st(){
    var stage=D.querySelector(".stage"),L=D.getElementById("word").children,a=-1,k,o;
    for(k=0;k<L.length;k++)if(L[k].classList.contains("on"))a=k;
    if(stage.classList.contains("fin"))a=7;
    o={p:a,sub:-1,txt:1};
    var rg=a===3?D.getElementById("rg"):a===4?D.getElementById("gc"):null;
    if(rg){var s=rg.querySelector(".rg-strip").children;for(k=0;k<s.length;k++)if(s[k].classList.contains("on"))o.sub=k;
      var cs=rg.querySelectorAll(".rg-cap i:not(.k)"),v=rg.querySelectorAll(".rg-cap i.v:not(.k)");o.txt=cs.length?v.length/cs.length:0}
    else if(a>=0&&a<7){var segs=D.getElementById("parts").children[a].querySelectorAll(".seg"),n=0,m=0;
      for(k=0;k<segs.length;k++){if(segs[k].offsetParent===null)continue;n++;if(segs[k].classList.contains("v"))m++}o.txt=n?m/n:0}
    return o;
  }
  function wheel(dy){W.scrollTo(0,W.scrollY+dy);W.dispatchEvent(new Event("scroll"))}
  var PAT={
    A:{n:"连续滚（每 80 毫秒一格）",s:[[80,100]]},
    B:{n:"一拨一拨（三格一拨，隔 0.42 秒）",s:[[420,100],[35,100],[35,100]]},
    C:{n:"一格一格慢滚（隔 0.6 秒）",s:[[600,100]]},
    D:{n:"中速一格一格（隔 0.25 秒）",s:[[250,100]]},
    E:{n:"平滑滚轮（不停，约每秒 830 像素）",s:[[12,10]]},
    F:{n:"快拨（五格一拨，隔 0.23 秒）",s:[[230,100],[25,100],[25,100],[25,100],[25,100]]},
    K:{n:"按住方向键",s:[[33,40]],key:1},
    T:{n:"触控板大滑（一下约 1000 像素，隔 0.7 秒）",s:(function(){var a=[],d=60,first=1;while(d>=1){a.push([first?700:16,Math.round(d)]);first=0;d*=0.94}return a})()}
  };
  function start(){
    D.querySelector("#gate button[data-set=zh]").click();
    for(var i=0;i<60&&!D.querySelector(".stage").classList.contains("rail");i++){W.dispatchEvent(new Event("scroll"));W.__tick(100)}
    W.__tick(4500);   // 第 1 部分照真实时间播完
    return st();
  }
  function run(id,maxMs){
    var P=PAT[id],seq=P.s,i=0,t=0,vis=[],cur=null,lastKey="",out;
    maxMs=maxMs||120000;
    if(P.key)W.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown"}));
    function samp(){
      var s=st(),key=s.p+(s.sub>=0?"."+s.sub:"");
      if(key!==lastKey){cur={k:key,t0:t,t1:t,max:0,fullAt:-1,full:0};vis.push(cur);lastKey=key}
      cur.t1=t;if(s.txt>cur.max)cur.max=s.txt;
      if(s.txt>=1&&cur.fullAt<0)cur.fullAt=t;
      if(cur.fullAt>=0&&s.txt>=1)cur.full=t-cur.fullAt;
      return s;
    }
    var s=samp();
    while(t<maxMs&&s.p!==7){
      var e=seq[i++%seq.length],left=e[0];
      while(left>0){var d=Math.min(16,left);W.__tick(d);t+=d;left-=d;s=samp()}
      wheel(e[1]);
    }
    if(P.key)W.dispatchEvent(new KeyboardEvent("keyup",{key:"ArrowDown"}));
    for(var j=0;j<400;j++){W.__tick(16);t+=16;samp()}
    out=vis.map(function(v){return v.k+"("+((v.t1-v.t0)/1000).toFixed(1)+"s,"+Math.round(v.max*100)+"%"+(v.fullAt>=0?",满后"+(v.full/1000).toFixed(1)+"s":"")+")"});
    return {pat:P.n,end:st().p===7?"到结束页":"没到结束页，停在 "+lastKey,total:(t/1000).toFixed(1)+"s",bad:vis.filter(function(v){return v.max<1&&v.k!=="7"&&v.k!=="3"&&v.k!=="4"}).map(function(v){return v.k+":"+Math.round(v.max*100)+"%"}),seq:out.join(" "),err:W.__err||null};
  }
  return {st:st,start:start,run:run,PAT:PAT,wheel:wheel,go:function(id,ms){start();var r=run(id,ms||90000);try{localStorage.clear()}catch(e){}return r.pat+" → "+r.end+"，共 "+r.total+(r.bad.length?"；没显示完就离开："+r.bad.join(" "):"；全部显示完")+"\n"+r.seq+(r.err?"\nERR "+JSON.stringify(r.err):"")}};
})();
