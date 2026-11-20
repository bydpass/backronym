// 真机缺词清单（词库重建简报 Q8 ①，v00.03.01 L05）：第三轮真机点名缺的词与代词，必须在正式词包里查得到、词性与释义对；
// 代词进默认候选（words 部分）、类别 pronouns。以后改词库都要过这条。读的是随包分发的 app/assets/lang/*/words.js，不读编译包。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const packStore=createRequire(import.meta.url)('../app/assets/lexicon-store.js');

const window = globalThis; globalThis.window = globalThis; // 词包脚本按浏览器写法引用全局 window
window.LANGPACK = { packs: {}, put(lang, part, value) { (this.packs[lang] = this.packs[lang] || {})[part] = value; } };
for (const lang of ['fr', 'de', 'es', 'it', 'la']) new Function(fs.readFileSync(`app/assets/lang/${lang}/words.js`, 'utf8'))();
new Function(fs.readFileSync('app/assets/lang/en/words.js', 'utf8'))();
window.LANGPACK.packs.en = { words: window.WORDS, lexicon: window.LEXICON_EN };

// [语种, 显示写法, 词性, 中文]（直接校验词包内的中文，形容词按 Q6 写词干）
const REQUIRED = [
  ['en', 'ill', 'adj', '生病'], ['en', 'sick', 'adj', '生病'], ['en', 'nothing', 'pron', '没有什么'], ['en', 'I', 'pron', '我'], ['en', 'you', 'pron', '你'], ['en', 'me', 'pron', '我'],
  ['de', 'Apfel', 'noun', '苹果'], ['de', 'krank', 'adj', '生病'], ['de', 'nichts', 'pron', '没有什么'], ['de', 'du', 'pron', '你'],
  ['fr', 'rien', 'pron', '没有什么'], ['fr', 'malade', 'adj', '生病'], ['fr', 'je', 'pron', '我'], ['fr', 'tu', 'pron', '你'], ['fr', 'moi', 'pron', '我'], ['fr', 'toi', 'pron', '你'],
  ['es', 'tú', 'pron', '你'], ['es', 'enfermo', 'adj', '生病'], ['es', 'nada', 'pron', '没有什么'],
  ['it', 'niente', 'pron', '没有什么'], ['it', 'tu', 'pron', '你'], ['it', 'malato', 'adj', '生病'],
  ['la', 'nihil', 'pron', '没有什么'], ['la', 'ego', 'pron', '我'], ['la', 'tū', 'pron', '你'], ['la', 'aeger', 'adj', '生病'],
];
const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
let checked = 0;
for (const [lang, display, pos, zh] of REQUIRED) {
  const pack = window.LANGPACK.packs[lang];
  // lexicon.senses：[义项ID, 显示词, 词性, 中文, 冠词, 说明, 类别, 词形, 标记（0 普通 / 1 只供查询 / 2 降权）, 已排除的同形词形]
  const sense = pack.lexicon.senses.find(s => s[1] === display && s[2] === pos && s[3] === zh);
  assert.ok(sense, `${lang} ${display}（${pos}）${zh}：词包里没有`);
  assert.equal(sense[8], 0, `${lang} ${display}：不能是只供查询或降权`);
  if (pos === 'pron') assert.equal(sense[6], 'pronouns', `${lang} ${display}：代词归 pronouns 类`);
  // 默认候选：words 按（去变音符的）首字母分组，词条第一列是显示写法
  const group = pack.words[fold(display).charAt(0)] || [];
  assert.ok(group.some(entry => entry[0] === display), `${lang} ${display}：不在默认候选里`);
  checked++;
}
// 代词只在 pronouns 类里出现（其他类别仍按功能词排除）
for (const [lang, pack] of Object.entries(window.LANGPACK.packs)) {
  for (const s of pack.lexicon.senses) if (s[2] === 'pron') assert.equal(s[6], 'pronouns', `${lang} ${s[1]}：代词只能在 pronouns 类`);
}
console.log(`required words ok: ${checked} 个真机点名词与代词查得到、词性释义对、在默认候选里；代词只在 pronouns 类`);

