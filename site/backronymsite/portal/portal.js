(function(){
  var WORDS=[["","Backronym",{zh:"它是什么？",en:"What is it?"}],["l’","Usage",{zh:"它能做什么？",en:"What is it for?"}],["das ","Ergebnis",{zh:"长什么样？",en:"What comes out?"}],["el ","Rasgo",{zh:"有什么不同？",en:"What sets it apart?"}],["il ","Gioco",{zh:"怎么玩？",en:"How to play?"}],["","Introitus",{zh:"从哪里进？",en:"Where to begin?"}],["","Licentia",{zh:"可以怎么用？",en:"On what terms?"}]];
  // 背景浮词：抄自工具入场界面的预设词（app/assets/core.js 的英语 60 个 + app/assets/lang/presets.js 的五门语言），只抄词不抄释义
  var POOL="time life child world family night home mother story friend father power city body art war love music death heart light mind hope road fire blood nature lie loss truth dark memory spring peace fear sea dream freedom winter identity faith river youth justice hate earth desire soul dance beauty silence secret honor self journey wealth darkness pride joy fate temps mémoire enfance avenir passé destin liberté solitude amour amitié désir espoir peur joie douleur vérité beauté rêve oubli absence départ retour chemin patrie origine âme esprit vie mort naissance jeunesse vieillesse printemps hiver nuit aube ombre mer terre guerre deuil nostalgie tendresse histoire éternité courage rencontre été automne lune forêt Zeit Erinnerung Kindheit Zukunft Schicksal Freiheit Einsamkeit Schweigen Liebe Hoffnung Angst Freude Schmerz Wahrheit Schönheit Traum Abschied Wiederkehr Heimat Ursprung Geheimnis Seele Geist Leben Tod Geburt Jugend Natur Frühling Winter Nacht Schatten Meer Wald Krieg Frieden Armut Glanz Dämmerung Wehmut Fernweh Reue Neid Versöhnung Zuflucht Ehrfurcht Anmut Zuversicht Sehnsucht Geschichte Ewigkeit Mut Herbst Wildnis tiempo memoria infancia futuro pasado destino libertad soledad silencio amor amistad deseo esperanza miedo alegría dolor verdad belleza sueño olvido ausencia partida regreso viaje camino patria origen secreto alma espíritu vida muerte nacimiento juventud vejez naturaleza primavera noche alba sombra estrella mar bosque paz guerra duelo nostalgia ternura historia eternidad felicidad hogar otoño horizonte tempo infanzia passato libertà solitudine silenzio amore amicizia desiderio speranza paura gioia dolore verità bellezza sogno oblio assenza partenza ritorno viaggio esilio segreto anima spirito vita morte nascita gioventù natura inverno notte ombra mare terra pace lutto tenerezza storia eternità coraggio casa estate autunno tempus fātum lībertās sōlitūdō silentium amīcitia dēsīderium spēs metus gaudium vēritās somnium oblīviō absentia reditus iter via orīgō arcānum spīritus vīta mors nātūra vēr hiems aurōra umbra lūmen bellum lūctus pietās fidēs virtūs glōria aeternitās ōtium cūra concordia carmen imāgō fābula animus mundus invidia aestās autumnus silva ortus".split(" ");
  var root=document.documentElement, word=document.getElementById("word"), letters=word.children;
  function meta(name){return document.querySelector('meta[name="'+name+'"]').content.trim()}
  function htmlText(text){return text.replace(/&/g,"&amp;").replace(/</g,"&lt;")}
  var version=meta("backronym-version"), versionMarkup=version?"<span>"+htmlText(version)+"</span>":"";
  var icp=/^(?:www\.)?bydpass\.cn$/.test(location.hostname)?meta("backronym-icp"):"";
  var under=document.getElementById("under"), label=document.getElementById("label"), gate=document.getElementById("gate");
  var stage=document.getElementById("stage"), parts=document.querySelectorAll(".part"), bgw=document.getElementById("bgw");
  var calm=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(calm) root.classList.add("calm");
  var active=-1, swapTimer=0, flipUntil=0, seq=0;
  // —— 动效的时钟由滚动推进 ——
  // 各部分的出场（标题打字、过场的每一步、内容逐句出现）都排在一条「虚拟时间」上：later(fn,ms)。
  // 虚拟时间不随真实时间走，而是随滚动走：滑多少，就往前播多少；不滑就停在那里。
  // 例外（auto）：首屏入场、选完语言落位、点字母跳转——这几种用户没有在滑，照真实时间播。
  // 滑得再猛，播放也有上限：平时最多 4 倍速，积压超过 1.5 秒的量时最多 8 倍速，免得一格滚轮就闪完。
  // 持续下滑（按住方向键，或滚轮不停地滚）时一律最多 4 倍。
  var rate=1, speed=0, lastY=0, lastT=0, lastChange=0, calmUntil=0;
  var vnow=0, vq=[], pend=0, auto=true, hyb=false, lastF=0, flyEnd=0;
  // 每个部分从出场到显示完大约要多少毫秒（样稿实测），用来把滚动距离折算成时间：滑过一个部分的六成距离就播完
  var EST=[3600,7500,4000,5000,13000,5000,8500];
  // 各部分占几段滚动距离，以及各自的起点（以段计）。第 4 部分有五个子部分，占三段
  var SPAN=[1,1,1,3,3,1,1,1], CUM=[0,1,2,3,6,9,10,11], FIN=7;   // 第 8 站是结束页，不在 parts 里
  function later(fn,ms){var it={t:vnow+Math.max(ms||0,0),fn:fn};vq.push(it);return it}
  function cancel(it){if(it)it.fn=null}
  function pump(ms){
    var end=vnow+ms,k,b,it;
    for(;;){b=-1;for(k=0;k<vq.length;k++)if(vq[k].t<=end&&(b<0||vq[k].t<vq[b].t))b=k; if(b<0)break; it=vq.splice(b,1)[0]; vnow=it.t; if(it.fn)it.fn()}
    vnow=end;
  }
  function frame(){
    var t=performance.now(), dt=Math.max(0,Math.min(t-lastF,100)), use; lastF=t;
    if(auto||calm) pump(dt);
    // hyb（第 5 部分）：不滑也照真实时间播；滑的时候再添最多 3 倍，合计最多 4 倍。文字因此不会卡住下滑，也不会没打完就被翻走
    else if(hyb){use=Math.min(pend,dt*3); pend-=use; pump(dt+use)}
    else if(pend>0){use=Math.min(pend,dt*((pend>1500&&!held())?8:4)); pend-=use; pump(use)}
    // 已经滚到页面最底、再没有滚动可以推进：最后一部分剩下的动画照真实时间播完
    else if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-2) pump(dt);
    requestAnimationFrame(frame);
  }
  lastF=performance.now(); requestAnimationFrame(frame);
  root.classList.add("locked");

  function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function isRail(){return stage.classList.contains("rail")||stage.classList.contains("fin")}
  function narrow(){return window.innerWidth<=760}

  // 把各部分的内容断成小句：整块的东西（节号、词头行、例子的一行、卡片、入口）各算一句；
  // 其余文字在标点后面断开（中文标点随处断，西文标点后面跟着空白才断，所以 3.0、网址不会被拆）
  var ATOM=".num,.meta,.eg .row,.doors>a,.doors>span,a";
  function segment(){
    var all=document.querySelectorAll("#parts "+ATOM), k, el;
    for(k=0;k<all.length;k++){el=all[k]; if(!el.parentNode.closest(ATOM)) el.classList.add("seg")}
    var tw=document.createTreeWalker(document.getElementById("parts"),NodeFilter.SHOW_TEXT,null,false), nodes=[], n;
    while((n=tw.nextNode())){ if(/\S/.test(n.nodeValue)&&!n.parentNode.closest(".seg,.sim,.cards,.rg")) nodes.push(n) }
    for(k=0;k<nodes.length;k++){
      var t=nodes[k].nodeValue, frag=document.createDocumentFragment(), buf="", c, j;
      for(j=0;j<t.length;j++){
        c=t.charAt(j); buf+=c;
        var CJ="，。：；、！？…", cut=(CJ.indexOf(c)>=0&&(CJ+"」』）").indexOf(t.charAt(j+1))<0)||(",.:;!?".indexOf(c)>=0&&/\s/.test(t.charAt(j+1)));
        if(cut||j===t.length-1){var sp=document.createElement("span");sp.className="seg";sp.textContent=buf;frag.appendChild(sp);buf=""}
      }
      nodes[k].parentNode.replaceChild(frag,nodes[k]);
    }
  }
  // 出场前给看得见的小句排号（另一种语言的那份不占号）
  function order(part){
    var segs=part.querySelectorAll(".seg"), n=0;
    for(var k=0;k<segs.length;k++) if(segs[k].offsetParent!==null) segs[k].style.setProperty("--i",n++);
  }
  segment();

  // 量一个元素里文字基线离它顶边多远：塞一个零尺寸的探针，它就落在基线上。
  // 用排版位置（offsetTop）而不用屏幕位置，字母还在滑动变形时量出来也是对的
  function baseOff(el){var m=document.createElement("span");m.style.cssText="display:inline-block;width:0;height:0";el.appendChild(m);var y=m.offsetTop;m.remove();return y}
  // 小词的位置：首屏在大词下方，左边对齐大词的首字母 B；
  // 字母栏状态下它是当前部分的标题：所有部分的标题都与字母栏的 B 同一行、同字号，基线对齐
  function place(i){
    label.querySelector(".art").textContent=WORDS[i][0];
    label.querySelector(".w").textContent=WORDS[i][1];
    var sub=WORDS[i][2];
    label.querySelector(".sub").textContent=(sub&&isRail())?(sub[root.getAttribute("data-lang")]||""):"";
    var s=stage.getBoundingClientRect(), x, y;
    if(isRail()){
      x=s.width+parseFloat(getComputedStyle(parts[i]).paddingLeft);
      y=s.top+letters[0].offsetTop+baseOff(letters[0])-baseOff(label);
    }else{
      x=letters[0].getBoundingClientRect().left;
      y=under.getBoundingClientRect().top;
    }
    label.style.left=(x-s.left)+"px"; label.style.top=(y-s.top)+"px";
    var se=label.querySelector(".sub"); se.style.fontSize="";
    if(isRail()&&se.textContent){
      var max=window.innerWidth-20-x, fs=parseFloat(getComputedStyle(se).fontSize);
      while(label.offsetWidth>max&&fs>14){fs-=1;se.style.fontSize=fs+"px"}
    }
  }
  // —— 第 2 部分的过场 ——
  var simWord=document.getElementById("sim-word"), simPick=document.getElementById("sim-pick"), simIn=document.getElementById("sim-in"),
      simGloss=document.getElementById("sim-gloss"), simCap=document.getElementById("sim-cap"), flies=[], flyTok=0;
  var CAP={zh:"为喜欢的作品，写一点自己的",en:"For the work you love, something of your own"};
  function simCells(w,hid){simWord.textContent="";for(var k=0;k<w.length;k++){var c=document.createElement("span");c.textContent=w.charAt(k);if(hid)c.className="hid";simWord.appendChild(c)}}
  function clearFly(){flyTok++;while(flies.length)flies.pop().remove()}
  function simReset(){simCells("FANCREATION",true);simPick.classList.remove("in");simIn.textContent="";simGloss.classList.remove("in");simCap.textContent=""}
  function simFinal(){simCells("FANWORK",false);simWord.firstChild.classList.add("on");simPick.classList.add("in");simIn.textContent="Fantasy";simGloss.classList.add("in");simCap.textContent=CAP[root.getAttribute("data-lang")]||""}
  // magic move：一组字母从起点各自飞到终点。替身的字体照终点，颜色从起点的颜色渐变到终点的颜色。
  // 替身飞到位后不撤：终点那一组要等标题打完、这一部分出场才显示，到那时再换下替身（见各过场的开头）
  function magic(src,dst,stagger,fade){
    var k, my=++flyTok;
    if(src.length!==dst.length) return;
    for(k=0;k<dst.length;k++){
      var a=src[k].getBoundingClientRect(), b=dst[k].getBoundingClientRect(), cs=getComputedStyle(dst[k]), el=document.createElement("span");
      el.className="fly"; el.textContent=dst[k].textContent;
      el.style.left=b.left+"px"; el.style.top=b.top+"px"; el.style.fontSize=cs.fontSize; el.style.fontFamily=cs.fontFamily; el.style.fontWeight=cs.fontWeight; el.style.lineHeight=cs.lineHeight;
      el.style.color=getComputedStyle(src[k]).color; el.setAttribute("data-to",cs.color);
      el.style.transform="translate("+(a.left-b.left)+"px,"+(a.top-b.top)+"px) scale("+(a.height/b.height)+")"; if(fade) el.style.opacity="0";
      document.body.appendChild(el); flies.push(el);
    }
    void document.body.offsetWidth; flyEnd=Date.now()+720+(stagger||0)*(dst.length-1);
    for(k=0;k<flies.length;k++){flies[k].style.transition="transform .7s cubic-bezier(.6,0,.2,1),color .7s ease"+(fade?",opacity .525s linear":""); if(fade) flies[k].style.opacity="1";flies[k].style.transitionDelay=(k*(stagger||0))+"ms";flies[k].style.transform="";flies[k].style.color=flies[k].getAttribute("data-to")}
  }
  function wait(ms,ok,fn){later(function(){if(ok())fn()},ms)}
  // 删去 CREATION → 打出 WORK → F 变红 → 选词栏打出 Fantasy → 释义出现 → 配文逐字打出
  function simRun(ok,done){
    for(var k=0;k<simWord.children.length;k++)simWord.children[k].classList.remove("hid");
    wait(320,ok,clearFly);
    wait(450,ok,function del(){
      if(simWord.children.length>3){simWord.removeChild(simWord.lastChild);wait(80,ok,del);return}
      var add="WORK",n=0;
      wait(250,ok,function ty(){
        if(n<add.length){var c=document.createElement("span");c.textContent=add.charAt(n++);simWord.appendChild(c);wait(130,ok,ty);return}
        wait(350,ok,function(){
          simWord.firstChild.classList.add("on");
          wait(350,ok,function(){
            simPick.classList.add("in"); simIn.textContent="Fantasy";
            typeEls([simIn],90,function(){wait(250,ok,function(){
              simGloss.classList.add("in");
              wait(550,ok,function(){
                simCap.textContent=CAP[root.getAttribute("data-lang")]||"";
                typeEls([simCap],45,function(){wait(300,ok,done)},ok);
              });
            })},ok);
          });
        });
      });
    });
  }
  // —— 第 3 部分：标题打完后，四张卡从左侧依次滑入 ——
  var cardsEl=document.getElementById("cards");
  // 手机上的一摞：后面的卡缩小一档，右边总比前一张多露出 14px。卡片宽窄不一，所以按实际宽度算，不写死
  function deck(){
    var c=cardsEl.children, k, by=[], right=0;
    for(k=0;k<c.length;k++) by[parseInt(c[k].getAttribute("data-pos"),10)]=c[k];
    for(k=0;k<by.length;k++){
      var e=by[k]; if(!e) continue;
      if(!narrow()){e.style.transform="";continue}
      var sc=1-0.08*k, w=e.offsetWidth*sc, x=k?Math.max(right+14-w,14*k):0;
      e.style.transform=k?"translateX("+x+"px) scale("+sc+")":"";
      right=Math.max(right,x+w);
    }
  }
  function stack(){var c=cardsEl.children;for(var k=0;k<c.length;k++)c[k].setAttribute("data-pos",k);deck()}
  function cardReset(){stack();cardsEl.classList.add("pre");for(var k=0;k<cardsEl.children.length;k++)cardsEl.children[k].classList.add("wait")}
  function cardFinal(){stack();cardsEl.classList.remove("pre");for(var k=0;k<cardsEl.children.length;k++)cardsEl.children[k].classList.remove("wait")}
  function cardRun(ok,done){
    var c=cardsEl.children;
    cardsEl.classList.remove("pre");
    (function next(n){
      if(n<c.length){c[n].classList.remove("wait");wait(170,ok,function(){next(n+1)});return}
      wait(450,ok,done);
    })(0);
  }
  window.addEventListener("resize",deck);
  // 图片加载完才知道宽度，加载后再排一次
  [].forEach.call(cardsEl.querySelectorAll("img"),function(im){if(!im.complete)im.addEventListener("load",deck)});
  // 手机上四张叠放：点一下，最上面那张退到最后
  cardsEl.addEventListener("click",function(){var c=cardsEl.children;for(var k=0;k<c.length;k++)c[k].setAttribute("data-pos",(parseInt(c[k].getAttribute("data-pos"),10)+c.length-1)%c.length);deck()});

  // 哪个部分在标题之后、内容之前有过场

  // —— 第 4 部分：RASGO 五个字母各一个子部分，在同一处轮流出现 ——
  // 词都是西班牙语（这一部分的词 el Rasgo 是西班牙语）；Seis 词库里没有，是手写的
  // 配文 cap：一行一项；s 是这一行的几段字，带 "r" 的那段标红；c 是这一行的样子（sm 较小的灰字，xs 小两号的灰字、整行淡入不逐字打）
  // 配图 fig：里面带 data-s 的零件按步出现，gap 是每步隔多久（毫秒）；exit 为 "right" 时退场是向右滑出（同第 3 部分的卡片），否则是入场的快速倒放
  var RG=[
    {k:"R",art:"el ",rest:"egalo",gloss:{zh:"礼物",en:"gift"},gap:300,fig:"<svg viewBox=\"0 0 320 160\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"color:var(--ink)\"><path class=\"fm\" data-s=\"1\" style=\"--from:scaleY(-1);--o:50% 100%\" d=\"M24 66L88 26L152 66z\" fill=\"var(--panel)\"/><g class=\"fd\" data-s=\"0\"><g class=\"fm\" data-s=\"3\" style=\"--from:translate(-148px,0)\"><g class=\"fm\" data-s=\"2\" style=\"--from:translate(0,44px)\"><rect x=\"178\" y=\"24\" width=\"116\" height=\"72\" fill=\"var(--panel)\"/><rect x=\"183\" y=\"29\" width=\"106\" height=\"62\" stroke=\"var(--rule)\" stroke-width=\"1\"/><g class=\"fd\" data-s=\"4\" stroke=\"none\" text-anchor=\"middle\"><text x=\"236\" y=\"63\" font-size=\"21\" fill=\"currentColor\" font-family=\"Cinzel,Georgia,serif\">GPL 3.0</text><text x=\"236\" y=\"82\" font-size=\"14.5\" font-style=\"italic\" fill=\"var(--zhu)\" font-family=\"'Cormorant Garamond',Georgia,serif\">or later</text></g></g></g></g><g class=\"fd\" data-s=\"0\"><rect x=\"24\" y=\"66\" width=\"128\" height=\"76\" fill=\"var(--panel)\"/><path d=\"M24 66L88 108L152 66\" stroke=\"var(--rule)\"/></g></svg>",
     cap:{zh:[{s:[["以 GPL 3.0 or later 开源"]]},{s:[["你可以把它部署到你的电脑上，自由使用 / 改造"]]}],
          en:[{s:[["Open source under GPL 3.0 or later"]]},{s:[["Deploy it on your own computer, free to use and modify"]]}]}},
    {k:"A",art:"el ",rest:"juste",gloss:{zh:"调整",en:"adjustment"},gap:170,exit:"right",fig:"<svg viewBox=\"0 0 320 160\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"color:var(--ink)\"><g class=\"ft\" data-s=\"0\" style=\"--from:translateX(-36px)\"><rect x=\"40\" y=\"32\" width=\"72\" height=\"96\" fill=\"var(--panel)\"/><rect x=\"48\" y=\"40\" width=\"56\" height=\"36\" fill=\"var(--rule)\" stroke=\"none\"/><path d=\"M48 82h34\" stroke-width=\"3.2\"/><path d=\"M48 82h7\" stroke-width=\"3.2\" stroke=\"var(--zhu)\"/><path d=\"M48 91h12\" stroke-width=\"2\"/><path d=\"M48 99h20\" stroke-width=\"1.2\" stroke=\"var(--stone)\"/><path d=\"M48 108h44\" stroke-width=\"1.2\"/><path d=\"M48 115h30\" stroke-width=\"1.2\"/></g><g class=\"ft\" data-s=\"1\" style=\"--from:translateX(-36px)\"><rect x=\"124\" y=\"32\" width=\"72\" height=\"96\" fill=\"var(--panel)\"/><rect x=\"132\" y=\"40\" width=\"56\" height=\"36\" fill=\"var(--rule)\" stroke=\"none\"/><path d=\"M143 82h34\" stroke-width=\"3.2\"/><path d=\"M143 82h7\" stroke-width=\"3.2\" stroke=\"var(--zhu)\"/><path d=\"M154 91h12\" stroke-width=\"2\"/><path d=\"M150 99h20\" stroke-width=\"1.2\" stroke=\"var(--stone)\"/><path d=\"M138 108h44\" stroke-width=\"1.2\"/><path d=\"M145 115h30\" stroke-width=\"1.2\"/></g><g class=\"ft\" data-s=\"2\" style=\"--from:translateX(-36px)\"><rect x=\"208\" y=\"32\" width=\"72\" height=\"96\" fill=\"var(--panel)\"/><rect x=\"216\" y=\"84\" width=\"56\" height=\"36\" fill=\"var(--rule)\" stroke=\"none\"/><path d=\"M238 44h34\" stroke-width=\"3.2\"/><path d=\"M238 44h7\" stroke-width=\"3.2\" stroke=\"var(--zhu)\"/><path d=\"M260 53h12\" stroke-width=\"2\"/><path d=\"M252 61h20\" stroke-width=\"1.2\" stroke=\"var(--stone)\"/><path d=\"M228 70h44\" stroke-width=\"1.2\"/><path d=\"M242 77h30\" stroke-width=\"1.2\"/></g></svg>",
     cap:{zh:[{s:[["对开、居中"]]},{s:[["或者自己调位置，都由你定"]]}],
          en:[{s:[["Folio, Centered"]]},{s:[["or place things yourself: it is all your call"]]}]}},
    {k:"S",art:"",rest:"eis",gloss:{zh:"六",en:"six"},gap:150,fig:"<div class=\"sx\"><p><span class=\"wp han\" data-s=\"0\">词</span><span class=\"wp\" data-s=\"1\"><b>W</b>ord</span></p><p><span class=\"wp\" data-s=\"2\"><em>le</em><b>M</b>ot</span><span class=\"wp\" data-s=\"3\"><em>la</em><b>P</b>alabra</span></p><p><span class=\"wp\" data-s=\"4\"><em>la</em><b>P</b>arola</span><span class=\"wp\" data-s=\"5\"><em>das</em><b>W</b>ort</span><span class=\"wp\" data-s=\"6\"><b>V</b>erbum</span></p></div>",
     cap:{zh:[{s:[["六门语言，均可选用"]]},{s:[["支持中文释义模糊搜索"]]},{c:"sm",s:[["抱歉一下，词库尚在进一步优化中，可能搜不到你想要的义项"]]}],
          en:[{s:[["Six languages, all yours to pick"]]},{s:[["Fuzzy search by Chinese meaning"]]},{c:"sm",s:[["Sorry: the lexicon is still being refined, and the sense you want may not turn up"]]}]}},
    {k:"G",art:"la ",rest:"arantía",gloss:{zh:"保证",en:"guarantee"},gap:340,fig:"<svg viewBox=\"0 0 320 160\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"color:var(--ink)\"><g class=\"fd\" data-s=\"0\"><rect x=\"96\" y=\"22\" width=\"128\" height=\"116\" rx=\"3\" fill=\"var(--panel)\"/><path d=\"M96 40h128\"/><g fill=\"currentColor\" stroke=\"none\"><circle cx=\"106\" cy=\"31\" r=\"2\"/><circle cx=\"114\" cy=\"31\" r=\"2\"/><circle cx=\"122\" cy=\"31\" r=\"2\"/></g></g><g class=\"ft\" data-s=\"1\" style=\"--from:scale(.7)\"><rect x=\"134\" y=\"66\" width=\"52\" height=\"42\" rx=\"6\"/><path d=\"M160 66v-9M128 82v10M192 82v10M150 97h20\"/><circle cx=\"160\" cy=\"54\" r=\"3\"/><circle cx=\"149\" cy=\"82\" r=\"3.4\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"171\" cy=\"82\" r=\"3.4\" fill=\"currentColor\" stroke=\"none\"/></g><path class=\"dr\" data-s=\"2\" pathLength=\"1\" d=\"M122 50L198 126\" stroke=\"var(--zhu)\" stroke-width=\"3\"/><path class=\"dr\" data-s=\"3\" pathLength=\"1\" d=\"M198 50L122 126\" stroke=\"var(--zhu)\" stroke-width=\"3\"/></svg>",
     cap:{zh:[{s:[["本工具的运行及其功能"],["不依赖任何生成式人工智能","r"]]},{c:"xs",s:[["本工具由 Claude Opus 5.5 · GPT 6.2 Sol · DeepSeek V4.1 Flash 等联合开发 + 部分设计 + 代码审计，由作者 @beyondpassenger（GitHub @bydpass）个人统筹 + 设计"]]}],
          en:[{s:[["This tool runs and does its work "],["without relying on any generative AI","r"]]},{c:"xs",s:[["Co-developed, partly designed and code-audited with Claude Opus 5.5 · GPT 6.2 Sol · DeepSeek V4.1 Flash and others; directed and designed by the author @beyondpassenger (GitHub @bydpass)"]]}]}},
    {k:"O",art:"la ",rest:"bra",gloss:{zh:"作品",en:"work"},gap:260,fig:"<svg viewBox=\"0 0 320 160\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"color:var(--ink)\"><g transform=\"rotate(-5 160 80)\"><rect class=\"fd\" data-s=\"0\" x=\"120\" y=\"24\" width=\"80\" height=\"112\" fill=\"var(--panel)\"/><path class=\"dr\" data-s=\"1\" pathLength=\"1\" d=\"M130 40h42\" stroke-width=\"3.2\"/><path class=\"dr\" data-s=\"2\" pathLength=\"1\" d=\"M130 49h12\" stroke-width=\"2\"/><path class=\"dr\" data-s=\"2\" pathLength=\"1\" d=\"M130 57h22\" stroke=\"var(--stone)\" stroke-width=\"1.2\"/><path class=\"dr\" data-s=\"3\" pathLength=\"1\" d=\"M130 66h52M130 73h34\" stroke-width=\"1.2\"/><rect class=\"ft\" data-s=\"4\" style=\"--from:scale(.8)\" x=\"130\" y=\"81\" width=\"60\" height=\"34\" fill=\"var(--rule)\" stroke=\"none\"/><path class=\"dr\" data-s=\"5\" pathLength=\"1\" d=\"M146 129c6-9 10-9 12-2s6 5 10-2 8-5 10 0 6 3 12-3\" stroke=\"var(--zhu)\"/></g></svg>",
     cap:{zh:[{s:[["每一份作品都是你的，你的！"]]}],en:[{s:[["Every piece is yours, yours!"]]}]}}
  ];
  // —— 第 5 部分：il Gioco。五步教学，演示界面照产品实际界面复刻 ——
  // 界面上的字抄自产品（app/assets/i18n.js）；例词 GIOCO、语言选意大利语，五格填的就是这五个子页面的词
  var PCELL=[
    {L:"G",art:"la ",w:"Guida",g:{zh:"指南",en:"guide"}},
    {L:"I",art:"l’",w:"Iniziale",g:{zh:"初始字母",en:"initial letter"}},
    {L:"O",art:"l’",w:"Opera",g:{zh:"作品",en:"work"}},
    {L:"C",art:"la ",w:"Composizione",g:{zh:"排版",en:"composition"}},
    {L:"O",art:"l’",w:"Omaggio",g:{zh:"敬意",en:"homage"}}
  ];
  var PL={
    zh:{set:"设置",h:"起一个单词",word:"单词",cnt:"{n} / 14 个字符",ph:"输入一个英语单词",nosense:"词库里没有 {w} 的释义",sense:"GIOCO：游戏",lang:"语言",lg1:"英语",lg2:"英 意",ready:"已就绪",more:"更多语言……",less:"收起",
      langs:[["英语","English"],["法语","Français"],["德语","Deutsch"],["西班牙语","Español"],["意大利语","Italiano"],["拉丁语","Latina"]],pre:"选一个单词作为主题：",shuffle:"换一组",
      presets:[["LIGHT","光"],["NATURE","自然"],["DARK","黑暗"],["WORLD","世界"],["JUSTICE","正义"],["DREAM","梦"]],maker:"填表人（选填）",note:"留空则图上不出现",start:"开始填充",
      single:"单图",grid:"列阵",done:"完成",starts:"{s} 开头",gloss:"释义",capph:"配文（选填）",chead:"G 开头 · 1 / 2 批",ctool:"专业、历史文化词",rand:"随机一个",next:"下一批",togo:"还差 {n} 格",layout:"版式",change:"改单词",
      draft:"草稿存在本设备，18 小时未改动自动清除",imgfor:"这一格（{L}）的配图",close:"关闭",choose:"选择图片",imgall:"所有格共用的默认图",fin:"导出 5 张单图",save:"保存到相册",post:"发布笔记",exported:"已导出 5 张",saved:"已保存 5 张到相册",credits:"借物与版权",
      preset:"预设",folio:"对开",center:"居中",custom:"自定义",text:"文字",wm:"词与释义",capl:"配文",title:"标题",left:"左",right:"右",theme:"主题",skins:["fandom","单色画","印象派","分离派","表格"],only1:"仅浅色",only2:"仅深色",mode:"深浅",modes:["跟随系统","浅色","深色"],uil:"界面语言",uils:["跟随系统","中文","English"],
      cap:"一格，一件小作品",
      cands:[["","Guide","[英] <em>n.</em> 指南"],["","Guidare","[意] <em>v.</em> 驾驶"],["","Guilty","[英] <em>adj.</em> 有罪"],["la ","Guida","[意] <em>s. f.</em> 指南"],["","Guideline","[英] <em>n.</em> 指导方针"],["il ","Guidatore","[意] <em>s. m.</em> 驾驶员"],["","Guilt","[英] <em>n.</em> 内疚"],["","Guitar","[英] <em>n.</em> 吉他"]]},
    en:{set:"",h:"Pick a word",word:"Word",cnt:"{n} / 14 characters",ph:"English word",nosense:"No meaning for {w} in the word list",sense:"GIOCO: game",lang:"Language",lg1:"English",lg2:"En It",ready:"ready",more:"More languages…",less:"Show fewer",
      langs:[["English",""],["French","Français"],["German","Deutsch"],["Spanish","Español"],["Italian","Italiano"],["Latin","Latina"]],pre:"Pick a word as your theme:",shuffle:"Shuffle",
      presets:[["LIGHT",""],["NATURE",""],["DARK",""],["WORLD",""],["JUSTICE",""],["DREAM",""]],maker:"Maker Name (optional)",note:"Leave empty to keep it off the image",start:"Start filling",
      single:"Single",grid:"Grid",done:"Done",starts:"Starts with {s}",gloss:"Meaning",capph:"Caption (optional)",chead:"Starts with G · set 1 of 2",ctool:"Tec & HisCul",rand:"Random",next:"Next set",togo:"{n} to go",layout:"Layout",change:"Change word",
      draft:"Drafts are kept on this device and cleared after 18 hours without changes",imgfor:"Image for this cell ({L})",close:"Close",choose:"Choose image",imgall:"Default image shared by all cells",fin:"Export 5 single images",save:"Save to Photos",post:"Post a note",exported:"Exported 5 images",saved:"Saved 5 images to Photos",credits:"Credits & licenses",
      preset:"Preset",folio:"Folio",center:"Centered",custom:"Custom",text:"Text",wm:"Word & meaning",capl:"Caption",title:"Title",left:"Left",right:"Right",theme:"Theme",skins:["fandom","Dansaek","Monet","Vienna","Table"],only1:"light only",only2:"dark only",mode:"Appearance",modes:["System","Light","Dark"],uil:"Interface language",uils:["System","中文","English"],
      cap:"One cell, one small work",
      cands:[["","Guide","<em>n.</em>"],["","Guidare","[It] <em>v.</em> to drive"],["","Guilty","<em>adj.</em>"],["la ","Guida","[It] <em>s. f.</em> guide"],["","Guideline","<em>n.</em>"],["il ","Guidatore","[It] <em>s. m.</em> driver"],["","Guilt","<em>n.</em>"],["","Guitar","<em>n.</em>"]]}
  };
  var PSKIN=[["fandom","#ffffff","#990000"],["dansaekhwa","#e9e6df","#7a4f2a"],["impressionism","#eef0ea","#a34732"],["secession","#f3efe2","#8f1d1d"],["table","#000000","#e5604f"]];
  var PIMG="<svg viewBox=\"0 0 319 209\" preserveAspectRatio=\"xMidYMid slice\"><rect width=\"319\" height=\"209\" fill=\"#e9dcc6\"/><circle cx=\"236\" cy=\"62\" r=\"26\" fill=\"#d8643a\"/><path d=\"M0 150c40-34 78-40 118-14s74 30 112 4 62-22 89-6v75H0z\" fill=\"#8b9a7b\"/><path d=\"M0 176c52-22 96-20 150-4s110 14 169-10v47H0z\" fill=\"#5d6f5c\"/></svg>";
  function pmHTML(l){
    var L=PL[l], h, j, btn=function(c,t){return "<span class=\"pbtn "+c+"\">"+t+"</span>"}, gear="<i class=\"gear\"></i>";
    h="<div class=\"pm\"><div class=\"ps\" data-skin=\"fandom\" data-l=\""+l+"\"><div class=\"pcur\"><i></i><svg viewBox=\"0 0 30 34\"><path d=\"M8 2.5c1.4 0 2.5 1.1 2.5 2.5v9.200l1.200-.3c1-.3 2 .2 2.500 1 .9-.5 2.100-.3 2.800.6.300.4.400.6.500.9 1-.3 2.100.2 2.600 1.200.300.6.400 1 .400 2v5.500c0 3.600-2.600 6.400-6.200 6.400h-2.300c-2.300 0-4.200-1-5.500-2.900l-4.800-7.100c-.7-1-.4-2.400.7-3 .9-.5 2-.3 2.700.5l.9 1.100V5c0-1.400 1.100-2.500 2.500-2.500z\" fill=\"#fff\" stroke=\"#1c1c1b\" stroke-width=\"1.600\" stroke-linejoin=\"round\"/></svg></div>";
    // 入场界面
    h+="<div class=\"sc sc-e\"><div class=\"pbar\"><b>Backronym</b>"+btn("",gear+L.set)+"</div><h1 class=\"e-h\">"+L.h+"</h1>";
    h+="<div class=\"e-row\"><b>"+L.word+"</b><span class=\"e-cnt\"></span></div><div class=\"e-in\"><span class=\"e-txt\"></span><i class=\"pcaret\"></i><span class=\"e-ph\">"+L.ph+"</span></div>";
    h+="<p class=\"e-sense\"></p><p class=\"e-let\"></p><div class=\"e-lang\"><span>"+L.lang+"</span><b class=\"e-lg\"></b><span class=\"e-st\"></span><u class=\"e-more\"></u></div><ul class=\"e-list\">";
    for(j=0;j<L.langs.length;j++) h+="<li class=\""+(j===0?"tick":"")+(j===4?" e-it":"")+"\"><i class=\"cb\"></i><span>"+L.langs[j][0]+" "+L.langs[j][1]+"</span><em>"+L.ready+"</em></li>";
    h+="</ul><div class=\"e-pre\"><span>"+L.pre+"</span>"+btn("",L.shuffle)+"</div><div class=\"e-grid\">";
    for(j=0;j<L.presets.length;j++) h+="<span>"+L.presets[j][0]+(L.presets[j][1]?"<small>"+L.presets[j][1]+"</small>":"")+"</span>";
    h+="</div><div class=\"e-row\" style=\"padding-top:30px\"><b>"+L.maker+"</b><span>0 / 16</span></div><div class=\"e-in2\"></div><p class=\"e-note\">"+L.note+"</p><div class=\"e-start\">"+L.start+"</div></div>";
    // 编辑界面
    h+="<div class=\"sc sc-d\"><div class=\"pbar c\"><span class=\"pseg\"><b class=\"on\">"+L.single+"</b><b>"+L.grid+"</b></span>"+btn("d-set",gear+L.set)+btn("solid d-finbtn","✓ "+L.done)+"</div>";
    h+="<div class=\"d-rule\"></div><div class=\"d-title\">GIOCO</div><div class=\"d-plate\"><b class=\"d-big\"></b><div class=\"d-img\">"+PIMG+"</div></div>";
    h+="<div class=\"d-word\"><span class=\"d-art\"></span><span class=\"d-ini\"></span><span class=\"d-rest\"></span><i class=\"pcaret\"></i><span class=\"d-ph\"></span></div>";
    h+="<div class=\"d-meta\"><i class=\"d-bar\"></i><div class=\"d-gloss\"></div><div class=\"d-cap\"><span class=\"d-capt\"></span><i class=\"pcaret\"></i><span class=\"d-capph\">"+L.capph+"</span></div></div>";
    h+="<div class=\"d-cands\"><div class=\"c-head\"><span>"+L.chead+"</span><span>3 / 28</span></div><div class=\"c-tools\"><span><i class=\"cb\"></i>"+L.ctool+" <i>+1</i></span><b>"+L.rand+"</b><i>"+L.next+"</i></div><div class=\"c-grid\">";
    for(j=0;j<L.cands.length;j++) h+="<div class=\"c-it"+(j===3?" c-pick":"")+"\"><b><s>"+L.cands[j][0]+"</s><u>G</u>"+L.cands[j][1].slice(1)+"</b>"+L.cands[j][2]+"</div>";
    h+="</div></div><div class=\"d-strip\"><b>G</b><b>I</b><b>O</b><b>C</b><b>O</b></div><div class=\"d-foot\"><span class=\"d-left\"></span>"+btn("d-lay",L.layout)+btn("",L.change)+"</div><p class=\"d-note\">"+L.draft+"</p>";
    h+="<div class=\"sheet sh-img\"><div class=\"sh-row\"><b class=\"sh-imgt\"></b>"+btn("",L.close)+"</div>"+btn("wide left sh-pick",L.choose)+"<div class=\"sh-sub\">"+L.imgall+"</div>"+btn("wide left",L.choose)+"</div>";
    h+="<div class=\"sheet sh-fin\"><div class=\"sh-row\"><b>"+L.fin+"</b><span class=\"f-cnt\"></span></div><div class=\"f-prog\"><i></i></div><div class=\"f-thumbs\">";
    for(j=0;j<5;j++) h+="<span><i>"+PCELL[j].L+"</i>"+(j+1)+" "+PCELL[j].L+"</span>";
    h+="</div><div class=\"f-btns\">"+btn("solid f-save",L.save)+btn("f-post",L.post)+"</div><p class=\"f-stat\"></p><div class=\"s-foot\" style=\"margin-top:0;border-top:0\">"+btn("",L.credits)+versionMarkup+"</div></div></div>";
    // 版式页
    var row=function(lab,c){return "<div class=\"l-row\"><span>"+lab+"</span><span class=\"pbtn l-l"+c+"\"></span><span class=\"pbtn l-c"+c+"\"></span>"+(c?"<span class=\"pbtn thin\">"+L.right+"</span>":"")+"</div>"};
    h+="<div class=\"sc sc-l\"><div class=\"phead\"><b>"+L.layout+"</b>"+btn("l-close","× "+L.close)+"</div><div class=\"l-top\"><div class=\"l-thumb\"><i></i><small>GIOCO</small><div>C</div><b><u>C</u>omposizione</b><em></em></div><div class=\"l-pre\"><span>"+L.preset+"</span><span class=\"pbtn wide l-pf\"></span><span class=\"pbtn wide l-pc\"></span></div></div>";
    h+="<div style=\"padding-top:10px\"><span class=\"pseg\"><b class=\"on\">"+L.single+"</b><b>"+L.grid+"</b></span></div><div class=\"l-sec\">"+L.custom+"</div><div class=\"l-sub\">"+L.text+"</div>"+row(L.wm,"1")+row(L.capl,"2")+row(L.title,"")+"</div>";
    // 设置页
    h+="<div class=\"sc sc-s\"><div class=\"phead\"><b>"+L.set+(L.set?"":"Settings")+"</b>"+btn("s-close","× "+L.close)+"</div><p class=\"s-lab\">"+L.theme+"</p><div class=\"s-skins\">";
    for(j=0;j<PSKIN.length;j++) h+="<span data-k=\""+PSKIN[j][0]+"\"><i style=\"--c1:"+PSKIN[j][1]+";--c2:"+PSKIN[j][2]+"\"></i>"+L.skins[j]+(j===0?"<br>"+L.only1:j===4?"<br>"+L.only2:"")+"</span>";
    h+="</div><p class=\"s-lab\">"+L.mode+"</p><div class=\"l-row\">"+btn("dash","✓ "+L.modes[0])+btn("dash",L.modes[1])+btn("dash",L.modes[2])+"</div><p class=\"s-lab\">"+L.uil+"</p><div class=\"l-row\">"+btn("","✓ "+L.uils[0])+btn("thin",L.uils[1])+btn("thin",L.uils[2])+"</div><div class=\"s-foot\">"+btn("",L.credits)+versionMarkup+"</div></div>";
    return h+"</div></div>";
  }
  // 演示界面的全部状态。每一步只改其中几项，画面由 pmRender 按状态重画；所以倒放就是把上一步的状态再画一遍
  var PS0={cur:"",sc:"e",typed:"",open:false,it:false,hit:"",focus:"",cell:0,fill:0,wt:"",cands:0,cap:"",capc:false,img:false,sheet:"",center:false,skin:"fandom",fin:0,stat:""};
  function pmTop(el,stop){var y=0;while(el&&el!==stop){y+=el.offsetTop;el=el.offsetParent}return y}
  function pmLeft(el,stop){var x=0;while(el&&el!==stop){x+=el.offsetLeft;el=el.offsetParent}return x}
  function pmRender(fig,S){
    var ps=fig.querySelector(".ps"), pm=fig.querySelector(".pm"); if(!ps) return;
    var q=function(s){return ps.querySelector(s)}, on=function(s,c,v){q(s).classList.toggle(c,!!v)}, l=ps.getAttribute("data-l"), L=PL[l], c=PCELL[S.cell], filled=S.cell<S.fill, j, e, k=["e","d","l","s"];
    ps.setAttribute("data-skin",S.skin);
    for(j=0;j<k.length;j++) on(".sc-"+k[j],"on",S.sc===k[j]);
    // 入场
    on(".e-in","has",S.typed); on(".e-in","caret-on",S.sc==="e"&&!S.open&&!S.hit);
    q(".e-txt").textContent=S.typed; q(".e-cnt").textContent=L.cnt.replace("{n}",S.typed.length);
    q(".e-sense").textContent=!S.typed?"":(S.it&&S.typed==="GIOCO"?L.sense:L.nosense.replace("{w}",S.typed));
    e=q(".e-let"); e.textContent=""; for(j=0;j<S.typed.length;j++){var b=document.createElement("b");b.textContent=S.typed.charAt(j);e.appendChild(b)}
    q(".e-lg").textContent=S.it?L.lg2:L.lg1; q(".e-st").textContent=S.it?"· "+L.ready:""; q(".e-more").textContent=S.open?L.less:L.more;
    on(".e-list","open",S.open); on(".e-it","tick",S.it); on(".e-start","hit",S.hit==="start");
    // 编辑
    on(".sc-d","center",S.center); on(".sc-d","typing",S.cands>0);
    q(".d-big").textContent=c.L; on(".d-plate","img",S.img);
    on(".d-word","has",filled||S.wt); on(".d-word","caret-on",S.wt&&!filled); on(".d-word","small",filled&&c.w.length>9);
    q(".d-art").textContent=filled?c.art:""; q(".d-ini").textContent=filled?c.L:S.wt.charAt(0); q(".d-rest").textContent=filled?c.w.slice(1):S.wt.slice(1);
    q(".d-ph").textContent=L.starts.replace("{s}",c.L);
    e=q(".d-gloss"); e.textContent=""; b=document.createElement("span"); b.textContent=filled?c.g[l]:L.gloss; e.appendChild(b);
    on(".d-cap","has",S.cap); on(".d-cap","caret-on",S.capc); q(".d-capt").textContent=S.cap;
    e=ps.querySelectorAll(".c-it"); for(j=0;j<e.length;j++) e[j].classList.toggle("v",j<S.cands);
    on(".c-pick","hit",S.hit==="cand");
    e=q(".d-strip").children; for(j=0;j<e.length;j++){e[j].classList.toggle("f",j<S.fill);e[j].classList.toggle("on",j===S.cell)}
    q(".d-left").textContent=S.fill<5?L.togo.replace("{n}",5-S.fill):""; on(".d-finbtn","hit",S.hit==="finish"); on(".d-lay","hit",S.hit==="lay"); on(".d-set","hit",S.hit==="set");
    on(".sh-img","up",S.sheet==="img"); on(".sh-pick","hit",S.hit==="pick"); q(".sh-imgt").textContent=L.imgfor.replace("{L}",c.L);
    on(".sh-fin","up",S.sheet==="fin"); q(".f-cnt").textContent=S.fin+" / 5"; q(".f-prog i").style.width=(S.fin*20)+"%";
    e=q(".f-thumbs").children; for(j=0;j<e.length;j++) e[j].classList.toggle("v",j<S.fin);
    on(".f-save","off",S.fin<5); on(".f-post","off",S.fin<5); on(".f-save","hit",S.hit==="save"); on(".f-post","hit",S.hit==="post");
    q(".f-stat").textContent=S.stat==="saved"?L.saved:(S.fin>=5?L.exported:"");
    // 版式页：选中的那个带对勾、粗框
    var pick=function(s,t,sel){var x=q(s);x.textContent=(sel?"✓ ":"")+t;x.classList.toggle("thin",!sel)};
    on(".l-thumb","center",S.center); pick(".l-pf",L.folio,!S.center); pick(".l-pc",L.center,S.center); on(".l-pc","hit",S.hit==="pcenter"); on(".l-close","hit",S.hit==="lclose");
    pick(".l-l1",L.left,!S.center); pick(".l-c1",L.center,S.center); pick(".l-l2",L.left,!S.center); pick(".l-c2",L.center,S.center); pick(".l-l",L.left,!S.center); pick(".l-c",L.center,S.center);
    // 设置页
    e=q(".s-skins").children; for(j=0;j<e.length;j++) e[j].classList.toggle("on",e[j].getAttribute("data-k")===S.skin);
    on(".s-close","hit",S.hit==="sclose");
    // 缩放到配图框的宽度；镜头对准这一步要看的地方（配图框矮时才需要移）
    var s=pm.clientWidth/375; if(!s){requestAnimationFrame(function(){if(pm.clientWidth)pmRender(fig,S)});return}
    ps.style.setProperty("--s",s);
    var sc=q(".sc.on"), vh=pm.clientHeight/s, f=S.focus?q(S.focus):null, pan=0;
    if(f&&sc) pan=pmTop(f,sc)+f.offsetHeight/2-vh/2;
    pan=Math.max(0,Math.min(pan,(sc?sc.offsetHeight:0)-vh));
    ps.style.setProperty("--pan",Math.round(pan));
    // 小手指尖落在要点的那个东西的中间
    var cu=q(".pcur"), tg=S.cur?q(S.cur):null;
    if(tg&&sc){ps.style.setProperty("--cx",Math.round(pmLeft(tg,sc)+tg.offsetWidth/2-8));ps.style.setProperty("--cy",Math.round(pmTop(tg,sc)+tg.offsetHeight/2-3))}
    cu.classList.toggle("on",!!tg); cu.classList.toggle("tap",!!S.hit);
  }
  // 脚本里的小工具：P 记一步（隔多久、改哪几项）；打字就是一个字一步
  function pmScript(start,build){
    var st=[], t=0, P=function(dt,patch){t+=dt;st.push([t,patch])};
    // 点一下：小手移过去 → 按下 → 松开并生效（after 是点完之后改的几项；null 表示按住不放，留作这一页的结尾）
    P.tap=function(sel,name,after){P(430,{cur:sel});P(480,{hit:name});if(after){var o={hit:""};for(var x in after)o[x]=after[x];P(260,o)}};
    P.type=function(key,text,gap,extra){for(var j=1;j<=text.length;j++){var o={};o[key]=text.slice(0,j);if(extra)for(var x in extra)o[x]=extra[x];P(gap,o)}};
    build(P);
    return {start:start,steps:st};
  }
  // 每一步都先让小手移过去、点一下，再发生变化；步与步之间留停顿
  var GC=[
    {k:"G",art:"la ",rest:"uida",gloss:{zh:"指南",en:"guide"},
     cap:{zh:[{s:[["先起一个单词"]]},{s:[["再选一门语言"]]}],en:[{s:[["Start with a word"]]},{s:[["then pick a language"]]}]},
     script:function(l){return pmScript({sc:"e",focus:".e-in"},function(P){
       // 关键操作：打出单词 → 选语言 → 开始填充
       P(300,{}); P.type("typed","GIOCO",200);
       P(350,{}); P.tap(".e-more","more",{open:true,focus:".e-it"}); P.tap(".e-it","it",{it:true});
       P(700,{cur:"",focus:".e-start"}); P.tap(".e-start","start",null);
     })}},
    {k:"I",art:"l’",rest:"niziale",gloss:{zh:"初始字母",en:"initial letter"},
     cap:{zh:[{s:[["每个字母，填一个以它开头的词"]]},{s:[["词库会给你候选"]]}],en:[{s:[["For each letter, a word that starts with it"]]},{s:[["The word list offers candidates"]]}]},
     script:function(l){return pmScript({sc:"d",it:true,typed:"GIOCO",focus:".d-word"},function(P){
       // 关键操作：打几个字母 → 从候选里选一个；其余四格一带而过
       P(300,{wt:"G",cands:2,focus:".d-cands"}); P(280,{wt:"Gu",cands:5}); P(280,{wt:"Gui",cands:8});
       P(300,{}); P.tap(".c-pick","cand",{wt:"",cands:0,fill:1,focus:".d-meta",cur:""});
       for(var n=1;n<5;n++){P(380,{cell:n}); P(320,{fill:n+1})}
     })}},
    {k:"O",art:"l’",rest:"pera",gloss:{zh:"作品",en:"work"},
     cap:{zh:[{s:[["释义、配文、配图"]]},{s:[["一格一格填上"]]}],en:[{s:[["Meaning, caption, image"]]},{s:[["fill them in, cell by cell"]]}]},
     script:function(l){return pmScript({sc:"d",it:true,typed:"GIOCO",cell:2,fill:5,focus:".d-meta"},function(P){
       // 关键操作：写配文 → 点图版选图
       P(300,{capc:true}); P.type("cap",PL[l].cap,l==="zh"?160:60);
       P(400,{capc:false,focus:".d-plate"}); P.tap(".d-plate","p",{sheet:"img",focus:".sh-img",cur:""});
       P(200,{}); P.tap(".sh-pick","pick",{sheet:"",img:true,focus:".d-plate",cur:""}); P(900,{focus:".d-meta"});
     })}},
    {k:"C",art:"la ",rest:"omposizione",gloss:{zh:"排版",en:"composition"},
     cap:{zh:[{s:[["对开、居中，或者自己调"]]},{s:[["主题也随你换"]]}],en:[{s:[["Folio, Centered, or your own"]]},{s:[["and swap the theme as you like"]]}]},
     script:function(l){return pmScript({sc:"l",it:true,typed:"GIOCO",cell:3,fill:5,focus:".l-top"},function(P){
       // 关键操作：版式选居中 → 设置里换主题
       P(300,{}); P.tap(".l-pc","pcenter",{center:true}); P(700,{sc:"d",focus:".pbar",cur:""});
       P(500,{}); P.tap(".d-set","set",{sc:"s",focus:".s-skins",cur:""});
       P(200,{}); P.tap(".s-skins span:nth-child(3)","k",{skin:"impressionism"}); P(800,{sc:"d",focus:".d-meta",cur:""});
     })}},
    {k:"O",art:"l’",rest:"maggio",gloss:{zh:"敬意",en:"homage"},
     cap:{zh:[{s:[["点「完成」"]]},{s:[["存进相册，或直接发成笔记"]]}],en:[{s:[["Tap Done"]]},{s:[["save to Photos, or post it as a note"]]}]},
     script:function(l){return pmScript({sc:"d",it:true,typed:"GIOCO",cell:4,fill:5,center:true,skin:"impressionism",focus:".pbar"},function(P){
       // 关键操作：完成 → 保存到相册 → 发布笔记
       P(300,{}); P.tap(".d-finbtn","finish",{sheet:"fin",focus:".sh-fin",cur:""});
       P(350,{fin:1}); P(200,{fin:2}); P(200,{fin:3}); P(200,{fin:4}); P(200,{fin:5});
       P(300,{}); P.tap(".f-save","save",{stat:"saved"}); P(450,{}); P.tap(".f-post","post",null);
     })}}
  ];
  // 关卡：子部分显示完后停住，等来一下新的、往下的滑动才继续（spy 里放行）。与部分之间的缓冲是同一个道理
  var pendingGate=null;
  function subGate(ok,fn){var t=Date.now();pendingGate={gid:(t-lastEvt<200)?gid:-1,t:t,ok:ok,fn:fn}}
  // 子页面机制：一个部分里若干个子页面在同一处轮流出现。第 4 部分（RASGO）与第 5 部分（GIOCO）各建一份
  function mkSub(rg,RG){
  var Q=function(x){return rg.querySelector(x)}, rgFig=Q(".rg-fig"), rgArt=Q(".rg-art"), rgK=Q(".rg-word b"), rgRest=Q(".rg-rest"), rgBar=Q(".rg-bar"), rgGloss=Q(".rg-gloss"), rgCap=Q(".rg-cap"),
      rgStrip=Q(".rg-strip"), rgHead=Q(".rg-head"), rgTok=0, rgDone=null, rgOk=function(){return true};
  // o.cur：现在是第几个子页面；navGid / navT：上一次换子页面是在哪一下滑动、什么时候；ups：连着往上滑了几下。seq：演示界面的脚本（有的话）
  var o={cur:-1,navGid:-1,navT:0,ups:0,upGid:-1,root:rg}, seq=null;
  // 把第 k 个子部分的内容备好。full 为真时直接是显示完的样子；否则词先空着，等轮到它时才逐字打出，
  // 释义与配文也先藏着——不然换子部分的那一瞬会先闪出整句话
  function rgFill(k,full){
    var d=RG[k], lang=root.getAttribute("data-lang")||"zh", lines=d.cap[lang]||[], j, a, c, ln, sg, ch, ps;
    rg.setAttribute("data-k",d.k);
    rgFig.classList.toggle("now",!!full); seq=null;
    if(d.script){
      // 演示界面：把脚本里每一步之后的完整状态先算好，入场顺着画，退场倒着画
      var sc=d.script(lang), st=[], cur={}, x, nx;
      for(x in PS0) cur[x]=PS0[x]; for(x in sc.start) cur[x]=sc.start[x]; st.push(cur);
      for(j=0;j<sc.steps.length;j++){nx={};for(x in cur)nx[x]=cur[x];for(x in sc.steps[j][1])nx[x]=sc.steps[j][1][x];st.push(nx);cur=nx}
      seq={t:sc.steps.map(function(z){return z[0]}),st:st,i:full?st.length-1:0};
      rgFig.innerHTML=pmHTML(lang); pmRender(rgFig,st[seq.i]);
    }else{
      rgFig.innerHTML=d.fig;
      if(full){ps=rgFig.querySelectorAll("[data-s]");for(j=0;j<ps.length;j++)ps[j].classList.add("v")}
    }
    rgArt.textContent=full?d.art:""; rgK.textContent=full?d.k:""; rgRest.textContent=full?d.rest:"";
    rgBar.classList.toggle("in",!!full); rgGloss.classList.toggle("in",!!full); rgGloss.textContent=d.gloss[lang]||"";
    rgCap.textContent="";
    for(j=0;j<lines.length;j++){
      ln=document.createElement("span"); ln.className="ln"+(lines[j].c?" "+lines[j].c:""); var fade=lines[j].c==="xs";
      if(fade&&full) ln.classList.add("v");
      for(a=0;a<lines[j].s.length;a++){
        sg=lines[j].s[a];
        for(c=0;c<sg[0].length;c++){ch=document.createElement("i");ch.textContent=sg[0].charAt(c);ch.className=(sg[1]||"")+((full||fade)?" v":"")+(fade?" k":"");ln.appendChild(ch)}
      }
      rgCap.appendChild(ln);
    }
    for(j=0;j<rgStrip.children.length;j++){rgStrip.children[j].classList.toggle("on",j===k);rgHead.children[j].classList.toggle("on",j===k)}
    capFit();
    o.cur=k; rg.classList.remove("out"); rgFig.classList.add("in");
  }
  // 配文每一句都留在一行里：只有会换行的那句才缩字号，缩到刚好排进一行为止。
  function capFit(){
    var ls=rgCap.querySelectorAll(".ln"), W=rgCap.clientWidth, j, el, fs, n, prev=1;
    if(!W) return;
    for(j=0;j<ls.length;j++){
      el=ls[j]; el.style.fontSize=""; el.style.whiteSpace="nowrap";
      if(el.scrollWidth<=W){el.style.whiteSpace="";prev=1;continue}
      fs=parseFloat(getComputedStyle(el).fontSize); n=Math.floor(fs*W/el.scrollWidth*4)/4;
      el.style.fontSize=n+"px";
      while(el.scrollWidth>W&&n>9){n-=0.25;el.style.fontSize=n+"px"}
      // 缩到 9 像素还排不下（G 的署名）：不硬缩成一行，照常换行，
      // 只跟着上一句的缩放比例走，保持它与上一句原有的大小比例（用户 11-23 定）
      if(n<9||el.scrollWidth>W){el.style.whiteSpace="";el.style.fontSize=prev<1?(Math.round(fs*prev*4)/4)+"px":""}
      else prev=n/fs;
    }
  }
  window.addEventListener("resize",capFit);
  window.addEventListener("resize",function(){if(seq)pmRender(rgFig,seq.st[seq.i])});
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(capFit);
  // 配图入场：零件按 data-s 的步数依次出现。返回整段要多久
  function figPlay(k,T){
    var ps=rgFig.querySelectorAll("[data-s]"), g=RG[k].gap, mx=0, j;
    if(seq){var q=seq;for(j=0;j<q.t.length;j++)(function(n){T(q.t[n],function(){if(seq===q){q.i=n+1;pmRender(rgFig,q.st[n+1])}})})(j);return (q.t[q.t.length-1]||0)+500}
    for(j=0;j<ps.length;j++)(function(el){var n=+el.getAttribute("data-s");if(n>mx)mx=n;T(n*g,function(){el.classList.add("v")})})(ps[j]);
    return mx*g+500;
  }
  // 脚本化的配图（第 5 部分的演示界面）照真实时间自己循环播：播完停 1.6 秒，淡一下回到开头，再来。不等滚动，也不拦滚动（用户 11-23 定）
  function figLoop(tok){
    var q=seq; if(!q) return;
    var live=function(){return tok===rgTok&&seq===q&&rgOk()};
    (function round(){
      var j, end=q.t[q.t.length-1]||0;
      for(j=0;j<q.t.length;j++)(function(n){setTimeout(function(){if(live()){q.i=n+1;pmRender(rgFig,q.st[n+1])}},q.t[n])})(j);
      setTimeout(function(){
        if(!live())return;
        rgFig.classList.add("rew");
        setTimeout(function(){
          if(!live()){rgFig.classList.remove("rew");return}
          q.i=0; pmRender(rgFig,q.st[0]); rgFig.classList.remove("rew");
          setTimeout(function(){if(live())round()},600);
        },260);
      },end+1600);
    })();
  }
  // 配图退场：入场的快速倒放（最后出现的最先撤）；A 的三张卡则向右滑出
  function figBack(k,T){
    var ps=rgFig.querySelectorAll("[data-s]"), right=RG[k].exit==="right", mx=0, j;
    rgFig.classList.remove("now","rew");
    if(seq){var q=seq,n=q.i,gg=Math.min(70,900/Math.max(n,1));for(j=0;j<n;j++)(function(a){T((a+1)*gg,function(){if(seq===q){q.i=n-1-a;pmRender(rgFig,q.st[q.i])}})})(j);return n*gg+320}
    for(j=0;j<ps.length;j++) mx=Math.max(mx,+ps[j].getAttribute("data-s"));
    for(j=0;j<ps.length;j++)(function(el){var n=+el.getAttribute("data-s");T(right?n*70:(mx-n)*70,function(){if(right)el.classList.add("gone");else el.classList.remove("v")})})(ps[j]);
    return mx*70+320;
  }
  // 配文逐字打出；整行淡入的那种行（xs）等前面打完再淡入
  function capType(T,done){
    var cs=rgCap.querySelectorAll("i:not(.k)"), n=cs.length, g=Math.max(12,Math.min(38,1600/Math.max(n,1))), j;
    for(j=0;j<n;j++)(function(el,t){T(t,function(){el.classList.add("v")})})(cs[j],j*g);
    T(n*g+120,function(){var f=rgCap.querySelectorAll(".ln.xs");for(var q=0;q<f.length;q++)f[q].classList.add("v");T(f.length?450:200,done)});
  }
  // 配文退场：从最后一个字往回删，比打出来快得多
  function capBack(T){
    var cs=rgCap.querySelectorAll("i.v:not(.k)"), n=cs.length, g=Math.min(10,300/Math.max(n,1)), j, f=rgCap.querySelectorAll(".ln.xs");
    for(j=0;j<f.length;j++) f[j].classList.remove("v");
    for(j=0;j<n;j++)(function(el,t){T(t,function(){el.classList.remove("v")})})(cs[n-1-j],j*g);
    return n*g+60;
  }
  function rgNext(k,tok){
    var live=function(){return tok===rgTok&&rgOk()};
    if(k>=RG.length-1){if(rgDone){var d=rgDone;rgDone=null;d()}return}
    subGate(live,function(){rgGo(k+1)});
  }
  // 换到第 k 个子部分：当前的先淡出，再让第 k 个入场。往后（关卡放行）与往回（上滑）都走这里
  function rgGo(k){
    // 退场照真实时间走（不跟滚动加速），不然滑得快时倒放还没播完就被下一个子部分顶掉
    var tok=++rgTok, T=function(ms,fn){setTimeout(function(){if(tok===rgTok&&rgOk())fn()},ms)}, D; pendingGate=null; o.navGid=gid; o.navT=Date.now();
    if(k<o.cur){ready=false; rgDone=setReady}   // 往回走：这一部分又没显示完了，要重新走到 O 才放行下一部分
    if(o.cur<0){rg.classList.add("out");T(320,function(){rgStep(k,tok)});return}
    // 先退场：配文往回删、配图倒放；都完了其余的（词、释义）淡出，再让第 k 个入场
    D=Math.max(capBack(T),figBack(o.cur,T));
    T(D,function(){rg.classList.add("out")});
    T(D+280,function(){rgStep(k,tok)});
  }
  // 一个子部分入场：配图的动画先起 → 词逐字打出 → 短横与释义 → 配文逐字打出
  function rgStep(k,tok){
    var live=function(){return tok===rgTok&&rgOk()}, T=function(ms,fn){later(function(){if(live())fn()},ms)}, d=RG[k];
    rgFill(k,false);
    T(200,function(){
      // 自己循环播的配图（第 5 部分的演示界面）：照真实时间自己播，关卡不等它播完；
      // 但词、释义、配文是这一页的内容，要等它们打完才开关卡（11-23 改：之前这一页一露出来就开，滑着看时配文一个字都没打出来就被翻走）
      var loop=!!seq, fd=loop?700:figPlay(k,T);
      if(loop) figLoop(tok);
      T(Math.min(fd,700),function(){
        rgArt.textContent=d.art; rgK.textContent=d.k; rgRest.textContent=d.rest;
        typeEls([rgArt,rgK,rgRest],60,function(){
          rgBar.classList.add("in");
          T(150,function(){
            rgGloss.classList.add("in");
            T(250,function(){capType(T,function(){T(Math.max(0,fd-2200),function(){rgNext(k,tok)})})});
          });
        },live);
      });
    });
  }
  function rgHide(){rg.classList.remove("live");rg.classList.add("out");rgFig.classList.remove("in");o.cur=-1;for(var j=0;j<rgStrip.children.length;j++){rgStrip.children[j].classList.remove("on");rgHead.children[j].classList.remove("on")}}
  function rgReset(){o.ups=0;rgTok++;pendingGate=null;rgDone=null;rgHide();for(var j=0;j<rgHead.children.length;j++)rgHead.children[j].classList.add("hid")}
  function rgFinal(){rgTok++;pendingGate=null;rgDone=null;for(var j=0;j<rgHead.children.length;j++)rgHead.children[j].classList.remove("hid");rg.classList.add("live");rgFill(0,true)}
  // 过场：标题「Rasgo」的五个字母一个接一个飞到卡片顶上的标题位，落定约 1 秒后界面（顶线、R 的子部分、底下的字母条）才出现
  function rgRun(ok,done){
    var tok=++rgTok; rgOk=ok; rgDone=done;
    magic(label.querySelectorAll(".w span"),rgHead.children,110,true);
    setTimeout(function(){
      if(tok!==rgTok||!ok()) return;
      for(var j=0;j<rgHead.children.length;j++)rgHead.children[j].classList.remove("hid");
      setTimeout(function(){if(tok===rgTok)clearFly()},300);
      later(function(){if(tok!==rgTok||!ok())return;rg.classList.add("live");rgStep(0,tok)},1000);
    },Math.max(0,flyEnd-Date.now())+20);
  }
  // 点字母条上的字母，直接看那个子部分（减弱动态效果下只能这样换）
  function rgPick(k){
    if(k<0||!rg.classList.contains("live")) return;
    var tok=++rgTok; pendingGate=null; rgFill(k,true); rgNext(k,tok);
  }
  rgStrip.addEventListener("click",function(e){rgPick([].indexOf.call(rgStrip.children,e.target))});
  rgStrip.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();rgPick([].indexOf.call(rgStrip.children,e.target))}});
  [].forEach.call(rgStrip.children,function(el,j){el.setAttribute("tabindex","0");el.setAttribute("role","button");el.setAttribute("aria-label",RG[j].art+RG[j].k+RG[j].rest)});
  o.reset=rgReset; o.run=rgRun; o.final=rgFinal; o.go=rgGo;
  return o;
  }

  // ── 第 6、7 部分。内容按当前语言现搭，文案逐字打出；离场时倒着收回 ──
  // 小红书小工具那一项直接跳到 G5 的首发笔记（用户 11-23 定，11-24 笔记发出后补上）。地址里的 xsec_token 不能删，去掉会跳 404；
  // 这个地址要与 scripts/build-site.mjs 的外站名单逐字相同，否则整站构建会被拦下
  var IO=[
    {ic:"gh",plain:1,href:"https://github.com/bydpass/backronym",name:{zh:"GitHub",en:"GitHub"},ln:[{zh:"源代码都在这里",en:"All the source is here"},{zh:"可以拿去自己部署",en:"Take it and host your own"}]},
    {ic:"bk",href:"https://www.xiaohongshu.com/discovery/item/6b060b4c000000001803898d?source=webshare&xhsshare=pc_web&xsec_token=AB_a6etllfjkD-BT7Grq9n69djZfqhKfgyQbqA_P-l5gc=&xsec_source=pc_share",name:{zh:"小红书小工具",en:"Xiaohongshu"},ln:[{zh:"在小红书里用",en:"Use it inside the app"},{zh:"存相册，或直接发成笔记",en:"Save to album, or post as a note"}]},
    {ic:"gk",href:"https://www.xiaohongshu.com/user/profile/668f26660000000003033541",name:{zh:"关注作者",en:"Follow the author"},ln:[{zh:"小红书 @beyondpassenger",en:"Xiaohongshu @beyondpassenger"},{zh:"新作与更新都发在这里",en:"New work and updates land here"}]}
  ];
  var LX=[
    {w:{zh:"配文与配图",en:"Caption and picture"},c:{zh:"你写的、你放的，归你",en:"Written and placed by you: yours"}},
    {w:{zh:"版式",en:"Layout"},c:{zh:"CC BY 4.0，署名即可商用",en:"CC BY 4.0, commercial use with credit"}},
    {w:{zh:"释义",en:"Gloss"},c:{zh:"取自词库：五门西文 CC BY-SA 4.0，英语 MIT",en:"From the lexicons: CC BY-SA 4.0 (five languages), MIT (English)"}},
    {w:{zh:"字体",en:"Typefaces"},c:{zh:"OFL 1.1",en:"OFL 1.1"}},
    {w:{zh:"做出这张卡的程序",en:"The program behind the card"},c:{zh:"GPL 3.0 or later",en:"GPL 3.0 or later"}}
  ];
  var LXF=[{zh:"许可全文与各家出处，见网页版的「借物与版权」",en:"Full texts and sources: the web version’s credits page"},{zh:"github.com/bydpass/backronym",en:"github.com/bydpass/backronym",href:"https://github.com/bydpass/backronym"}];
  var ioEl=document.getElementById("io"), lcEl=document.getElementById("lc"), ioTok=0;
  function curLang(){return root.getAttribute("data-lang")||"zh"}
  function lnHTML(x,l,full,cls){return (x.href?'<a target="_blank" rel="noopener" href="'+x.href+'"':'<span')+' class="ln'+(cls?" "+cls:"")+'" data-t="'+x[l]+'">'+(full?x[l]:"")+(x.href?"</a>":"</span>")}
  function tyIn(el,ok,done){
    var t=el.getAttribute("data-t"), g=Math.min(45,380/t.length), j;
    el.textContent="";
    for(j=1;j<=t.length;j++)(function(n){later(function(){if(ok())el.textContent=t.slice(0,n)},n*g)})(j);
    later(function(){if(ok()&&done)done()},t.length*g+60);
  }
  // 离场走真实时间（同第 4 部分）：六步、约 0.27 秒把字收完
  function tyOut(box){
    var els=box.querySelectorAll(".ln"), st=0, id=setInterval(function(){
      st++; for(var k=0;k<els.length;k++){var t=els[k].textContent;els[k].textContent=st>=6?"":t.slice(0,Math.floor(t.length*(1-1/(7-st))))}
      if(st>=6)clearInterval(id);
    },45);
    var on=box.querySelectorAll(".in"); for(var k=0;k<on.length;k++)on[k].classList.remove("in");
  }

  // GitHub 标志：先把标志画进一张小格子图，每格取覆盖多少；再按格子写字符，字符的浓淡跟着一圈圈往外的波纹变
  var GHP="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";
  function ghStart(cv,ok){
    var cols=30, rows=17, ss=4, m=[], x, y, i, j, a;
    var oc=document.createElement("canvas"); oc.width=cols*ss; oc.height=rows*ss;
    var o=oc.getContext("2d"); o.setTransform(cols*ss/16*.8,0,0,rows*ss/16*.8,cols*ss*.1,rows*ss*.1); o.fill(new Path2D(GHP));
    var d=o.getImageData(0,0,cols*ss,rows*ss).data;
    for(y=0;y<rows;y++)for(x=0;x<cols;x++){a=0;for(j=0;j<ss;j++)for(i=0;i<ss;i++)a+=d[((y*ss+j)*cols*ss+x*ss+i)*4+3];m.push(a/(255*ss*ss))}
    var dpr=Math.min(window.devicePixelRatio||1,3), W=cv.clientWidth||110, H=cv.clientHeight||110;
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
    var c=cv.getContext("2d"), cw=cv.width/cols, ch=cv.height/rows, RAMP=" .:-=+*#%@", t=0;
    c.font=Math.round(ch*1.02)+"px ui-monospace,Menlo,Consolas,monospace"; c.textAlign="center"; c.textBaseline="middle";
    c.fillStyle=getComputedStyle(root).getPropertyValue("--ink").trim()||"#222";
    function draw(){
      c.clearRect(0,0,cv.width,cv.height);
      for(y=0;y<rows;y++)for(x=0;x<cols;x++){
        var nx=(x+.5)/cols-.5, ny=(y+.5)/rows-.5, r=Math.sqrt(nx*nx+ny*ny)*2, w=Math.sin(r*10-t*3), v=m[y*cols+x], ch1, al;
        if(v>.1){ch1=RAMP.charAt(Math.max(1,Math.min(9,Math.round(v*9*(.66+.34*w)))));al=.45+.55*v}
        else if(w>.8&&r<1.25){ch1=r<.95?":":".";al=Math.max(0,1.3-r)*.45}
        else continue;
        c.globalAlpha=al; c.fillText(ch1,(x+.5)*cw,(y+.5)*ch);
      }
    }
    draw(); if(calm) return;
    var id=setInterval(function(){if(!ok()){clearInterval(id);return}t+=.09;draw()},90);
  }

  // 红皮书：六张书页（封面、四张内页、封底），每张两面。翻页是绕书脊转半圈；翻个面是整本绕书脊转半圈，转完悄悄复位
  function pgSVG(n,left){
    var eng=n%3===1, d="", c, y, x0;
    for(c=0;c<2;c++)for(y=eng?43:15;y<86;y+=3.4){x0=7+c*28.5;d+="M"+x0+" "+y.toFixed(1)+"h"+(25.5-((Math.round(y*7)+n*13+c*5)%9===0?9:0))}
    return '<svg viewBox="0 0 68 92" preserveAspectRatio="none"><rect class="cP" width="68" height="92"/><text class="tK" x="34" y="8" text-anchor="middle" font-size="3.4" letter-spacing=".5">THE RED BOOK</text><path class="sK" stroke-width=".4" d="M6 10.5H62"/>'+
      (eng?'<rect class="sK" stroke-width=".5" x="7" y="14" width="54" height="24"/><path class="sK" stroke-width=".35" d="M7 34Q20 22 30 30T48 24T61 30M12 19h6M40 18h10"/>':"")+
      '<path class="sK" stroke-width=".45" d="'+d+'"/><text class="tK" x="'+(left?8:60)+'" y="90.5" text-anchor="'+(left?"start":"end")+'" font-size="3">'+n+"</text></svg>";
  }
  var BKC='<svg viewBox="0 0 68 92" preserveAspectRatio="none"><rect class="cR" width="68" height="92"/><rect class="sC" stroke-width=".9" x="4" y="4" width="60" height="84"/><rect class="sC" stroke-width=".35" x="6.2" y="6.2" width="55.6" height="79.6"/><text class="tC" x="34" y="20" text-anchor="middle" font-size="5.6" letter-spacing="1.1">THE RED</text><text class="tC" x="34" y="31" text-anchor="middle" font-size="10" letter-spacing="1.4">BOOK</text><path class="sC" stroke-width=".5" d="M13 35.5H55M17 37.3H51"/><ellipse class="sC" stroke-width=".6" cx="34" cy="55" rx="12.5" ry="13.5"/><circle class="sC" stroke-width=".6" cx="34" cy="55" r="3.6"/><path class="sC" stroke-width=".5" d="M34 46.5v3M34 60.5v3M25.5 55h3M39.5 55h3M28 49l2.1 2.1M37.9 58.9L40 61M40 49l-2.1 2.1M30.1 58.9L28 61"/><text class="tC" x="34" y="76.5" text-anchor="middle" font-size="3.3" letter-spacing=".5">A MONTHLY MAGAZINE</text><text class="tC" x="34" y="82.5" text-anchor="middle" font-size="3" letter-spacing=".4">VOL. I · MDCCCLXXXVIII</text></svg>';
  var BKB='<svg viewBox="0 0 68 92" preserveAspectRatio="none"><rect class="cR" width="68" height="92"/><rect class="sC" stroke-width=".9" x="4" y="4" width="60" height="84"/><rect class="sC" stroke-width=".35" x="6.2" y="6.2" width="55.6" height="79.6"/><path class="sC" stroke-width=".6" d="M34 39l5 7-5 7-5-7z"/><text class="tC" x="34" y="80" text-anchor="middle" font-size="3" letter-spacing=".5">PRICE SIXPENCE</text></svg>';
  var BKE='<svg viewBox="0 0 68 92" preserveAspectRatio="none"><rect class="cP" width="68" height="92"/><rect class="sK" stroke-width=".4" x="5" y="5" width="58" height="82"/><text class="tK" x="34" y="48" text-anchor="middle" font-size="3.6" letter-spacing=".8">EX LIBRIS</text></svg>';
  function bkHTML(){
    var F=[[BKC,BKE],[pgSVG(1),pgSVG(2,1)],[pgSVG(3),pgSVG(4,1)],[pgSVG(5),pgSVG(6,1)],[pgSVG(7),pgSVG(8,1)],[BKE,BKB]], h='<div class="bkw"><div class="bk">', k;
    for(k=0;k<F.length;k++)h+='<div class="lf" style="transform:rotateY(0deg) translateZ('+((F.length-k)*1.5)+'px)"><div class="f a">'+F[k][0]+'</div><div class="f b">'+F[k][1]+"</div></div>";
    return h+"</div></div>";
  }
  function bkStart(box,ok){
    var w=box.querySelector(".bkw"), bk=box.querySelector(".bk"), lf=bk.children, N=lf.length;
    function set(i,fl){lf[i].style.transform=fl?"rotateY(-180deg) translateZ(-"+((i+1)*1.5)+"px)":"rotateY(0deg) translateZ("+((N-i)*1.5)+"px)"}
    function at(ms,fn){setTimeout(function(){if(ok())fn()},ms)}
    (function cycle(){
      if(!ok())return;
      var t=800, i;
      at(t,function(){set(0,true);w.style.transform="translateX(0)"}); t+=1000;      // 翻开封面，书摊到正中
      for(i=1;i<N-1;i++){(function(i){at(t,function(){set(i,true)})})(i); t+=520}       // 一页页翻到底
      t+=300; at(t,function(){set(N-1,true);w.style.transform="translateX(1.35em)"}); t+=1250;   // 合上，封底朝上
      at(t,function(){bk.style.transition="transform .9s cubic-bezier(.5,0,.3,1)";bk.style.transform="rotateY(180deg)";w.style.transform="translateX(-1.35em)"}); t+=960;   // 原地翻个面
      at(t,function(){   // 悄悄复位：样子和翻面之后一模一样
        bk.style.transition="none"; for(i=0;i<N;i++)lf[i].style.transition="none";
        bk.style.transform=""; for(i=0;i<N;i++)set(i,false);
        void bk.offsetWidth; for(i=0;i<N;i++)lf[i].style.transition="";
      }); t+=80;
      setTimeout(cycle,t);
    })();
  }
  // 「过客」：直接出现，停 0.7 到 1.6 秒，直接消失；隔 1 到 3.5 秒再来。不闪、不渐变、不歪（用户 11-23 定）
  function gkStart(el,ok){
    if(calm){el.className="gk on";return}
    (function show(){
      if(!ok())return;
      el.className="gk on";
      setTimeout(function(){
        if(!ok())return;
        el.className="gk";
        setTimeout(show,1000+Math.random()*2500);
      },700+Math.random()*900);
    })();
  }
  function ioStart(){
    var my=++ioTok, ok=function(){return my===ioTok&&parts[5].classList.contains("on")};
    setTimeout(function(){
      if(!ok())return;
      ghStart(ioEl.querySelector(".ic-gh canvas"),ok); bkStart(ioEl.querySelector(".ic-bk"),ok); gkStart(ioEl.querySelector(".gk"),ok);
    },120);
  }
  var ICON={gh:'<canvas aria-hidden="true"></canvas>',bk:"",gk:'<span class="gk" aria-hidden="true">过客</span>'};
  function ioBuild(full){
    var l=curLang(), h="", k, j, d, c;
    ioTok++;
    for(k=0;k<IO.length;k++){
      d=IO[k]; c='class="door'+(full?" in":"")+'"';
      h+=(d.href?'<a '+c+' target="_blank" rel="noopener" href="'+d.href+'">':'<div '+c+'>')+'<div class="ic ic-'+d.ic+'">'+(d.ic==="bk"?bkHTML():ICON[d.ic])+'</div><b'+(d.plain?' class="plain"':"")+'>'+d.name[l]+'</b>';
      for(j=0;j<d.ln.length;j++)h+=lnHTML(d.ln[j],l,full);
      h+=d.href?"</a>":"</div>";
    }
    ioEl.innerHTML=h;
    if(full) ioStart();
  }
  function ioRun(ok,done){
    var ds=ioEl.children, k;
    ioStart();
    for(k=0;k<ds.length;k++)(function(d,k){later(function(){
      if(!ok())return; d.classList.add("in"); var ls=d.querySelectorAll(".ln");
      later(function(){if(ok())tyIn(ls[0],ok,function(){tyIn(ls[1],ok)})},550);
    },k*480)})(ds[k],k);
    later(function(){if(ok())done()},(ds.length-1)*480+550+950);
  }
  // 第 7 部分：一张卡（就是这一页的 L 格）加五个编号。编号落在卡上哪样东西旁边，右边的说明就讲它归谁、按什么许可
  function lcBuild(full){
    var l=curLang(), on=full?" in":"", h, k;
    function mk(n,x){return '<span class="mk'+on+(x||"")+'" data-m="'+n+'" aria-hidden="true">'+n+"</span>"}
    h='<div class="lx-fig'+on+'"><div class="lx-card" data-k="2">'+mk(2," tr")+
      '<div class="lx-h" data-k="4">'+mk(4)+"<b>L</b><em>Licentia</em></div>"+
      '<div class="lx-g" data-k="3">'+mk(3)+"许可</div>"+
      '<div class="lx-ci" data-k="1">'+mk(1)+'<div class="lx-c">'+(l==="zh"?"拿去用吧":"Go on, use it")+'</div><div class="lx-i">'+PIMG+"</div></div></div>"+
      '<div class="lx-tool" data-k="5">'+mk(5)+"<span>藏头 · BACKRONYM</span></div></div>";
    h+='<ol class="lx-leg">';
    for(k=0;k<LX.length;k++)h+='<li class="'+on+'"><span class="n">'+(k+1)+"</span><span>"+lnHTML(LX[k].w,l,full)+lnHTML(LX[k].c,l,full,"lic")+"</span></li>";
    lcEl.innerHTML=h+'</ol><p class="lx-foot">'+lnHTML(LXF[0],l,full)+lnHTML(LXF[1],l,full)+"</p>";
  }
  function lcRun(ok,done){
    var lis=lcEl.querySelectorAll(".lx-leg li"), foot=lcEl.querySelectorAll(".lx-foot .ln");
    lcEl.querySelector(".lx-fig").classList.add("in");
    later(function(){(function item(k){
      if(!ok())return;
      if(k>=lis.length){tyIn(foot[0],ok,function(){tyIn(foot[1],ok,function(){if(ok())done()})});return}
      var ls=lis[k].querySelectorAll(".ln"), tg=lcEl.querySelector('[data-k="'+(k+1)+'"]');
      lis[k].classList.add("in"); lcEl.querySelector('.mk[data-m="'+(k+1)+'"]').classList.add("in"); tg.classList.add("hi");
      later(function(){tg.classList.remove("hi")},850);
      tyIn(ls[0],ok,function(){tyIn(ls[1],ok,function(){later(function(){item(k+1)},120)})});
    })(0)},500);
  }
  // ── 结束页（用户 11-23 定）：字母飞回中央拼成大词 → 大词逐字退场 → 停 1 秒 → 中文与五门现代西文依次打出，拉丁语一句小字垫底 → 「开始吧」 ──
  // 每句三段：前半、连词、后半。连词那一格居中，所以它落在屏幕的正中轴上。英语、德语用 &，罗曼语用各自的连词
  var FINL=[["zh","产出愉快","，","祝好胃口"],["","Enjoy Creation","&","bon appétit"],["","Bonne création","et","bon appétit"],["","Frohes Schaffen","&","guten Appetit"],["","Feliz creación","y","buen provecho"],["","Buona creazione","e","buon appetito"],["","Fac","et","fruere"]];
  var finEl=document.getElementById("fin"), finTok=0;
  function finBuild(full){
    var h="", k, j, p, cls=["l","c","r"];
    for(k=0;k<FINL.length;k++){
      h+='<div class="fl '+FINL[k][0]+'">';
      for(p=1;p<=3;p++){h+='<span class="'+cls[p-1]+'">';for(j=0;j<FINL[k][p].length;j++)h+='<i'+(full?' class="v"':"")+'>'+FINL[k][p].charAt(j)+"</i>";h+="</span>"}
      h+="</div>";
    }
    var l=curLang(), ch=function(t){var o="",j;for(j=0;j<t.length;j++)o+="<i"+(full?' class="v"':"")+">"+htmlText(t.charAt(j))+"</i>";return o};
    finEl.innerHTML=h+'<p class="fgo"><a href="./app/">'+ch(l==="zh"?"开始试用Backronym":"Try Backronym")+'</a></p><p class="fgo re"><button type="button" id="fin-re">'+ch(l==="zh"?"再看一遍":"See it again")+"</button></p>"+
      '<p class="ffoot">'+(version?"<span>"+ch(version)+"</span>":"")+"<span>"+
      ch(l==="zh"?"本工具不提供任何担保，详见 GPL 第 15、16 条":"No warranty; see GPL sections 15 and 16")+"</span>"+
      (icp?'<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">'+ch(icp)+"</a>":"")+"</p>";
  }
  function finHide(){finTok++;finEl.classList.remove("on");for(var k=0;k<letters.length;k++)letters[k].classList.remove("typed-out")}
  function flip(first,ms){
    for(var k=0;k<letters.length;k++){
      var b=letters[k].getBoundingClientRect(), el=letters[k];
      el.style.transition="none"; el.style.transformOrigin="0 0";
      el.style.transform="translate("+(first[k].left-b.left)+"px,"+(first[k].top-b.top)+"px) scale("+(first[k].height/b.height)+")";
    }
    void word.offsetWidth;
    for(k=0;k<letters.length;k++){letters[k].style.transition="transform "+ms+"ms cubic-bezier(.6,0,.2,1),color .6s ease";letters[k].style.transform=""}
    setTimeout(function(){for(var j=0;j<letters.length;j++)letters[j].style.transition=""},ms+70);
  }
  function finEnter(instant){
    var my=++finTok, k, p, first=[], quick=instant||calm;
    seq++; cancel(swapTimer); pendingGate=null; clearFly();
    for(p=0;p<parts.length;p++){
      if(parts[p].classList.contains("on")&&!quick){leave(parts[p]);if(STAGE[p]&&STAGE[p].out)STAGE[p].out()}
      parts[p].classList.remove("on","hold","all");
    }
    label.classList.remove("in"); gate.classList.remove("in");
    for(k=0;k<letters.length;k++){letters[k].classList.remove("on");first.push(letters[k].getBoundingClientRect())}
    active=FIN; ready=true; auto=false; hyb=true; pend=0; lastChange=Date.now();   // 结束页：真实时间 + 下滑加速（同第 5 部分）
    stage.classList.remove("rail"); stage.classList.add("fin","last");
    finBuild(quick);
    if(quick){for(k=0;k<letters.length;k++)letters[k].classList.add("typed-out");finEl.classList.add("on");return}
    flip(first,650);
    var ok=function(){return my===finTok};
    // 结束页不滑也照真实时间自己播；继续往下滑（滚轮、方向键、手指上推）时最多快到 4 倍（用户 11-23 定：加快一点，也随下滑加速）。
    // 字母飞回中央那一下是固定的 0.65 秒，不加速；之后的都排在虚拟时间上
    setTimeout(function(){
      if(!ok())return;
      for(k=letters.length-1;k>=0;k--)(function(el,d){later(function(){if(ok())el.classList.add("typed-out")},d)})(letters[k],(letters.length-1-k)*55);
      later(function(){
        if(!ok())return;
        finEl.classList.add("on");
        var rows=finEl.querySelectorAll(".fl,.fgo,.ffoot"), end=0;
        for(k=0;k<rows.length;k++)(function(row,k){
          var cs=row.querySelectorAll("i"), t0=row.classList.contains("fl")?k*180:end+250, g=Math.min(40,480/cs.length), j;
          for(j=0;j<cs.length;j++)(function(c,d){later(function(){if(ok())c.classList.add("v")},d)})(cs[j],t0+j*g);
          end=Math.max(end,t0+cs.length*g);
        })(rows[k],k);
      },letters.length*55+600);
    },700);
  }
  // 「再看一遍」：屏上的字从最后一个起逐个收回，然后回到首屏，照第一次来时那样重打一遍
  function finRestart(){
    var my=++finTok, cs=finEl.querySelectorAll("i.v"), n=cs.length, g=Math.min(14,800/Math.max(n,1)), k;
    if(calm){toHero();return}
    for(k=n-1;k>=0;k--)(function(c,d){setTimeout(function(){c.classList.remove("v")},d)})(cs[k],(n-1-k)*g);
    setTimeout(function(){if(my===finTok)toHero()},n*g+400);
  }
  function toHero(){
    var k, hint=gate.querySelector(".hint"), quick=document.getElementById("quick");
    finHide(); seq++; cancel(swapTimer);
    stage.classList.remove("fin","last","rail"); root.classList.remove("railed"); root.classList.add("locked"); root.removeAttribute("data-lang");
    for(k=0;k<letters.length;k++){letters[k].classList.remove("shown","on","typed-out");letters[k].removeAttribute("tabindex");letters[k].removeAttribute("role");letters[k].removeAttribute("aria-label")}
    label.classList.remove("in"); gate.classList.remove("in"); hint.classList.remove("in"); quick.classList.remove("in");
    active=-1; ready=true; auto=true; pend=0; lastY=0; put("buergil-y","0");
    window.scrollTo(0,0);
    intro();
  }
  finEl.addEventListener("click",function(e){if(e.target.closest("#fin-re"))finRestart()});
  // 往回滑：祝语收起，字母从中央飞回侧栏，接着照常进第 7 部分
  function finLeave(){
    var first=[], k;
    for(k=0;k<letters.length;k++) first.push(letters[k].getBoundingClientRect());
    finHide();
    stage.classList.remove("fin","last"); stage.classList.add("rail");
    if(!calm){flip(first,650);flipUntil=Date.now()+660}
    active=-1;
  }
  var STAGE={1:{reset:simReset,run:simRun,final:simFinal},2:{reset:cardReset,run:cardRun,final:cardFinal},3:null,4:null,
    5:{reset:function(){ioBuild(false)},run:ioRun,final:function(){ioBuild(true)},out:function(){ioTok++;tyOut(ioEl)}},
    6:{reset:function(){lcBuild(false)},run:lcRun,final:function(){lcBuild(true)},out:function(){tyOut(lcEl)}}};
  var SUB={3:mkSub(document.getElementById("rg"),RG),4:mkSub(document.getElementById("gc"),GC)};
  STAGE[3]=SUB[3]; STAGE[4]=SUB[4];
  SUB[4].auto=true;   // 第 5 部分不滑也照真实时间自己播；滑的时候文字再加速（见 frame 里的 hyb）
  simReset(); cardReset(); SUB[3].reset(); SUB[4].reset(); ioBuild(false); lcBuild(false);

  // 离场：让小句在约 0.35 秒内依次消失（句子多就排得密一些），然后撤掉离场状态
  function leave(part){
    var n=0, segs=part.querySelectorAll(".seg");
    for(var k=0;k<segs.length;k++) if(segs[k].offsetParent!==null) n++;
    part.style.setProperty("--od",Math.min(30,350/Math.max(n,1))/rate+"ms");
    part.classList.add("leaving");
    setTimeout(function(){part.classList.remove("leaving")},700/rate);
  }
  // ready：当前部分的内容是否已经全部显示完。没显示完之前不放行下一部分（见 spy）
  var ready=true;
  // 缓冲：一个部分显示完之后，还要等这一下滑动停住（约 0.2 秒没有新的滚动）才放行下一部分，
  // 免得滑得快时刚显示完就被同一下滑动带到再下一个部分。gid 给每一下滑动编号
  var gid=0, lastEvt=0, readyGid=-1, readyAt=0;
  // keyHeld：正按着方向键 / 翻页键 / 空格滚动。按着不放时，关卡停够 0.7 秒就放行（不必松手再按），播放最多 4 倍（用户 11-23 定）
  var keyHeld=false;
  // 持续下滑：鼠标滚轮不停地滚，和按住方向键是一回事——一直有滚动、中间没有停顿，所以等不来「新的一下」。
  // 不认设备，只看滚动本身：往下滚已经连着 0.7 秒以上（中间的空当不到 0.6 秒），而且最近 0.4 秒滚的量不低于这一程里最多时的一半。
  // 后一条把触控板的惯性挡在外面：惯性是越滚越慢的，所以一下大滑仍然最多过一个关卡。
  // runT：这一程从什么时候开始；lastDn：上一次往下滚的时刻；dnWin：最近 0.4 秒里每次往下滚了多少；holdT：上一次判为「持续下滑」的时刻
  var runT=0, lastDn=0, dnWin=[], dnPeak=0, holdT=-1e9;
  function held(){return keyHeld||Date.now()-holdT<600}
  window.addEventListener("keydown",function(e){if(/^(ArrowDown|ArrowUp|PageDown|PageUp| |Spacebar|Home|End)$/.test(e.key))keyHeld=true});
  window.addEventListener("keyup",function(){keyHeld=false});
  window.addEventListener("blur",function(){keyHeld=false});
  function setReady(){ready=true;readyAt=Date.now();readyGid=(readyAt-lastEvt<200)?gid:-1}
  // 逐句放出：看得见、还没放出、且被 pick 选中的小句，每隔 60 毫秒（虚拟时间）放出一句；放完叫 done
  function reveal(i,ok,pick,done){
    var segs=parts[i].querySelectorAll(".seg"), n=0, k;
    for(k=0;k<segs.length;k++){
      if(segs[k].offsetParent===null||segs[k].classList.contains("v")||(pick&&!pick(segs[k]))) continue;
      (function(el,d){later(function(){if(ok())el.classList.add("v")},d)})(segs[k],n*60); n++;
    }
    later(function(){if(ok()&&done)done()},Math.max(n-1,0)*60+300);
  }
  function early(el){return el.classList.contains("num")||!!el.closest(".lead")}
  // 一个部分出场：内容先收起 → 标题逐字打出 → 打完才放内容。被新的出场打断时，旧的那一轮作废
  function enter(i,delay){
    var my=++seq, p;
    cancel(swapTimer);
    for(p=0;p<parts.length;p++){
      if(p!==i&&parts[p].classList.contains("on")&&!calm){leave(parts[p]);if(STAGE[p]&&STAGE[p].out)STAGE[p].out()}
      parts[p].classList.remove("on","hold");
    }
    parts[i].classList.remove("leaving");
    if(calm){ready=true;place(i);label.classList.add("in");order(parts[i]);if(STAGE[i])STAGE[i].final();parts[i].classList.add("on","all");return}
    ready=false; parts[i].classList.remove("all");
    var old=parts[i].querySelectorAll(".seg.v"); for(p=0;p<old.length;p++) old[p].classList.remove("v");
    label.classList.remove("in");
    swapTimer=later(function(){
      place(i);
      if(!isRail()){label.classList.add("in");ready=true;return}
      label.style.transition="none"; label.classList.add("in"); void label.offsetWidth; label.style.transition="";
      var ok=function(){return my===seq}, sub=label.querySelector(".sub");
      var show=function(){
        order(parts[i]);
        parts[i].classList.add("on");
        var fin=setReady;
        if(!STAGE[i]){reveal(i,ok,null,fin);return}
        // 有过场的部分：节号和标题下那行字先出，其余内容等过场播完。字母还在飞的话，过场等它飞到位再开始
        reveal(i,ok,early);
        var run=function(){if(ok())STAGE[i].run(ok,function(){reveal(i,ok,null,fin)})}, w=flyEnd-Date.now();
        if(w>0) setTimeout(run,w); else run();
      };
      var hold=sub.textContent; sub.textContent="";
      typeEls([label.querySelector(".art"),label.querySelector(".w")],70,function(){
        if(!hold){show();return}
        later(function(){if(!ok())return;sub.textContent=hold;typeEls([sub],90,show,ok)},220);
      },ok);
    },delay);
  }
  function setActive(i,instant){
    if(i===active) return;
    if(i===FIN){finEnter(instant);return}
    if(active===FIN) finLeave();
    var from=active, now=Date.now(), wasReady=ready;
    lastChange=now;
    // 这一部分是用户滑过来的，就由滚动推进；点字母跳转、选完语言落位、还在首屏，照真实时间播
    auto=!!(instant||calm||now<calmUntil||!isRail()); hyb=!auto&&!!(SUB[i]&&SUB[i].auto); pend=0;
    active=i;
    stage.classList.toggle("last",i===letters.length-1);   // 最后一部分没有“继续”，提示收起
    clearFly();
    if(STAGE[i]) STAGE[i].reset();
    if(!calm&&!instant&&isRail()){
      // 第 1 → 第 2 部分：例词的十一个首字母飞成一行
      if(from===0&&i===1&&parts[0].classList.contains("on")) magic(parts[0].querySelectorAll(".eg b"),simWord.children);
    }
    for(var k=0;k<letters.length;k++) letters[k].classList.toggle("on",k===i);
    gate.classList.toggle("in",i===0);
    if(instant){ready=true;seq++;cancel(swapTimer);place(i);label.classList.add("in");if(STAGE[i])STAGE[i].final();for(var p=0;p<parts.length;p++){order(parts[p]);parts[p].classList.toggle("on",p===i);parts[p].classList.toggle("all",p===i)}return}
    enter(i,Math.max(650,flipUntil-Date.now()+40));
  }

  // 横排 ⇄ 竖排：记下每个字母的旧位置，切到新排法，再让它从旧位置滑到新位置
  function setRail(on){
    if(isRail()===on) return;
    var first=[],k;
    for(k=0;k<letters.length;k++) first.push(letters[k].getBoundingClientRect());
    if(stage.classList.contains("fin")){finHide();stage.classList.remove("fin");stage.classList.add("rail")}
    stage.classList.toggle("rail",on); root.classList.toggle("railed",on);
    for(k=0;k<letters.length;k++){
      if(on){letters[k].setAttribute("tabindex","0");letters[k].setAttribute("role","link");letters[k].setAttribute("aria-label",WORDS[k][0]+WORDS[k][1])}
      else{letters[k].removeAttribute("tabindex");letters[k].removeAttribute("role");letters[k].removeAttribute("aria-label")}
    }
    if(!calm){
      for(k=0;k<letters.length;k++){
        var b=letters[k].getBoundingClientRect(), el=letters[k];
        el.style.transition="none"; el.style.transformOrigin="0 0";
        el.style.transform="translate("+(first[k].left-b.left)+"px,"+(first[k].top-b.top)+"px) scale("+(first[k].height/b.height)+")";
      }
      void word.offsetWidth;
      for(k=0;k<letters.length;k++){
        letters[k].style.transition="transform .65s cubic-bezier(.6,0,.2,1),color .6s ease";
        letters[k].style.transform="";
      }
      flipUntil=Date.now()+660;
      setTimeout(function(){for(var j=0;j<letters.length;j++)letters[j].style.transition=""},720);
    }
    if(!on){auto=true;pend=0}
    if(active>=0) enter(active,700);
  }

  function choose(lang,y){
    root.setAttribute("data-lang",lang);
    root.lang=lang==="zh"?"zh-CN":"en";
    document.getElementById("btn-zh").setAttribute("aria-pressed",lang==="zh");
    document.getElementById("btn-en").setAttribute("aria-pressed",lang==="en");
    root.classList.remove("locked");
    put("buergil-lang",lang);
    calmUntil=Date.now()+2500;
    var h=window.innerHeight, top=(y&&y>h*0.25)?y:h;
    window.scrollTo({top:top,behavior:calm?"auto":"smooth"});
    // 平滑滚动在不出画面的标签页里不会走；过一会儿没到位就直接跳过去
    setTimeout(function(){if(Math.abs(window.scrollY-top)>8){window.scrollTo(0,top);spy()}},1400);
  }
  gate.addEventListener("click",function(e){var b=e.target.closest("button[data-set]");if(b)choose(b.getAttribute("data-set"),parseFloat(get("buergil-y"))||0)});

  // 点字母栏的字母：跳到它领的那一部分。滚动只是计数，直接设过去即可，画面上照常离场、打标题、入场
  function go(k){
    if(!isRail()||root.classList.contains("locked")) return;
    calmUntil=Date.now()+600;
    ready=true; readyGid=-1; readyAt=0;   // 点字母是明说要去那里，内容没显示完也放行
    window.scrollTo(0,Math.round(window.innerHeight*(1+CUM[k]*0.8)));
    spy();
  }
  word.addEventListener("click",function(e){var k=[].indexOf.call(letters,e.target);if(k>=0)go(k)});
  word.addEventListener("keydown",function(e){
    if(e.key!=="Enter"&&e.key!==" ") return;
    var k=[].indexOf.call(letters,e.target); if(k>=0){e.preventDefault();go(k)}
  });

  // 滚到哪里算哪个部分：选完语言落在一屏高处，是第一部分；之后每滚一段换一个
  function spy(){
    if(root.classList.contains("locked")) return;
    var y=window.scrollY, h=window.innerHeight, rail=isRail(), t=Date.now();
    if(t-lastEvt>200) gid++; lastEvt=t;
    var lastY0=lastY;
    var moved=Math.abs(y-lastY);
    if(t>lastT){speed=Math.abs(y-lastY)/(t-lastT)} lastY=y; lastT=t;
    if(!rail&&y>h*0.25){setRail(true);rail=true}
    else if(rail&&y<h*0.1){setRail(false);rail=false}
    var seg=h*0.8, cur=0, u=(y-h)/seg+0.5, q;
    if(rail) for(q=0;q<=FIN;q++) if(u>=CUM[q]) cur=q;
    var down=y>lastY0+1, up=y<lastY0-1;   // 在位置被按回之前定方向
    var hold=keyHeld, dnSum=0;
    if(down){
      if(t-lastDn>600){runT=t;dnWin.length=0;dnPeak=0}
      lastDn=t; dnWin.push([t,y-lastY0]);
      while(dnWin[0][0]<t-400) dnWin.shift();
      for(q=0;q<dnWin.length;q++) dnSum+=dnWin[q][1];
      if(dnSum>dnPeak) dnPeak=dnSum;
      if(t-runT>=700&&dnSum>=dnPeak*0.5){hold=true;holdT=t}
    }
    // 当前部分的内容还没显示完，或刚显示完、这一下滑动还没停：不许往后走，把滚动位置按回本部分的范围内（往回滑不拦）
    if(rail&&active>=0&&cur>active&&(!ready||(gid===readyGid&&!(hold&&t-readyAt>700))||t-readyAt<400)){
      y=Math.floor(h+seg*(CUM[active]+SPAN[active]-0.55)); window.scrollTo(0,y); lastY=y; speed=0; cur=active;
    }
    // 第 4 部分里不在第一个子部分时，往回滑先不离开这一部分（下面会退回上一个子部分）
    else if(rail&&SUB[active]&&cur<active&&SUB[active].cur>0&&!calm&&Date.now()>=calmUntil){
      y=Math.ceil(h+seg*(CUM[active]-0.45)); window.scrollTo(0,y); lastY=y; cur=active;
    }
    // 滑动一次最多往后走一个部分（一格滚轮滑得再远也不跳过中间的）；点字母、选完语言落位不受限
    else if(rail&&active>=0&&cur>active+1&&Date.now()>=calmUntil){
      cur=active+1; y=Math.floor(h+seg*CUM[cur]); window.scrollTo(0,y); lastY=y;
    }
    setActive(cur);
    // 子部分之间的关卡：等来一下新的、往下的滑动才放行（见 subGate）；持续下滑时停够 0.7 秒放行
    if(pendingGate&&down&&(gid!==pendingGate.gid||(hold&&t-pendingGate.t>700))&&t-pendingGate.t>400){var g=pendingGate;pendingGate=null;pend=0;if(g.ok())g.fn()}
    // 第 4 部分：数连续上滑的次数，满三下直接退回第 3 部分
    var sb=SUB[active];
    if(rail&&sb&&!calm&&Date.now()>=calmUntil){
      // 往下的「连滚三下去下一部分」已取消（11-23）：鼠标滚轮每拨一下就是一下，正常地一路往下滚也会连着三下，
      // 结果第 4、5 部分的子页面一页没看就被整个跳过。要跳过去点字母栏的字母。往上的三下保留
      if(down&&gid!==sb.upGid){sb.ups=0;sb.upGid=gid}
      else if(up&&gid!==sb.upGid){sb.upGid=gid; if(++sb.ups>=3){sb.ups=0;(function(to){setTimeout(function(){go(to)},0)})(active-1)}}
    }
    // 第 4 部分：一下新的、往上的滑动，退回上一个子部分
    if(rail&&sb&&!calm&&up&&sb.cur>0&&(gid!==sb.navGid||(keyHeld&&t-sb.navT>1500))&&t-sb.navT>400&&sb.root.classList.contains("live")){pend=0;sb.go(sb.cur-1)}
    // 滑了多少，就给虚拟时间添多少（往上往下都算；刚滑进新的部分时，这一下滑的量算给新的部分）
    if(rail&&!auto&&active>=0&&active<FIN) pend=Math.min(pend+moved*EST[active]/(0.6*seg),hyb?1500:12000);
    put("buergil-y",active===FIN?"0":String(Math.round(y)));   // 停在结束页时不记位置：刷新后从头来
  }
  // 结束页已在页面最底，再往下滑不会有滚动事件，所以直接听滚轮、按键与手指：有往下的动作就给结束页的动画加速
  function finBoost(){if(active===FIN&&hyb)pend=1500}
  window.addEventListener("wheel",function(e){if(e.deltaY>0)finBoost()},{passive:true});
  window.addEventListener("keydown",function(e){if(/^(ArrowDown|PageDown| |Spacebar|End)$/.test(e.key))finBoost()});
  (function(){var ty=0;window.addEventListener("touchstart",function(e){ty=e.touches[0].clientY},{passive:true});
    window.addEventListener("touchmove",function(e){var y=e.touches[0].clientY;if(y<ty-2)finBoost();ty=y},{passive:true})})();
  var ticking=false;
  window.addEventListener("scroll",function(){if(!ticking){ticking=true;requestAnimationFrame(function(){ticking=false;spy()})}},{passive:true});
  window.addEventListener("resize",function(){if(active>=0&&label.classList.contains("in"))place(active)});

  // 背景浮词：屏幕上保持 15 到 45 个词，字号 15 到 50px。
  // 节奏：每隔 1 到 3 秒（随机）来一批，每批 1 到 9 个词出现、1 到 9 个词消失。
  // 标准：词在随机位置一边飘移一边逐字打出来，消失时也是逐字删掉；减弱动态效果：原地淡入淡出
  function startWords(){
    var words=[], MIN=15, MAX=45;   // words 里是屏幕上的词，按出现先后排
    function rnd(n){return 1+Math.floor(Math.random()*n)}
    function add(){
      var el=document.createElement("span"), w=POOL[Math.floor(Math.random()*POOL.length)], it={el:el,ready:false};
      el.style.fontSize=(15+Math.random()*35)+"px";
      el.style.left=(Math.random()*86)+"%"; el.style.top=(Math.random()*93)+"%";
      bgw.appendChild(el); words.push(it);
      if(calm){el.textContent=w; void el.offsetWidth; el.classList.add("show"); it.ready=true; return}
      el.style.transition="transform 40s linear";
      el.classList.add("show"); void el.offsetWidth;
      el.style.transform="translate("+(Math.random()*240-120)+"px,"+(Math.random()*140-70)+"px)";
      var n=0, iv=setInterval(function(){el.textContent=w.slice(0,++n); if(n>=w.length){clearInterval(iv);it.ready=true}},70+Math.random()*60);
    }
    function drop(it){
      var el=it.el;
      words.splice(words.indexOf(it),1);
      if(calm){el.classList.remove("show"); setTimeout(function(){el.remove()},2100); return}
      var t=el.textContent, iv=setInterval(function(){t=t.slice(0,-1); el.textContent=t; if(!t){clearInterval(iv);el.remove()}},50+Math.random()*50);
    }
    function batch(){
      if(!document.hidden){
        var out=Math.min(rnd(9),Math.max(0,words.length-MIN)), k, i, c;
        // 消失的优先挑待得久的：从最早出现的那一半里随机挑，只挑已经打完的
        for(k=0;k<out;k++){
          c=[]; for(i=0;i<words.length&&c.length<Math.max(out,Math.ceil(words.length/2));i++) if(words[i].ready) c.push(words[i]);
          if(!c.length) break;
          (function(it){it.ready=false; var d=Math.random()*400; setTimeout(function(){drop(it)},d)})(c[Math.floor(Math.random()*c.length)]);
        }
        var inn=Math.min(rnd(9),MAX-words.length);
        for(k=0;k<inn;k++) setTimeout(add,Math.random()*400);
        while(words.length+Math.max(inn,0)<MIN) add();
      }
      setTimeout(batch,1000+Math.random()*2000);
    }
    for(var k=0;k<MIN+5;k++) setTimeout(add,Math.random()*1500);
    setTimeout(batch,1600);
  }

  // 打字机式出现：把文字拆成一个个字，先都藏着（位置已占好，不会挤动别的东西），再逐个显示
  // 可以一次给几段文字，按顺序接着打；ok 返回假时停下（被打断）
  function typeEls(els,gap,done,ok){
    var sp=[], i, e, t;
    for(e=0;e<els.length;e++){
      t=els[e].textContent; els[e].textContent="";
      for(i=0;i<t.length;i++){var c=document.createElement("span");c.textContent=t.charAt(i);c.style.visibility="hidden";els[e].appendChild(c);sp.push(c)}
    }
    i=0;
    (function next(){if(ok&&!ok())return;if(i<sp.length){sp[i++].style.visibility="";later(next,gap)}else if(done)done()})();
  }
  function typeEl(el,gap,done){typeEls([el],gap,done)}
  // 入场顺序：BUERGIL 打完 → B 变朱 → Backronym → 中文 / EN（两个同时打）→ 提示（中英两句同时打）→ 快速开始（同上）；都是逐字打出来
  var wordsOn=false;
  function finish(){
    var hint=gate.querySelector(".hint"), step=calm?0:600;
    if(!wordsOn){wordsOn=true;startWords()}   // 背景浮词只起一次；「重新开始」会再走一遍入场
    var quick=document.getElementById("quick");
    // 中英两句同时开打、同时打完：字数少的那句每个字隔得久一些
    function pair(a,b,total,done){var na=a.textContent.length,nb=b.textContent.length;typeEl(a,total/na);typeEl(b,total/nb,done)}
    if(calm){setActive(0,true);hint.classList.add("in");quick.classList.add("in")}
    else{
      active=0; letters[0].classList.add("on");
      setTimeout(function(){
        place(0); label.style.transition="none"; label.classList.add("in");
        typeEl(label.querySelector(".w"),90,function(){setTimeout(function(){
          gate.style.transition="none"; gate.classList.add("in");
          typeEl(document.getElementById("btn-zh"),200);
          typeEl(document.getElementById("btn-en"),200,function(){setTimeout(function(){
            hint.classList.add("in");
            pair(document.getElementById("hint-zh"),document.getElementById("hint-en"),930,function(){setTimeout(function(){
              quick.classList.add("in");
              pair(document.getElementById("quick-zh"),document.getElementById("quick-en"),500,function(){label.style.transition="";gate.style.transition=""});
            },step/2)});
          },step/2)});
        },step/2)});
      },step);
    }
    // 回访不自动跳：停在首屏，上次选的语言标成已选，点了才进，进去后落在上次看到的位置
    var s=get("buergil-lang");
    if(s==="zh"||s==="en") document.getElementById("btn-"+s).setAttribute("aria-pressed","true");
  }
  function intro(){
    if(calm){for(var k=0;k<letters.length;k++)letters[k].classList.add("shown");finish();return}
    var caret=document.createElement("i");caret.className="caret";caret.setAttribute("aria-hidden","true");
    var n=0;
    (function type(){
      if(n<letters.length){letters[n].classList.add("shown");letters[n].appendChild(caret);n++;setTimeout(type,170)}
      else setTimeout(function(){caret.remove();finish()},520);
    })();
  }
  (document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(intro,250)});
})();
