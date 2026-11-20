// 第三次词库重建选词脚本 rank.py 的份额拆分测试（复审 R3-20-T）。测试本体是 Python（要直接调 rank.py 的函数），这里只负责调起。
// -I 隔离用户环境与当前目录，-B 不写 __pycache__。样本是合成的，不读 scripts/.cache。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
// rank.py 一导入就要读旧选词脚本 select.py 及其同目录的表；公开快照不带那个目录（rank.py 在那里本来也跑不了），缺了就跳过并说明
if(!fs.existsSync('review/lexicon-rebuild-20261118/select.py')){console.log('rank.py 份额拆分：跳过（没有 review/lexicon-rebuild-20261118/select.py，公开快照属此情况）');process.exit(0);}
const r=spawnSync('python3',['-I','-B','scripts/lexicon3/test_split.py'],{encoding:'utf8'});
assert.equal(r.error,undefined,'跑不起 python3：'+(r.error&&r.error.message));
assert.equal(r.status,0,'rank.py 份额拆分测试失败：\n'+r.stdout+r.stderr);
process.stdout.write(r.stdout);