// Q5 / Q6：整个成品规范存储，不依赖卡面改拼写或截释义。
for(const [lang,pack] of Object.entries(window.LANGPACK.packs)){
  const counts=new Map();
  for(const row of pack.lexicon.senses){
    const [,word,pos,gloss]=row;
    assert.equal(word,word.normalize('NFC'),lang+' NFC '+word);
    if(lang==='de'&&pos==='noun'&&!word.includes(' '))assert.match(word,/^\p{Lu}/u,word);
    if(pos==='name')assert.match(word,/^\p{Lu}/u,word);
    assert.ok([...gloss].length<=10 && !/[，、；;|/]/.test(gloss),lang+' '+word+' '+gloss);
    // 简报 Q6（用户 11-18 定）：形容词不带末尾「的」，去掉后只剩一个字的保留（酸的、大的）；不能是光秃秃的单字
    if(pos==='adj'){const body=gloss.replace(/[（(][^（()）]+[）)]$/,''),stem=body.replace(/的$/,'');assert.ok(body.endsWith('的')?/^(?:.|我们|你们|他们|她们|它们|自己|他人|别人)$/u.test(stem):!/^(?:.|我们|你们|他们|她们|它们|自己|他人|别人)$/u.test(body),word+' '+gloss);}
    counts.set(word,(counts.get(word)||0)+1);
  }
  for(const [word,n] of counts)assert.ok(n<=4,lang+' '+word+' 超过四义');
}
const latin=window.LANGPACK.packs.la.lexicon.senses;
for(const [word,gloss] of [['māgnus','大的'],['sīgnum','记号'],['āgmen','行军队伍'],['īctus','节拍'],['populus','人民']])
  assert.ok(latin.some(row=>row[1]===word&&row[3]===gloss),word+' '+gloss);
const french=window.LANGPACK.packs.fr;
new Function(fs.readFileSync('app/assets/lang/fr/inflections.js','utf8'))();
const ami=french.lexicon.senses.find(row=>row[1]==='ami'&&row[2]==='noun');
const inflected=french.inflections.entries.find(row=>row[0]===french.lexicon.senses.indexOf(ami)); // 词形行引用义项下标（批 S1）
{ const got=packStore.rowForms(french.inflections,inflected); // 行可能拆成词干加词尾串（批 S2），经解码再比
  assert.deepEqual(got.list.slice().sort(),['amie','amies','amis']);
  assert.deepEqual(got.morphology.amie,{gender:'f',number:'sg',article:'l’'}); }
console.log('六语 Q5/Q6、拉丁长短音同形与法语 ami 词形通过');

// 频率排名只属于相同规范拼写和词性的原形，大小写、长短音同形词各自归属。
for(const [lang,pack] of Object.entries(window.LANGPACK.packs)){
  const ranks=new Map();
  const table=fs.readFileSync('review/lexicon-rebuild-3/candidates/'+lang+'.tsv','utf8').trimEnd().split('\n').slice(1);
  for(const line of table){
    const [lemma,positions,rank]=line.split('\t');
    if(rank)for(const pos of positions.split(','))ranks.set(lemma+'|'+pos,Number(rank));
  }
  for(const row of pack.lexicon.senses)assert.equal(row[7],ranks.get(row[1]+'|'+row[2])||0,lang+' '+row[1]+' '+row[2]+' 借用排名');
}

// 2026-11-19 Claude 返工的回归（review/lexicon-rebuild-20261118/P5-claude-review.md）
// ① 日常名词不能因为与专名、冷僻动词变形或感叹词同形被选词清零：必须在默认候选里
const EVERYDAY = {
  fr: 'fromage pomme santé banque poisson victime peuple verre poire', de: 'Käse Ei Preis Finger Liste Punkt Garten Blut',
  es: 'manzana huevo salud mercado playa regalo', it: 'formaggio chiesa braccio prezzo salute regina',
  en: 'pear',
};
// 用户 11-19 第六轮真机：材质词名额外补录（claude-additions.tsv），每门语言抽查；法语 a 的「字母A」清出，a 只作 avoir 的变位
Object.assign(EVERYDAY, Object.fromEntries(Object.entries({
  fr: 'céramique émail porcelaine', de: 'Keramik Emaille Porzellan', es: 'cerámica esmalte porcelana', it: 'ceramica smalto porcellana', en: 'ceramic enamel porcelain',
}).map(([lang, more]) => [lang, EVERYDAY[lang] + ' ' + more])));
assert.ok(!(window.LANGPACK.packs.fr.words.a || []).some(entry => entry[0] === 'a'), 'fr a：字母义应已清出');
for (const [lang, list] of Object.entries(EVERYDAY)) for (const display of list.split(' ')) {
  const group = window.LANGPACK.packs[lang].words[fold(display).charAt(0)] || [];
  assert.ok(group.some(entry => entry[0] === display), `${lang} ${display}：日常名词不在默认候选里`);
}
// ② 卡面默认义项（词条第一组）是这个词最常用的义项，不按散列排
const FIRST = [['fr','avoir','v.拥有'],['fr','prendre','v.拿取'],['fr','lire','v.阅读'],['fr','sortir','v.出去'],['fr','ranger','v.排列'],
  ['es','hacer','v.做'],['it','essere','v.是'],['it','fare','v.做'],['it','tornare','v.回来'],['en','like','v.喜欢'],['fr','pas','adv.不'],['la','noster','adj.我们的'],['la','vester','adj.你们的'],['de','Bank','n.银行'],['it','radio','n.收音机'],['es','ajeno','adj.他人的'],['la','aliēnus','adj.别人的'],['es','pena','n.遗憾'],['es','tienda','n.商店'],['en','pupil','n.学生'],['it','deputato','n.议员'],['la','suus','adj.自己的']];
