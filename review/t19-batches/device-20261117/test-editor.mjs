// 用真实模块和正式词包检查候选、义项按钮与草稿恢复。DOM 和存储用替身，无需浏览器。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadAppFunctions} from '../../../scripts/app-source.mjs';

class Element {
  children = [];
  events = {};
  attributes = {};
  style = {};
  classList = {toggle() {}, add() {}, remove() {}}; // v00.03.01 E6：单词框计数器切换两档样式
  value = '';

  constructor(tag) { this.tagName = tag; }
  appendChild(node) {
    if (node.tagName === 'fragment') this.children.push(...node.children);
    else {
      this.children.push(node);
      node.parentNode = this;
    }
    return node;
  }
  set textContent(text) {
    this.text = text;
    this.children = [];
  }
  get textContent() { return (this.text || '') + this.children.map(node => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, handler) { this.events[type] = handler; }
  contains() { return false; }
  setSelectionRange() {}
  focus() {}
  blur() {}
}

const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  },
  createElement: tag => new Element(tag),
  createDocumentFragment: () => new Element('fragment'),
  createTextNode(text) {
    const node = new Element('#text');
    node.textContent = text;
    return node;
  }
};
const env = vm.createContext({window: {}, document});
const languages = ['en', 'fr', 'de', 'es', 'it', 'la'];
function load(file, expose = '') {
  const code = fs.readFileSync(new URL('../../../app/assets/' + file, import.meta.url), 'utf8');
  vm.runInContext(expose ? code.replace(/\}\)\(window.Backronym\);\s*$/, expose + '\n})(window.Backronym);') : code, env, {filename: file});
}
load('core.js');
load('lang/packs.js');
load('block/core.js');
for (const lang of languages) {
  if (lang !== 'en') load('lang/' + lang + '/rules.js');
  load('lang/' + lang + '/block.js');
  load('lang/' + lang + '/words.js');
  load('lang/' + lang + '/inflections.js');
}
for (const file of ['lexicon-policy.js', 'lexicon-store.js', 'app-model.js']) load(file);
load('app-editor.js', 'Object.assign(app.editor, {onWordCtl, renderWordBar, renderSenseBar, candItem});');

const {CORE, LANGPACK, Backronym: app} = env.window;
const {state, el} = app.model;
app.model.changed = () => {};
app.title = {hasTitle: () => false};
app.view = {syncViews() {}};
app.entry = {loadLang() {}};
app.draft = {draftEpoch: 1};
const plain = value => JSON.parse(JSON.stringify(value));
const descendants = node => [node, ...node.children.flatMap(descendants)];
const buttons = node => descendants(node).filter(child => child.tagName === 'button');
const posTag = {noun: 'n.', verb: 'v.', adj: 'adj.', adv: 'adv.', name: 'n.', num: 'num.', pron: 'pron.'};

function type(lang, spelling) {
  app.model.setLang(lang);
  app.model.setLetters(spelling[0].toUpperCase());
  Object.assign(state, {picks: [null], focus: 0, glosses: [''], glossAuto: [true], arts: [''], poss: [''], pickLangs: ['']});
  el.wordCtl.value = spelling;
  app.editor.onWordCtl();
  app.editor.renderWordBar(0);
}

function senseButton(pos, gloss) {
  app.editor.renderSenseBar(0);
  const label = app.model.posName(posTag[pos]);
  assert.ok(label, '自检缺少词性标签：' + pos);
  return buttons(el.senseList).find(node => node.textContent === gloss && node.parentNode.attributes['aria-label']?.includes(label)); // 11-19 起法西意名词组读作「阴性名词」等，按包含认
}

function candidates(spelling) {
  let result = buttons(el.candList);
  const pages = Number(el.candLab.textContent.match(/\/ (\d+) 批/)?.[1] || 1);
  for (let page = 1; page < pages; page++) {
    app.editor.candPage = page;
    app.editor.renderWordBar(0);
    result = result.concat(buttons(el.candList));
  }
  return result.filter(button => button.children[0].children.at(-1).textContent.toLowerCase() === spelling.toLowerCase());
}

function selectSense(choices, pos, gloss, context) {
  for (const choice of choices) {
    choice.events.click();
    const sense = senseButton(pos, gloss);
    if (sense) {
      sense.events.click();
      return;
    }
  }
  assert.fail(context + ' 无可点击义项');
}

