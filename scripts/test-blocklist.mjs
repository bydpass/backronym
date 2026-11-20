// 屏蔽器自检：该拦的拦住，正常词不误伤。`npm test`
import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window = {};
for (const f of ["block/core.js", "lang/en/block.js"]) new Function(fs.readFileSync(new URL("../app/assets/" + f, import.meta.url), "utf8"))();
const { hit } = window.BLOCK;

for (const s of ["Fucking", "PORNHUB", "sex", "加我微信", "vx: abc", "13812345678", "傻逼", "毒品，药物", "性爱", "rape", "sodomy", "生殖器",
  // 绕过写法：全角、逐字母隔开、复合词、汉字/数字间插空格
  "ｓｅｘ", "ＦＵＣＫ", "１３８１２３４５６７８", "s e x", "f.u.c.k", "motherfucker", "bullshit", "傻 逼", "微 信", "138 1234 5678", "加wx"])
  assert.equal(hit(s), true, `应拦截：${s}`);
for (const s of ["lust", "lusts", "色欲", "life", "class", "assess", "assassin", "grape", "Scunthorpe", "Sussex", "操作", "体操",
  "打赌", "药物", "威信", "操场", "废物", "selfie", "emoji", "gamble", "casino", "赌博", "爱情", "LOL IDK", "总之 这里有四种情况", "", undefined,
  // 归一化后不能误伤
  "I had a bad day", "new xbox", "2024-10-06", "a b c", "sniggering", "niggling", "unicorn", "Monday", "逝去，死", "肤色，情况", "皮带扣，扣子"])
  assert.equal(hit(s), false, `不应拦截：${s}`);

// v00.02.01 T01：用户确认的 20 个整词（送审表 A 组去掉 erotic），含大小写、全角、拆字写法
const T01 = ["lovemaking", "adultery", "brothel", "indecent", "lewd", "libido", "masturbate", "masturbation", "molester",
  "obscenity", "orgasm", "pimp", "ponce", "prostitute", "prostitution", "raunchy", "semen", "willy", "pedophile", "incest"];
for (const w of T01) assert.equal(hit(w), true, `应拦截：${w}`);
for (const s of ["Lovemaking", "ＯＲＧＡＳＭ", "p i m p", "l.e.w.d"]) assert.equal(hit(s), true, `应拦截：${s}`);
// 放行：送审表 B 组（用户决定不拦）、erotic，以及 C 组「不该误伤」
for (const s of ["erotic", "naked", "nakedness", "nudity", "sexual", "sexuality", "seduction", "sensuality", "voluptuous", "hardcore",
  "orgy", "fetish", "kinky", "pervert", "perverted", "extramarital", "intercourse", "condom", "sperm", "topless", "stripper", "bondage",
  "playboy", "hooker", "erection", "escort",
  "love", "lovely", "lover", "romance", "romantic", "kiss", "breast", "private", "woman", "female", "male", "john", "goose", "tart",
  "stew", "spicy", "naughty", "nasty", "blue", "filth", "cheeky", "potent", "conversation", "ardor", "mammogram", "mastectomy",
  "testosterone", "circumcise", "heterosexual", "homosexuality",
  // 整词命中：含被拦词字母的其他词不受影响
  "pimple", "willow", "semenya", "lewdness aside"])
  assert.equal(hit(s), false, `不应拦截：${s}`);

// v00.03.00 T02 唯一的有意变化（不属于「行为不变」）：归一化去变音符。以前这些写法会被变音符拆成几段、漏过
for (const s of ["sëx", "fück", "pórn", "nazí", "Sëxy"]) assert.equal(hit(s), true, `T02 有意变化，应拦截：${s}`);
// 去变音符后不误伤常见带变音符的普通词
for (const s of ["naïve", "café", "déjà vu", "señor", "über", "façade", "Zoë", "Øresund"]) assert.equal(hit(s), false, `T02 不应拦截：${s}`);