for (const [lang, display, first] of FIRST) {
  const entry = (window.LANGPACK.packs[lang].words[fold(display).charAt(0)] || []).find(e => e[0] === display);
  assert.ok(entry && entry[1].split('|')[0] === first, `${lang} ${display} 默认义项应为 ${first}，实为 ${entry && entry[1]}`);
}
// ③ 返工删掉、改成只供查询的义项不在默认候选
const GONE = [['es','puñal','adj'],['es','nasa','noun'],['es','hot','adj'],['fr','un','noun'],['fr','revenue','noun'],['it','ci','noun'],
  ['de','committen','verb'],['de','okay','adj']];
for (const [lang, display, pos] of GONE)
  assert.ok(!window.LANGPACK.packs[lang].lexicon.senses.some(s => s[1] === display && s[2] === pos && (s[8] === 0 || s[8] === 2)), `${lang} ${display}（${pos}）应已删除或只供查询`);
// ④ 2026-11-19 复审：卡面默认义项（claude-fixes.tsv 的 first 行）
const FIRST_REVIEW = [['fr','devoir','v.必须'],['fr','époque','n.时代'],['fr','désolé','adj.抱歉'],['de','wollen','v.想要'],['de','Nacht','n.夜晚'],
  ['en','good','adj.好的'],['en','today','adv.今天'],['es','guapo','adj.好看'],['es','ojo','n.眼睛'],['it','bene','adv.很好地'],['it','fine','n.结束'],
  ['it','natale','n.圣诞节'],['la','mundus','n.世界']];
for (const [lang, display, first] of FIRST_REVIEW) {
  const entry = (window.LANGPACK.packs[lang].words[fold(display).charAt(0)] || []).find(e => e[0] === display);
  assert.ok(entry && entry[1].split('|')[0] === first, `${lang} ${display} 默认义项应为 ${first}，实为 ${entry && entry[1]}`);
}
// ⑤ 2026-11-19 复审：感叹词与共用词形不能把整笔字幕频次借给冷僻同形词（select.py 的 intj-homographs.tsv、rare-parent-veto.tsv）。
// 这些词原先靠「hallo」「ich glaube」「Stunden」「te lo juro」的频次进了前 5000，卡面上是「喧嚣」「杜鹃」「代金券」「泽芹属植物」
const BORROWED = [['de','Hallo','noun'],['de','Nein','noun'],['de','Ach','noun'],['de','Mom','noun'],['de','lass','adj'],['de','stunden','verb'],
  ['de','Denke','noun'],['de','Merk','noun'],['de','alle','adj'],['fr','coucou','noun'],['fr','ben','noun'],['es','vale','noun'],['es','ji','noun'],
  ['es','juro','noun'],['es','vera','noun'],['it','prego','noun'],['it','cacchio','noun'],['it','bisogna','noun'],['it','citta','noun']];
for (const [lang, display, pos] of BORROWED)
  assert.ok(!window.LANGPACK.packs[lang].lexicon.senses.some(s => s[1] === display && s[2] === pos && (s[8] === 0 || s[8] === 2)), `${lang} ${display}（${pos}）不该靠同形词的频次进默认候选`);
// ⑥ 2026-11-19 第二批复审：claude-fixes.tsv 的每一行 first / zhfirst 都必须真的让该义项成为词条第一组。
// 运行时先比词频名次、后比 sense_order，排第一的义项若没有名次会被压过去（amīcus 只有形容词带名次）；逐行核对，免得修订静默失效
const fixRows = fs.readFileSync('review/lexicon-rebuild-20261118/claude-fixes.tsv', 'utf8').trim().split('\n').slice(1).map(line => line.split('\t'));
let firstRows = 0;
for (const [lang, display, , zh, action, value] of fixRows) {
  if (action !== 'first' && action !== 'zhfirst') continue;
  const want = action === 'zhfirst' ? value : zh, pack = window.LANGPACK.packs[lang];
  const entry = ['words', 'more'].map(part => (pack[part] && pack[part][fold(display).charAt(0)]) || []).flat().find(e => e[0] === display);
  const head = entry && entry[1].split('|')[0];
  assert.ok(head && head.slice(head.indexOf('.') + 1) === want, `${lang} ${display} 按 claude-fixes.tsv 默认义项应为 ${want}，实为 ${entry && entry[1]}`);
  firstRows++;
}
assert.ok(firstRows > 400, 'claude-fixes.tsv 的 first 行没读到');
console.log(`返工回归通过：日常名词在默认候选、默认义项按词性与译名先后、删除的义项不再推荐、同形词不借频次；claude-fixes.tsv ${firstRows} 行排第一都生效`);