// 用有三个以上真实义项的行检查界面投影：按钮前二义，选词后卡面第一义。
{
  const row = Object.values(LANGPACK.get('en','words')).flat().find(entry => CORE.displayGroups(entry).flatMap(g=>g.senses).length >= 3);
  assert.ok(row, '英语词包含三义以上的真实测试行');
  type('en',row[0]);
  const expected = CORE.displayGroups(row).flatMap(g=>g.senses);
  const button = buttons(app.editor.candItem(row,row[0][0].toUpperCase(),0))[0];
  // 11-19 起释义行每段前带词性缩写（「n. 弓，蝴蝶结」「adj. 最后；v. 持续」）：去掉缩写、把段间「；」换回「，」后比义项
  const line=button.children[button.children.length-1].textContent;
  assert.match(line,/^[a-z]+\. /,'释义行以词性缩写开头');
  assert.equal(line.replace(/(^|；)[a-z]+\. /g,'$1').replace(/；/g,'，'),expected.slice(0,2).join('，'));
  button.events.click();
  assert.equal(state.glosses[0],expected[0]);
}

let checked = 0;
const blocked = [];
for (const lang of languages) {
  const spellings = new Map();
  for (const sense of LANGPACK.get(lang, 'lexicon').senses) {
    const spelling = sense[1];
    if (!spellings.has(spelling)) spellings.set(spelling, []);
    spellings.get(spelling).push(sense);
  }
  for (const [spelling, senses] of spellings) {
    type(lang, spelling);
    const choices = candidates(spelling);
    for (const [, , pos, gloss, article] of senses) {
      const context = [lang, spelling, pos, gloss].join(' ');
      if (CORE.blocked(spelling) || CORE.blocked(gloss)) {
        blocked.push(context);
        continue;
      }
      const shown = gloss; // Q6 词包存放最终显示写法
      selectSense(choices, pos, shown, context);
      const previous = plain(state.picks[0]);
      state.picks[0] = previous;
      app.model.refreshPicks();
      assert.equal(state.glosses[0], shown, context);
      assert.equal(app.model.articleText(0), /^(.+?) \(.+\)$/.exec(article)?.[1] ?? article, context); // 「el (la)」没选时卡面写推荐的 el（复审 R3-19）
      assert.deepEqual(plain(state.picks[0]), previous, context);
      checked++;
    }
  }
}

const save = loadAppFunctions(['draftPayload'], {state, CORE, draftExtra: {}, draftMedia: () => null});
save.app = app;
const examples = [
  ['la', 'alba', '白色', 'noun', '黎明', ''], // v00.03.01 L01：形容词默认释义去掉末尾的「的」
  ['la', 'alba', '白色', 'noun', '白色', ''],
  ['en', 'Renaissance', '文艺复兴', 'noun', '复兴', ''],
  ['en', 'renaissance', '复兴', 'noun', '文艺复兴', ''],
  ['de', 'Sein', '存在', 'verb', '是', ''],
  ['de', 'sein', '是', 'noun', '存在', 'das'],
  ['es', 'conciencia', '意识', 'noun', '意识', '', true]
];
for (const [lang, spelling, defaultGloss, pos, gloss, article, chooseBare] of examples) {
  type(lang, spelling);
  assert.equal(state.glosses[0], defaultGloss, spelling + ' 自动释义');
  const choices = candidates(spelling);
  if (chooseBare) assert.equal(app.model.articleText(0), 'la', spelling + ' 默认用有冠词的原形');
  const eligible = chooseBare ? choices.filter(button => button.children[0].children.length === 1) : choices;
  selectSense(eligible, pos, gloss, spelling);
  assert.equal(app.model.articleText(0), article, spelling + ' 选中后的冠词');
  const raw = JSON.stringify({...save.draftPayload(), t: Date.now()});
  const draft = CORE.migrateDraft(JSON.parse(raw));
  type(lang, spelling);
  const restore = loadAppFunctions(['applyDraft'], {
    state, el, CORE, window: env.window,
    readDraft: async () => ({entry: {draft, raw}}),
    loadMedia: async () => ({def: null, cells: [], lost: '', unsure: false}),
    tagNotice() {}, draftExtra: {}, emptyMedia: () => ({}), finishRestore() {}
  });
  restore.app = app;
  await restore.applyDraft(1, {});
  assert.equal(state.glosses[0], gloss, spelling + ' 草稿释义');
  assert.equal(app.model.articleText(0), article, spelling + ' 草稿冠词');
  assert.deepEqual(plain(state.picks[0]), JSON.parse(raw).picks[0], spelling + ' 草稿词条');
}

assert.deepEqual(blocked, [], 'Q15 屏蔽的词与义项均不分发');
console.log(`编辑器候选、选义和草稿重查：${checked} 条义项；完整草稿保存恢复：${examples.length} 例。`);
console.log(`略过 ${blocked.length} 条屏蔽义项：${blocked.join('、')}`);