// v00.03.00 T23：西文五语的屏蔽词表（scripts/build-block.mjs 生成）。政策（用户 11-09「少误伤」，裁定在 review/lexicon/block-review.tsv）：
// 明确的性辱骂、露骨色情、仇恨蔑称拦；轻度贬义、一般粗话与负面词、医学词、有常用普通义的同形词不拦
for (const l of ["fr", "de", "es", "it", "la"]) new Function(fs.readFileSync(new URL("../app/assets/lang/" + l + "/block.js", import.meta.url), "utf8"))();
const WEST = {
  fr: { hit: ["Enculé", "putain", "salope", "pédé", "nègre", "P U T A I N"], pass: ["merde", "avare", "idiot", "maison", "école", "bander", "caca",
    "baiser", "chatte", "pédale"] }, // 同形保护：吻、母猫、踏板
  de: { hit: ["ficken", "Hurensohn", "Schlampe", "Neger"], pass: ["scheiße", "Arschloch", "nackt", "doof", "Haus", "über", "Mufti"] },
  es: { hit: ["joder", "puta", "follar", "maricón"], pass: ["mierda", "asesinato", "infierno", "avaro", "casa", "año",
    "cono", "coño", "concha", "polla"] }, // cono（圆锥）与 coño 归一后同形，保普通义；贝壳、小母鸡
  it: { hit: ["cazzo", "puttana", "frocio", "fanculo"], pass: ["merda", "stronzo", "cadavere", "matto", "casa", "città", "finocchio", "sega", "bocchino"] }, // 茴香、锯、烟嘴
  la: { hit: ["Verpa", "pedico", "irrumō"], pass: ["cūlus", "stultus", "nihilo", "rosa", "amō", "muto", "sopio"] }, // 改变、使入睡
};
for (const [l, t] of Object.entries(WEST)) {
  assert.ok(window.BLOCK.has(l), l + " 词表已注册");
  for (const s of t.hit) assert.equal(hit(s, l), true, `${l} 应拦截：${s}`);
  for (const s of t.pass) assert.equal(hit(s, l), false, `${l} 不应拦截：${s}`);
  assert.equal(hit("加我微信", l), true, l + "：中文与导流规则各语言都生效");
}
// 成品与裁定表逐条一致：每一行的「用户裁定」就是该语种整词名单的结论（表里没裁定的行按生成规则，不在这里核）
{
  const lines = fs.readFileSync(new URL("../review/lexicon/block-review.tsv", import.meta.url), "utf8").split("\n").filter(Boolean);
  const head = lines[0].split("\t"), iR = head.indexOf("用户裁定（拦 / 不拦）");
  let n = 0;
  for (const l of lines.slice(1)) {
    const c = l.split("\t"), v = (c[iR] || "").trim();
    if (v !== "拦" && v !== "不拦") continue;
    assert.equal(hit(c[1], c[0]), v === "拦", `裁定表 ${c[0]} / ${c[1]}：${v}`); n++;
  }
  assert.ok(n >= 1186, "裁定表的行都核过：" + n);
}
assert.equal(hit("putain", "en"), false, "词表按语言隔离：法语的词在英语作品里不拦"); assert.equal(hit("putain", "es"), false);
// 生成规则（纯函数）：审核判不雅 + 第二依据才拦；种子里审过没判不雅的放行；不在候选表的种子照拦
{
  const { blockList } = await import("./build-block.mjs");
  const { keyOf } = await import("./lexicon/review.mjs");
  const row = (w, flags, zh) => ({ "词": w, "显示": w, "词性": "noun", "标记": flags, "中文释义": zh || "x" });
  const apply = new Map([[keyOf("merde", "merde", "noun"), { "标记": "不雅" }], [keyOf("avare", "avare", "noun"), { "标记": "不雅" }], [keyOf("bon", "bon", "noun"), { "标记": "（清除）" }], [keyOf("Zoé", "Zoé", "noun"), { "标记": "不雅" }]]);
  const b = blockList([row("merde", "不雅候选"), row("avare", ""), row("bon", "不雅候选"), row("infierno", "LDNOOBW待判"), row("Zoé", "不雅候选")], apply, ["infierno", "pédé", "blow job", "merde"]);
  assert.deepEqual(b.words, ["merde", "pede", "zoe"], "写法归一；短语不收；审过放行的 infierno、清除标记的 bon、只有审核判定的 avare 不拦");
  assert.deepEqual([b.cleared, b.reviewOnly], [["infierno"], ["avare"]]);
  // V003-B4-R1：合并审核后候选表里的临时标记被撤掉、标记换成最终结论；第二依据改读「原始依据」列，词表不变
  const after = (w, flags, ev) => ({ "词": w, "显示": w, "词性": "noun", "标记": flags, "中文释义": "x", "原始依据": ev });
  const b2 = blockList([after("merde", "不雅", "维基词典标签"), after("avare", "不雅", ""), after("bon", "", "维基词典标签"), after("infierno", "", "LDNOOBW"), after("Zoé", "不雅", "维基词典标签")], new Map(), ["infierno", "pédé", "blow job", "merde"]);
  assert.deepEqual([b2.words, b2.cleared, b2.reviewOnly], [b.words, b.cleared, b.reviewOnly], "合并前（临时标记）与合并后（原始依据列）生成同一份词表");
  assert.deepEqual(b2.table, b.table, "送审表的依据也相同");
  assert.deepEqual(blockList([after("merde", "不雅候选 不雅", "")], new Map(), []).words, [], "有「原始依据」列就只认它：列为空时不拿残留的临时标记当依据");
  { // 整链：生成的词条 → mergeEntry 合并审核（撤掉临时标记）→ 写成候选表的行 → 词表，与合并前相同
    const { mergeEntry } = await import("./lexicon/review.mjs");
    const gen = [{ w: "merde", flags: ["不雅候选"], evidence: ["维基词典标签"], ov: { "标记": "不雅" } }, { w: "joder", flags: ["LDNOOBW待判"], evidence: ["LDNOOBW"], ov: { "标记": "不雅" } }, { w: "bon", flags: ["不雅候选"], evidence: ["维基词典标签"], ov: { "标记": "（清除）" } }];
    const toRow = (e) => ({ "词": e.lemma, "显示": e.disp, "词性": e.pos, "标记": e.flags.join(" "), "中文释义": e.zh.join("，"), "原始依据": (e.evidence || []).join(" ") });
    const E0 = (g) => ({ lemma: g.w, disp: g.w, pos: "noun", zh: ["x"], flags: g.flags.slice(), evidence: g.evidence, rec: { w: g.w, tags: [], head: [g.w], gl: [] }, gender: "", art: "" });
    const pre = blockList(gen.map((g) => { const r = toRow(E0(g)); delete r["原始依据"]; return r; }), new Map(gen.map((g) => [keyOf(g.w, g.w, "noun"), g.ov])), []);
    const merged = gen.map((g) => mergeEntry("es", E0(g), g.ov));
    assert.ok(merged.every((e) => !e.flags.includes("不雅候选") && !e.flags.includes("LDNOOBW待判")), "合并后临时标记确实被撤掉");
    assert.deepEqual(blockList(merged.map(toRow), new Map(), []).words, pre.words); assert.deepEqual(pre.words, ["joder", "merde"]);
  }
  // 用户裁定优先
  const b3 = blockList([row("merde", "不雅候选"), row("avare", "")], apply, ["pédé"], new Map([["merde", "不拦"], ["avare", "拦"], ["pede", "不拦"], ["libre", "拦"]]));
  assert.deepEqual([b3.words, b3.ruled], [["avare", "libre"], { 拦: ["avare", "libre"], 不拦: ["merde", "pede"] }]);
  // V003-B4-R2：送审表归作者。已有的行一个字不改（含作者加的列、退出清单的旧行），只追加新词
  const { mergeSheet, readSheet, SHEET_HEAD } = await import("./build-block.mjs");
  const mine = [SHEET_HEAD.concat(["备注"]).join("\t"), "fr\tmerde\t人工中文\t人工依据\t拦\t不拦\t作者备注", "fr\tvieux\t旧\t审核判不雅\t拦\t拦\t已退出清单", "de\tdoof\t笨\t审核判不雅\t不拦\t\t"].join("\n") + "\n";
  const m = mergeSheet(mine, { fr: [["avare", "吝啬鬼", "审核判不雅", "不拦"], ["merde", "屎", "审核判不雅+维基词典标签", "拦"]] });
  assert.ok(m.text.startsWith(mine), "已有内容逐字节保留：人工中文、依据、裁定、备注列、退出清单的旧行、别的语种");
  assert.equal(m.text.slice(mine.length), "fr\tavare\t吝啬鬼\t审核判不雅\t不拦\t\t\n", "新词按现有表头追加，作者的列留空");
  assert.deepEqual([m.added, m.retired], [1, 1], "退出清单的旧行保留并报数（只数这次生成的语种）");
  assert.equal(mergeSheet(m.text, { fr: [["avare", "x", "y", "拦"]] }).text, m.text, "重跑不变");
  assert.deepEqual([...readSheet(mine).rulings], [["fr\tmerde", "不拦"], ["fr\tvieux", "拦"]], "只认「拦 / 不拦」，空着的不算裁定");
  assert.equal(mergeSheet("", { fr: [["a", "甲", "审核判不雅", "不拦"]] }).text, SHEET_HEAD.join("\t") + "\nfr\ta\t甲\t审核判不雅\t不拦\t\n", "没有表时新建");
  assert.throws(() => mergeSheet("词\t裁定\nmerde\t拦\n", { fr: [] }), /无法对齐/, "对不上列就报错，不覆盖");
}

console.log("blocklist ok");
