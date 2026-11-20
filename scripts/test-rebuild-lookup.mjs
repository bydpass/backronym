// 离线 H5 实际加载器和 model，控制词形响应的到达次序，覆盖失败重试与迟到结果。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const env = vm.createContext({window:{},document:{getElementById:()=>null},setTimeout,clearTimeout});
const run = name => vm.runInContext(fs.readFileSync('app/assets/'+name,'utf8'),env);
for (const file of ['core.js','lexicon-policy.js','lexicon-store.js','lang/packs.js','lang/en/words.js','lang/fr/rules.js','lang/fr/words.js','lang/de/rules.js','lang/de/words.js','lang/es/rules.js','lang/es/words.js','lang/it/rules.js','lang/it/words.js','lang/la/rules.js','lang/la/words.js','app-model.js']) run(file);
const {CORE, LANGPACK, LEXICON_STORE, Backronym: app} = env.window;
const m = app.model;
app.entry = {renderEntry(){}};
app.draft = {quietly:fn=>fn()};
app.view = {renderShell(){}};
const wait = () => new Promise(resolve=>setTimeout(resolve,0));
const requests = [];
const real = LANGPACK.loader;
LANGPACK.loader = () => real({inject:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}))});
m.setLang('fr');
assert.equal(m.formStatus('zzzzzzzzzzzzxyz'),'');
assert.equal(m.formStatus('histoires'),'词形索引加载中');
assert.equal(m.formStatus('histoires'),'词形索引加载中');
await wait();
assert.equal(requests.length,1);
requests[0].reject(Error('模拟加载失败'));
await wait();
assert.equal(m.formStatus('histoires'),'词形索引未能加载');
m.retryForms();
assert.equal(m.formStatus('histoires'),'词形索引加载中');
await wait();
m.setLang('en');
run('lang/fr/inflections.js');
requests[1].resolve();
await wait();
assert.equal(m.state.lang,'en');
m.setLang('fr');
assert.equal(m.formStatus('histoires'),'');
assert.ok(m.lookupAll('histoires').some(hit=>hit.entry[1].includes('n.')));
const pack=LANGPACK.get('fr','lexicon'), sidecar=LANGPACK.get('fr','inflections');
const lx=LEXICON_STORE.fromPack(pack,'fr',CORE.LANG.fold);
assert.equal(CORE.savedSense(['livre','n.磅','la'],['livre','n.书|n.磅','le|la'],'n.'),'n.#2');
const original=lx.index;
assert.throws(()=>LEXICON_STORE.attachForms(lx,{v:1,entries:[sidecar.entries[0],['unknown','xxx']]}));
assert.equal(lx.index,original);
LEXICON_STORE.attachForms(lx,sidecar);
LEXICON_STORE.attachForms(lx,{v:1,entries:[]});
assert.equal(lx.forms[sidecar.entries[0][0]].length,0);
const exactRow=['test:merde','merde','noun','烦人','','','daily',25,3,''];
const exactPack={v:2,senses:[exactRow],names:[],guards:[]};
const exactLx=LEXICON_STORE.fromPack(exactPack,'fr',CORE.LANG.fold);
LEXICON_STORE.attachForms(exactLx,{v:1,entries:[['test:merde','merdes']]});
const options={exact:CORE.LANG.exactKey,fold:CORE.LANG.fold,blocked:()=>false};
// 义项阴阳性（11-19，词性缩写用）：genders 与 senses 逐行对齐，长度或字符不对整包拒收；读入后记在 record.gender
assert.throws(()=>LEXICON_STORE.fromPack({...exactPack,genders:'mf'},'fr',CORE.LANG.fold));
assert.throws(()=>LEXICON_STORE.fromPack({...exactPack,genders:'x'},'fr',CORE.LANG.fold));
assert.equal(LEXICON_STORE.fromPack({...exactPack,genders:'f'},'fr',CORE.LANG.fold).records[0].gender,'f');
assert.equal(LEXICON_STORE.fromPack({...exactPack,genders:'-'},'fr',CORE.LANG.fold).records[0].gender,undefined);
{ const fr=LEXICON_STORE.fromPack(pack,'fr',CORE.LANG.fold), g=d=>fr.records.filter(r=>r.display===d&&r.pos==='noun').map(r=>r.zh+':'+r.gender).join(' ');
  assert.equal(g('livre'),'书:m 磅:f'); assert.equal(g('ombre'),'影子:f'); assert.equal(g('artiste'),'艺术家:b'); }
