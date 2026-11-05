// index.html のロジック部分をそのまま読み込んで検査する: node test-bracket.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const code = html.split('/*LOGIC-START*/')[1].split('/*LOGIC-END*/')[0];
const ctx = { crypto: require('crypto').webcrypto, Uint32Array, Math, Set, Array };
vm.createContext(ctx);
vm.runInContext(code + '\nthis.api={parseNames,findDuplicates,tableLabel,roundShape,buildBracket,sameSourcePairs,resolveRef,pruneResults,rematchesInTable,extractColors,buildPalettes,themeFrom,contrastRatio};', ctx);
const { parseNames, findDuplicates, tableLabel, roundShape, buildBracket, sameSourcePairs, resolveRef, pruneResults, rematchesInTable, extractColors, buildPalettes, themeFrom, contrastRatio } = ctx.api;

// 配色: 白地に赤と青のロゴから、白より赤・青を優先して拾う
{
  const px = [];
  const push = (r, g, b, a, n) => { for (let i = 0; i < n; i++) px.push(r, g, b, a); };
  push(255, 255, 255, 255, 800);
  push(200, 30, 30, 255, 150);
  push(30, 60, 180, 255, 50);
  push(0, 255, 0, 0, 500); // 透明は無視
  const colors = Array.from(extractColors(px));
  assert.ok(colors.length >= 2 && colors.length <= 5, colors.join());
  assert.ok(!colors.includes('#00ff00'));
  const [r0, g0] = [parseInt(colors[0].slice(1, 3), 16), parseInt(colors[0].slice(3, 5), 16)];
  assert.ok(r0 > 150 && g0 < 80, `先頭は赤: ${colors[0]}`);
  assert.strictEqual(Array.from(extractColors([0, 0, 0, 0])).length, 0);
  assert.strictEqual(Array.from(buildPalettes([])).length, 0);
  assert.strictEqual(Array.from(buildPalettes(['#112233'])).length, 3);
}

// どんな色でも文字が読める: 黄色や白のロゴでも、ヘッダー白文字・卓見出し・ボタンの濃さを保つ
for (const main of ['#ffff00', '#ffffff', '#000000', '#c81e1e', '#00ffff', '#808080']) {
  for (const deep of [false, true]) {
    const t = themeFrom({ main, accent: main, deep });
    assert.ok(contrastRatio(t.felt, '#ffffff') >= 4.5, `felt ${main}`);
    assert.ok(contrastRatio(t.felt, t.feltSoft) >= 4.5, `felt/soft ${main}`);
    assert.ok(contrastRatio(t.accent, '#ffffff') >= 4.5, `accent ${main}`);
    assert.ok(contrastRatio(t.onBg, t.bgFrom) >= 4.5, `onBg/from ${main} deep=${deep}`);
    assert.ok(contrastRatio(t.onBg, t.bgTo) >= 4.5, `onBg/to ${main} deep=${deep}`);
    assert.ok(contrastRatio(t.onBgMuted, t.bgFrom) >= 4.5, `muted/from ${main} deep=${deep}`);
    assert.ok(contrastRatio(t.onBgMuted, t.bgTo) >= 4.5, `muted/to ${main} deep=${deep}`);
  }
}

// 入力まわり
assert.deepStrictEqual([...parseNames('田中\r\n\r\n 佐藤 太郎 \n鈴木\t高橋,伊藤　\n')], ['田中', '佐藤 太郎', '鈴木', '高橋', '伊藤']);
assert.deepStrictEqual([...findDuplicates(['a', 'b', 'a'])], ['a']);
assert.strictEqual(tableLabel(0), 'A');
assert.strictEqual(tableLabel(25), 'Z');
assert.strictEqual(tableLabel(26), 'AA');
assert.throws(() => buildBracket(3));

function sources(table) {
  return table.slots.map(s => (s.r === undefined ? `p${s.p}` : `${s.r}-${s.t}`));
}

