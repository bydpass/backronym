# 对照设计系统各预览与产品 index.html：同一个 id 的块，比较其内部的「标签 + id + 类名」序列（不比文字、hidden 等状态）
import re,sys,glob,os
from html.parser import HTMLParser
A=sys.argv[1]; prod=open('app/index.html').read(); css=open('app/assets/style.css').read()+open(A+'/components/bundle.css').read()
VOID={'input','br','img','use','path','meta','link','hr','source','rect','circle','line','polyline','polygon','ellipse'}
class P(HTMLParser):
    def __init__(s): super().__init__(convert_charrefs=True); s.stack=[]; s.blocks={}; s.open={}; s.classes=set(); s.ids=[]
    def handle_starttag(s,tag,attrs):
        a=dict(attrs); cls=' '.join(sorted((a.get('class') or '').split())); s.classes.update((a.get('class') or '').split())
        sig=(tag,a.get('id') or '',cls)
        for k in s.open: s.blocks[k].append(sig)
        if a.get('id') and tag not in VOID:
            key=a['id']+'#'+str(sum(1 for i in s.ids if i==a['id'])); s.ids.append(a['id']); s.blocks[key]=[sig]; s.open[key]=len(s.stack)
        if tag not in VOID: s.stack.append(tag)
    def handle_startendtag(s,tag,attrs): s.handle_starttag(tag,attrs); 
    def handle_endtag(s,tag):
        if tag in VOID or tag not in s.stack: return
        while s.stack and s.stack.pop()!=tag: pass
        for k in [k for k,d in s.open.items() if d>=len(s.stack)]: del s.open[k]
def parse(t):
    p=P(); p.feed(re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->','',t)); return p
pp=parse(prod); PB={k.split('#')[0]:v for k,v in pp.blocks.items()}
norm=lambda seq:[(t,c) for t,i,c in seq if t not in('svg','path','use','li','img','option')]
for f in sorted(glob.glob(A+'/components/*/preview.html')):
    name=f.split('/')[-2]; t=open(f).read(); q=parse(t); out=[]
    top=[k for k in q.blocks if k.split('#')[0] in PB]
    # 只看最外层：被别的已匹配块包含的不重复报
    seen=set()
    for k in top:
        id=k.split('#')[0]; a,b=norm(q.blocks[k]),norm(PB[id])
        if a!=b:
            # 状态类（off、on、open 等）差异不算
            sa=[(t,' '.join(x for x in c.split() if x not in('off','on','open','flat','cur','bad','kbd','busy','sel','done','hit','has','show','empty','two'))) for t,c in a]
            sb=[(t,' '.join(x for x in c.split() if x not in('off','on','open','flat','cur','bad','kbd','busy','sel','done','hit','has','show','empty','two'))) for t,c in b]
            if sa!=sb and id not in seen:
                seen.add(id); only_a=[x for x in sa if x not in sb][:3]; only_b=[x for x in sb if x not in sa][:3]
                out.append(f'  #{id}: 预览 {len(sa)} 个元素 / 产品 {len(sb)}；预览独有 {only_a}；产品独有 {only_b}')
    unknown=sorted(c for c in q.classes if not re.search(r'[.]'+re.escape(c)+r'(?![\w-])',css) and not c.startswith('ds-'))
    local=len(re.findall(r'<style',t)); ver=re.findall(r'v00\.0\d\.\d\d',t)
    print(f'{name}: 匹配块 {len(top)}，结构不同 {len(out)}，样式表里找不到的类 {unknown[:8]}，自带样式块 {local}，版本字样 {sorted(set(ver))}')
    for o in out[:6]: print(o[:330])
