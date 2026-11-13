/* Read-only T19 inspection page. Uses the product's language loader, lookup and blocker. */
(function (root) {
  'use strict';
  var CORE = root.CORE, PACK = root.LANGPACK;
  function open(code) {
    if (!CORE || !PACK || !root.BLOCK || !PACK.has(code, 'words') ||
        !PACK.has(code, 'block') || !CORE.useLang(code)) throw new Error('语言包或屏蔽器未就绪');
    var words = PACK.get(code, 'words'), forms = PACK.get(code, 'forms');
    function activate() {
      if (!root.BLOCK.has(code) || !CORE.useLang(code)) throw new Error('屏蔽器或语言规则不可用');
    }
    function inspect(row, input) {
      activate();
      var reasons = [];
      if (input && CORE.blocked(input)) reasons.push('输入');
      if (CORE.blocked(row[0])) reasons.push('显示词');
      if (CORE.blocked(row[1])) reasons.push('释义');
      return { row: row, blocked: reasons.length > 0, reasons: reasons };
    }
    return {
      letters: Object.keys(words).sort(),
      browse: function (letter) {
        return (letter ? words[letter] || [] : Object.keys(words).sort().reduce(function (all, k) { return all.concat(words[k]); }, []))
          .map(function (row) { return inspect(row); });
      },
      lookup: function (text) {
        activate();
        var hit = CORE.resolveEntry(words, PACK.get(code, 'phrases'), forms, text, PACK.get(code, 'formRanks'), PACK.get(code, 'lookupGuards'));
        var row = hit ? hit.entry : null, kind = hit && hit.kind === 'form' ? '变形' : '词条 / 短语';
        var lemma = hit ? hit.lemma : '';
        var item = row ? inspect(row, text) : null;
        return { item: item, inputBlocked: CORE.blocked(text), kind: kind, lemma: lemma };
      }
    };
  }
  function visible(items, showBlocked) { return items.filter(function (item) { return showBlocked || !item.blocked; }); }
  function sample(items, count) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy.slice(0, count);
  }
  root.LEXICON_PICKER = { open: open, visible: visible, sample: sample };
  if (!root.document) return; // model checks use the real product scripts without a DOM
  var $ = function (id) { return root.document.getElementById(id); };
  var model = null, items = [], page = 0, mode = 'browse', serial = 0, queryInfo = null;
  var loader = PACK && PACK.loader({ inject: function (url) {
    return new Promise(function (resolve, reject) {
      var script = root.document.createElement('script');
      script.src = '../../app/' + url.replace(/^\.\//, '');
      script.onload = function () { script.remove(); resolve(); };
      script.onerror = function () { script.remove(); reject(new Error('加载失败')); };
      root.document.body.appendChild(script);
    });
  } });
  function text(tag, value, parent, className) {
    var node = root.document.createElement(tag); node.textContent = value;
    if (className) node.className = className;
    parent.appendChild(node); return node;
  }
  function enabled(ok) {
    ['lookup', 'browse', 'random', 'initial', 'show-blocked', 'previous', 'next'].forEach(function (id) { $(id).disabled = !ok; });
  }
  function render() {
    if (!model) return;
    var filtered = visible(items, $('show-blocked').checked), hidden = items.length - filtered.length;
    var pages = Math.ceil(filtered.length / 24); page = Math.max(0, Math.min(page, pages - 1));
    var shown = filtered.slice(page * 24, (page + 1) * 24); $('results').textContent = '';
    shown.forEach(function (item) {
      var card = root.document.createElement('article'); card.className = 'card' + (item.blocked ? ' blocked' : '');
      text('h2', item.row[0], card);
      text('p', item.row[1], card);
      if (item.row[2]) text('p', '冠词：' + item.row[2], card);
      if (item.row[3]) text('p', '注释：' + item.row[3], card);
      text('p', item.blocked ? '屏蔽命中：' + item.reasons.join('、') : '屏蔽检查通过', card, 'tag');
      if (queryInfo && queryInfo.lemma) text('p', '原形：' + queryInfo.lemma, card, 'note');
      $('results').appendChild(card);
    });
    var label = mode === 'lookup' ? '查询' : mode === 'random' ? '随机样本' : '词库浏览';
    $('status').textContent = label + ' · ' + filtered.length + ' 条可见 · ' + hidden + ' 条隐藏' +
      (queryInfo ? ' · ' + (queryInfo.item ? queryInfo.kind : '没有查到词条') + (queryInfo.inputBlocked ? ' · 输入命中屏蔽器' : '') : '');
    if (!shown.length) text('p', '没有可显示的结果。可修改查询或开启屏蔽结果检查。', $('results'));
    $('page').textContent = pages ? (page + 1) + ' / ' + pages : '0 / 0';
    $('previous').disabled = page === 0; $('next').disabled = page + 1 >= pages;
  }
  function run(nextMode) {
    if (!model) return;
    mode = nextMode; page = 0; queryInfo = null;
    if (mode === 'lookup') {
      var query = $('query').value.trim();
      if (!query) { mode = 'browse'; items = model.browse($('initial').value); }
      else { queryInfo = model.lookup(query); items = queryInfo.item ? [queryInfo.item] : []; }
    } else {
      items = model.browse($('initial').value);
      if (mode === 'random') items = sample(visible(items, $('show-blocked').checked), 24);
    }
    render();
  }
  async function load() {
    var my = ++serial, code = $('language').value;
    model = null; items = []; queryInfo = null; enabled(false); $('results').textContent = ''; $('page').textContent = '';
    $('status').textContent = '正在加载语言包和屏蔽器…';
    try {
      if (!loader) throw new Error('公共脚本不可用');
      var result = await loader.load(code, code === 'en' ? ['rules', 'block', 'words', 'phrases'] : ['rules', 'block', 'words']);
      if (my !== serial || result.stale) return;
      if (!result.ok) throw new Error('未加载：' + result.failed.join('、'));
      model = open(code); $('initial').textContent = ''; text('option', '全部', $('initial')).value = '';
      model.letters.forEach(function (key) { text('option', key.toUpperCase(), $('initial')).value = key; });
      enabled(true); run($('query').value.trim() ? 'lookup' : 'browse');
    } catch (error) {
      if (my !== serial) return;
      model = null; enabled(false); $('status').textContent = '已停止展示：' + error.message + '。请重新选择语言重试。';
    }
  }
  $('language').addEventListener('change', load);
  $('controls').addEventListener('submit', function (event) { event.preventDefault(); run('lookup'); });
  $('browse').addEventListener('click', function () { run('browse'); });
  $('initial').addEventListener('change', function () { run('browse'); });
  $('random').addEventListener('click', function () { run('random'); });
  $('show-blocked').addEventListener('change', function () { if (mode === 'random') run('random'); else { page = 0; render(); } });
  $('previous').addEventListener('click', function () { page--; render(); });
  $('next').addEventListener('click', function () { page++; render(); });
  load();
})(window);