// 4〜64人の全人数
const forced = [];
const slowest = { ms: 0, n: 0 };
for (let n = 4; n <= 64; n++) {
  const t0 = Date.now();
  const rounds = buildBracket(n);
  const ms = Date.now() - t0;
  if (ms > slowest.ms) { slowest.ms = ms; slowest.n = n; }

  // 1回戦: 全員ちょうど1回
  const seen = [];
  rounds[0].tables.forEach(t => t.slots.forEach(s => seen.push(s.p)));
  rounds[0].byes.forEach(s => seen.push(s.p));
  assert.deepStrictEqual(seen.slice().sort((a, b) => a - b), [...Array(n).keys()], `n=${n} 1回戦`);

  // 決勝は1卓・シードなし
  const final = rounds[rounds.length - 1];
  assert.strictEqual(final.tables.length, 1, `n=${n} 決勝`);
  assert.strictEqual(final.byes.length, 0, `n=${n} 決勝シード`);

  rounds.forEach((round, r) => {
    // 卓サイズは3か4、3人卓は1つまで
    const small = round.tables.filter(t => t.slots.length === 3).length;
    assert.ok(round.tables.every(t => t.slots.length === 3 || t.slots.length === 4), `n=${n} r=${r} 卓サイズ`);
    assert.ok(small <= 1, `n=${n} r=${r} 3人卓`);
    assert.ok(round.byes.length <= 2, `n=${n} r=${r} シード数`);

    if (r === 0) return;
    // 前回の卓の1位2位と前回シードが、過不足なく今回に入る
    const prev = rounds[r - 1];
    const expected = [];
    prev.tables.forEach((_, t) => expected.push(`${r - 1}-${t}-1`, `${r - 1}-${t}-2`));
    prev.byes.forEach(b => expected.push(b.r === undefined ? `p${b.p}` : `${b.r}-${b.t}-${b.rank}`));
    const actual = [];
    round.tables.forEach(t => t.slots.forEach(b => actual.push(b.r === undefined ? `p${b.p}` : `${b.r}-${b.t}-${b.rank}`)));
    round.byes.forEach(b => actual.push(b.r === undefined ? `p${b.p}` : `${b.r}-${b.t}-${b.rank}`));
    assert.deepStrictEqual(actual.slice().sort(), expected.slice().sort(), `n=${n} r=${r} 勝ち上がり`);

    // 再戦確定の卓を記録
    round.tables.forEach(t => {
      const pairs = sameSourcePairs(t);
      if (pairs.length) forced.push({ n, round: r + 1, isFinal: r === rounds.length - 1, pairs: pairs.length, sizes: new Set(sources(t)).size });
    });
  });

  // 2回戦: 同じ1回戦卓の2人が同卓できない理由がない限り、再戦ゼロ
  if (rounds.length > 2) {
    const srcCount = rounds[0].tables.length + rounds[0].byes.length;
    if (srcCount >= 4) {
      rounds[1].tables.forEach(t => {
        assert.strictEqual(sameSourcePairs(t).length, 0, `n=${n} 2回戦で再戦確定 (${JSON.stringify(t.slots)})`);
      });
    }
  }
}

// 要望の形: 16人の2回戦は A1・B2・C1・D2 と A2・B1・C2・D1
const r16 = buildBracket(16);
const seats = Array.from(r16[1].tables, t => Array.from(t.slots, s => `${tableLabel(s.t)}${s.rank}`).sort());
assert.deepStrictEqual(seats, [['A1', 'B2', 'C1', 'D2'], ['A2', 'B1', 'C2', 'D1']]);

// 結果の入力と修正: 2回戦まで進めて1回戦を直すと、いなくなった人の結果だけ消える
{
  const rounds = buildBracket(16);
  const results = {};
  rounds[0].tables.forEach((t, i) => { results[`0-${i}`] = { first: t.slots[0].p, second: t.slots[1].p }; });
  const table = rounds[1].tables[0];
  const members = table.slots.map(s => resolveRef(s, results));
  assert.ok(members.every(m => m !== null));
  assert.strictEqual(rematchesInTable(rounds, results, 1, 0).length, 0);
  results['1-0'] = { first: members[0], second: members[1] };
  const firstRef = table.slots[0];
  results[`0-${firstRef.t}`] = { first: rounds[0].tables[firstRef.t].slots[2].p, second: results[`0-${firstRef.t}`].second };
  assert.strictEqual(pruneResults(rounds, results), 1);
  assert.strictEqual(results['1-0'].first, undefined);
  assert.strictEqual(results['1-0'].second, members[1]);
}

// 3人打ち: 7人なら4人卓+3人卓
assert.deepStrictEqual([...roundShape(7).sizes], [4, 3]);

const byN = {};
forced.forEach(f => { (byN[f.n] = byN[f.n] || []).push(`${f.isFinal ? '決勝' : f.round + '回戦'}×${f.pairs}`); });
const nonFinal = forced.filter(f => !f.isFinal);
console.log('再戦確定が決勝以外で出る人数:', [...new Set(nonFinal.map(f => f.n))].join(','));
console.log(nonFinal.map(f => `n=${f.n} ${f.round}回戦 ${f.pairs}組`).join('\n'));
console.log('最遅', slowest.n, '人', slowest.ms, 'ms');
console.log('OK');
