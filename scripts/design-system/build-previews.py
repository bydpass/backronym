import re,sys,json
S,A=sys.argv[1],sys.argv[2]; shots=json.load(open(S+'/shots.json')); prod=open('app/index.html').read()
def block(src,pat,tag='div'):
    m=re.search(pat,src); i=src.rfind('<'+tag,0,m.end()); depth=0
    for t in re.finditer(r'<(/?)%s\b'%tag,src[i:]):
        depth+=-1 if t.group(1) else 1
        if depth==0: return src[i:i+t.end()+1]
def rootcls(k): return re.match(r'<div class="([^"]*)"',shots[k]['html']).group(1)
def var(k): s=shots[k]; return '--k:%s;--u:%s'%(s['k'],s['u'])
FOOT='''<script>
var B = window.Backronym;
// 结构是从运行中的产品按状态截取的（仓库 scripts/design-system/ 下的 capture.mjs 与 build-previews.py，2026-11-12），不是手抄；产品改了就重新截取。配图在产品里是用户的照片，这里用占位
function ph() { var c = document.createElement("canvas"); c.width = 120; c.height = 160; var x = c.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, "#c9c7c1"); gr.addColorStop(1, "#8e8b85"); x.fillStyle = gr; x.fillRect(0, 0, 120, 160); return c.toDataURL(); }
Array.prototype.forEach.call(document.querySelectorAll('img[src=""]'), function (i) { i.src = ph(); });
</script>
</body>
</html>
'''
def page(name,head,title,figs):
    open(A+'/components/%s/preview.html'%name,'w').write(head+'\n<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><title>'+title+'</title></head>\n<body>\n<div class="ds-row">'+''.join(figs)+'</div>\n'+FOOT)
def screen(k,cap,h):
    w=shots[k]['w']; return '<figure class="ds-fig" style="width:%dpx"><div class="ds-stage wide" style="width:%dpx;height:%dpx;overflow:auto;%s">%s</div><figcaption>%s</figcaption></figure>'%(w,w,h,var(k),shots[k]['html'],cap)
def strip(k,inner,cap):
    w=shots[k]['w']; return '<figure class="ds-fig" style="width:%dpx"><div class="ds-strip ds-inline" style="width:%dpx;%s"><div class="%s">%s</div></div><figcaption>%s</figcaption></figure>'%(w,w,var(k),rootcls(k),inner,cap)
top=lambda k: block(shots[k]['html'],r'<header id="top"','header')
page('EntryScreen','<!-- @dsCard group="入场" subtitle="入场页与改词页" height=1060 width=1560 -->','入场页与改词页',[
 screen('entry-first-360','<b>首次进入</b> · 只选了英语',1000),
 screen('entry-multi-360','<b>展开语言栏，多选</b> · 英、法、德',1000),
 screen('entry-long-360','<b>长词</b> · 自动分两张，可调分界',1000),
 screen('entry-edit-360','<b>改词页</b> · 从编辑面进入',1000)])
page('EditorScreens','<!-- @dsCard group="全屏" subtitle="编辑面" height=820 width=1560 -->','编辑面',[
 screen('editor-full-360','<b>默认编辑</b> · 四格填好',760),
 screen('editor-partial-360','<b>还有格没填</b>',760),
 screen('editor-sense-360','<b>把这一格换成别的词</b> · 候选栏首条跟着卡上的词',760),
 screen('editor-grid-360','<b>列阵</b>',760)])
page('TopBar','<!-- @dsCard group="外壳" subtitle="顶部栏" height=440 width=780 -->','顶部栏',[
 strip('editor-full-360',top('editor-full-360'),'<b>编辑面</b> · 单图 / 列阵，设置，完成'),
 strip('entry-first-360',top('entry-first-360'),'<b>首次进入</b> · 品牌名，设置'),
 strip('entry-edit-360',top('entry-edit-360'),'<b>改词页 · 无修改</b> · 返回，保存，设置'),
 strip('entry-edit-dirty-360',top('entry-edit-dirty-360'),'<b>改词页 · 有修改</b> · 保存变成可点'),
 strip('editor-full-320',top('editor-full-320'),'<b>320 宽 · 编辑面</b>'),
 strip('entry-edit-320',top('entry-edit-320'),'<b>320 宽 · 改词页</b>')])
