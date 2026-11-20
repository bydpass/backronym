/* 英语屏蔽词表（v00.03.00 T02 从原 blocklist.js 拆出，内容不变）。归一化、中文、导流与命中接口在 block/core.js，须先加载。 */
window.BLOCK.add("en", {
  // 整词命中（不做子串，避免 class/assess 被 ass 误伤）
  words: ["sex", "sexy", "rape", "raped", "rapist", "ravish", "seduce", "obscene", "horny",
    "nude", "penis", "vagina", "boob", "boobs", "ass", "dick", "cock", "pussy", "cunt", "whore", "slut",
    "bastard", "fag", "faggot", "retard", "heroin", "cocaine", "opium", "meth", "marijuana", "cannabis",
    "suicide", "kys", "terrorist", "massacre", "carnage", "holocaust",
    // 词库扩到 2.2 万词后新增的
    "sodomy", "bugger", "ejaculate", "genital", "genitals", "testicle", "testicles", "pubic", "vaginal",
    "nipple", "nipples",
    // v00.02.01 T01（2026-11-04 用户确认送审表 A 组；erotic 与 B 组放行）
    "lovemaking", "adultery", "brothel", "indecent", "lewd", "libido", "masturbate", "masturbation", "molester",
    "obscenity", "orgasm", "pimp", "ponce", "prostitute", "prostitution", "raunchy", "semen", "willy",
    "pedophile", "incest"],
  // 词中任意位置命中（motherfucker / bullshit 这类复合写法）
  any: ["fuck", "shit", "bitch", "porn"],
  // 前缀命中（放进词中会误伤，如 sniggering）
  prefix: ["nigger", "nigga", "asshole", "nazi"] // 不用 nigg：会误伤 niggling（琐碎的）
});