assert.equal(LEXICON_STORE.packLookup(exactLx,'merde',options).entry[1],'n.烦人');
for(const wrong of ['mérde','merdes','mer']) assert.equal(LEXICON_STORE.packLookup(exactLx,wrong,options),null);
const fixture={aliases:{'孤单':'孤独'},reverse:{'孤独':[0,1]},senses:[['a','alone','adj','孤独','','','daily','',0],['b','alias','adj','孤独','','','daily','',1]]};
assert.deepEqual(Array.from(CORE.candidates({a:[['alone','adj.孤独'],['alias','adj.孤独']]},'A','孤单',()=>false,fixture),r=>r[0]),['alone']);

// R3-12 五语漏音符查询（现行词包，经 model 的真实查词入口）。顺序：精确原形 → 精确词形 → 漏音符候选（leak，带音符的拼写与释义）
for (const l of ['de','it','la']) run(`lang/${l}/inflections.js`);
const look = (lang, word) => { m.setLang(lang); return Array.from(m.lookupAll(word)).map(h => h.entry[0] + '/' + h.entry[1] + (h.leak ? '*' : '')); };
const auto = (lang, word) => { m.setLang(lang); return m.itemFor(word)[1]; }; // 打字时自动带出的义项（空串 = 保留原输入）
// 词形索引迟到：先以漏音符候选带出的义项，索引到达后不被精确命中静默顶替（西语 inflections 此时尚未加载）
{
  m.setLang('es');
  assert.equal(m.lookup('publico').join('|'), ['público', 'adj.公众|n.公众', 'el', ''].join('|'), '索引到之前只有 público 一个候选，自动带出');
  const early = m.itemFor('publico');
  m.state.picks = [early]; m.state.glosses = ['公众']; m.state.glossAuto = [false]; m.state.poss = ['adj.']; m.state.arts = ['']; m.state.pickLangs = ['es']; m.state.letters = ['P'];
  run('lang/es/inflections.js');
  m.refreshPicks();
  assert.equal(m.state.picks[0][1], 'adj.公众|n.公众', '索引到了：已带出的义项不被 publicar 的变位顶替');
  assert.equal(m.state.glosses[0], '公众');
  assert.deepEqual(Array.from(m.lookupAll('publico')).map(h => h.entry[0] + (h.leak ? '*' : '')), ['publico', 'público*'], '索引到了：精确变位排前，público 仍可选');
}
// 法语：peche 两个以上候选（péché 与 pêcher 的词形），不自动带出；cafe 只有 café 一个，自动带出。sur 是已知独立词，不借 sûr
// 合并新管线后（11-19）有 pêche「桃子」、pécher 的词形：按语义断言，不写死全表
{ const r = look('fr', 'peche'); for (const w of ['péché/n.罪恶*', 'pêche/n.桃子*', 'pêche/v.捕鱼*']) assert.ok(r.includes(w), w + ' ' + r); assert.ok(r.every(x => x.endsWith('*')), '全是漏音符候选'); }
assert.equal(auto('fr', 'peche'), '');
assert.deepEqual(look('fr', 'cafe'), ['café/n.咖啡|adj.咖啡色*']); assert.equal(auto('fr', 'cafe'), 'n.咖啡|adj.咖啡色');
assert.deepEqual(look('fr', 'sur'), []); assert.equal(auto('fr', 'sur'), '');
assert.deepEqual(look('fr', 'cafè'), [], '已有的音符不能换成别的');
{ const r = look('fr', 'péché'); assert.ok(r.includes('péché/n.罪恶') && r.every(x => !x.endsWith('*') && x.startsWith('péché/')), '输入带音符：只有精确命中，不再补别的 ' + r); }
// 顺序语义：第一项、应出现的漏音符候选、所有精确结果都排在漏音符候选前（不写死全表，换词包后同形词增减不误报）
const ordered = (r, first, leaks, msg) => { assert.equal(r[0], first, msg + ' 第一项 ' + r); for (const x of leaks) assert.ok(r.includes(x), msg + ' 缺 ' + x + ' ' + r); const k = r.findIndex(x => x.endsWith('*')); assert.ok(k < 0 || r.slice(k).every(x => x.endsWith('*')), msg + ' 精确结果须在漏音符候选前 ' + r); };
// 德语 / 西语 / 意语：精确词在前，带音符的词可选；输入已带音符的变位不补成别的词
ordered(look('de', 'schon'), 'schon/adv.已经', ['schön/adj.美丽*'], 'schon'); assert.equal(auto('de', 'schon'), 'adv.已经');
ordered(look('es', 'ano'), 'ano/n.肛门', ['año/n.年*'], 'ano'); assert.equal(auto('es', 'ano'), 'n.肛门');
ordered(look('es', 'publico'), 'publico/v.出版', ['público/adj.公众|n.公众*'], 'publico'); assert.equal(auto('es', 'publico'), 'v.出版');
assert.deepEqual(look('es', 'publicó'), ['publicó/v.出版']);
assert.deepEqual(look('es', 'año'), ['año/n.年'], '西语 ñ 已输入：不提示 ano');
ordered(look('it', 'citta'), 'citta/n.孩子', ['città/n.城市*'], 'citta'); assert.equal(auto('it', 'citta'), 'n.孩子');
ordered(look('it', 'faro'), 'faro/n.灯塔', ['farò/v.做*'], 'faro'); assert.equal(auto('it', 'faro'), 'n.灯塔');
assert.deepEqual(look('it', 'farò'), ['farò/v.做'], '输入 farò 不反向提示 faro');
// 拉丁语：os 两个同形词都是精确命中；occido 先是 occidō（死亡），occīdō（杀死）是漏长音候选；已写长音的不换成另一个
assert.deepEqual(look('la', 'os'), ['os/n.骨头', 'os/n.嘴']);
ordered(look('la', 'occido'), 'occido/v.死亡', ['occīdō/v.杀死*'], 'occido'); assert.equal(auto('la', 'occido'), 'v.死亡');
assert.deepEqual(look('la', 'occīdo'), ['occīdō/v.杀死*'], '已写 ī：只剩 occīdō，不再给短 i 的 occidō');
// 多语言：各语言的精确结果都排在漏音符候选前（fr 的 détail 是漏音符候选，de 的 Detail 是精确命中）
m.setLangs(['fr', 'de']);
assert.deepEqual(Array.from(m.lookupAll('detail')).map(h => h.lang + ':' + h.entry[0] + (h.leak ? '*' : '')), ['de:Detail', 'fr:détail*']);
assert.equal(m.lookup('detail').join('|'), ['Detail', 'n.细节', 'das', ''].join('|'), '自动带出取精确命中的语言');
// 复审 R3-13：新输入先查全部选中语言的精确命中，记着法语也不先取法语的漏音符 détail
assert.equal(m.lookupHit('detail', 'fr').lang, 'de', '新输入：德语精确的 Detail 优先于法语漏音符 détail');
{ // 旧草稿已确认的法语 détail：重核时按已存释义找回，不换成德语
  const fr = Array.from(m.lookupAll('detail')).find(h => h.lang === 'fr').entry;
  const back = m.lookupHit('detail', 'fr', fr);
  assert.equal(back.lang, 'fr'); assert.equal(back.entry[1], fr[1], '旧草稿的法语义项原样认回');
}
// 两门语言各有一个漏音符候选（法 cafétéria、西 cafetería）：合起来不唯一，保留原输入，两者都可选
m.setLangs(['fr', 'es']);
{ const all = Array.from(m.lookupAll('cafeteria')).map(h => h.lang + ':' + h.entry[0] + (h.leak ? '*' : ''));
  assert.ok(all.includes('fr:cafétéria*') && all.includes('es:cafetería*'), '两门的漏音符候选都在 ' + all);
  assert.equal(m.lookupHit('cafeteria'), null, '多语漏音符候选不唯一：不自动带出');
  assert.equal(m.lookupHit('cafeteria', 'fr', ['cafeteria', '']), null, '复审 R3-16：只存了拼写的格重核时也不算已选义项'); }
m.setLangs(['fr']);
// 用户点选过漏音符候选：存下的是带音符的拼写和义项，重对后原样回来
{
  m.setLang('es');
  const chosen = m.lookupAll('ano')[1].entry, kept = m.itemFor(chosen[0], chosen.slice(0, 4), 0);
  assert.deepEqual([kept[0], kept[1]], ['Año', 'n.年']); // 卡面首字母大写（spellingFor）
  // 多个候选时保留原输入（自定义词），重对也不自作主张补成其中一个
  m.setLang('fr'); const custom = ['peche', ''];
  assert.deepEqual(m.itemFor('peche', custom, 0), custom);
}
console.log('词形按需加载、共用请求、失败重试、语言切换、原子替换与中文同义反查通过');