lang=lambda k: '<section class="entry">'+block(shots[k]['html'],r'<div class="ent-lang"')+'</section>'
page('LanguageField','<!-- @dsCard group="入场" subtitle="语言栏" height=460 width=1180 -->','语言栏',[
 strip('entry-first-360',lang('entry-first-360'),'<b>折叠</b> · 只写当前选中的语言'),
 strip('entry-langopen-360',lang('entry-langopen-360'),'<b>展开</b> · 六个多选框；只选了一门时它的框停用'),
 strip('entry-multi-360',lang('entry-multi-360'),'<b>多选</b> · 英、法、德；选中的语言一律平等'),
 strip('entry-multi-320',lang('entry-multi-320'),'<b>320 宽 · 多选</b>')])
cand=lambda k: block(shots[k]['html'],r'<div id="cand"')
page('SenseBar','<!-- @dsCard group="栏" subtitle="义项栏" height=260 width=780 -->','义项栏',[
 strip('editor-full-360',cand('editor-full-360'),'<b>打的词查得到</b> · 候选栏首条就是卡上这个词和它的释义'),
 strip('editor-partial-360',cand('editor-partial-360'),'<b>词库里没有这个词</b> · 写明会按打的字使用，不拦')])
page('CandidateBar','<!-- @dsCard group="栏" subtitle="候选栏" height=900 width=1180 -->','候选栏',[
 strip('editor-empty-360',cand('editor-empty-360'),'<b>空格，还没打字</b> · 只有提示行和开关'),
 strip('cand-letter-360',cand('cand-letter-360'),'<b>打了首字母</b> · 列出这个字母的候选，可换一批、随机一个'),
 strip('cand-letter-multi-360',cand('cand-letter-multi-360'),'<b>选了两门语言</b> · 候选按语言轮流排，每条标一个字'),
 strip('editor-full-360',cand('editor-full-360'),'<b>格里已有词</b> · 首条就是卡上这个词'),
 strip('cand-letter-320',cand('cand-letter-320'),'<b>320 宽 · 打了首字母</b>')])
pre=lambda k: '<section class="entry">'+block(shots[k]['html'],r'<div id="presets"')+'</section>'
page('PresetButton','<!-- @dsCard group="入场" subtitle="预设词按钮" height=420 width=1180 -->','预设词按钮',[
 strip('entry-first-360',pre('entry-first-360'),'<b>只选英语</b> · 固定两行：上原词，下释义；两列'),
 strip('entry-multi-360',pre('entry-multi-360'),'<b>英、法、德</b> · 各门语言轮流取'),
 strip('entry-first-320',pre('entry-first-320'),'<b>320 宽</b> · 长词也不截断')])
# 关闭按钮：换成产品现在的「图标 + 文字」
def icons(s):
    def f(m):
        sym=re.search(r'<symbol id="%s" viewBox="([^"]+)">([\s\S]*?)</symbol>'%m.group(2),prod); return '<svg class="ic" viewBox="%s"%s>%s</svg>'%(sym.group(1),m.group(1),sym.group(2))
    return re.sub(r'<svg class="ic"([^>]*)><use xlink:href="#([\w-]+)"/></svg>',f,s)
for name,bid in [('Viewer','viewClose'),('FullPage','resClose')]:
    p=A+'/components/%s/preview.html'%name; t=open(p).read()
    new=icons(re.search(r'<button id="%s"[\s\S]*?</button>'%bid,prod).group(0)); old=re.search(r'<button id="%s"[\s\S]*?</button>'%bid,t).group(0)
    open(p,'w').write(t.replace(old,new))
print('ok', {k:len(open(A+'/components/%s/preview.html'%k).read()) for k in ['EntryScreen','EditorScreens','TopBar','LanguageField','SenseBar','Viewer','FullPage']})
