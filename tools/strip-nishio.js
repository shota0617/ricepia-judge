#!/usr/bin/env node
// にしおさんぽGO の 配る 用の コピーを 作る（サイクル215）：コメント だけ を ぬく。動きは 1字も 変えない
//   node tools/strip-nishio.js            nishio-go/{pixel,game,meiro}.js・style.css → nishio-go/min/ に 作り直す
//   node tools/strip-nishio.js --check    置いて ある コピーが 元から 作り直した ものと 1字も ちがわないか（ちがえば 終了コード 1）
//   node tools/strip-nishio.js --check --index     git に ステージした 中身どうしで 確かめる（コミットの 前の 見はり）
//   node tools/strip-nishio.js --check --rev=HEAD  コミットの 中身どうしで 確かめる（push の 前の 見はり）
// きまり：
//   ・行の 数と 改行の 位置は 保つ（コメントだけの 行は 空行・行の おわりの コメントは 消す）。エラーの 行番号が 元の ファイルと そろう
//   ・文字列・テンプレート（入れ子の ${}）・正規表現の 中は さわらない。正規表現か 割り算か 決められない「/」に 出会ったら、
//     その ファイルの のこりは コメントも ぬかずに そのまま 写す（あやしい 所は のこす）
//   ・/*! … */（ライセンス）・//# sourceMappingURL・/*@ … */ は のこす
//   ・CSS は nishio-go/min/ に 置くので、相対の url(…) の 前に ../ を つけて、同じ 絵を 指す ように する
//   ・Node だけで 動く（npm の 部品は 使わない）
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['pixel.js', 'game.js', 'meiro.js', 'style.css'];
const SRC = f => `nishio-go/${f}`, OUT = f => `nishio-go/min/${f}`;

const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const KW_PAREN = new Set(['if', 'while', 'for', 'with']);
const isIdChar = c => /[A-Za-z0-9_$\u0080-￿]/.test(c);
const keepComment = t => t.startsWith('/*!') || t.startsWith('/*@') || /^\/\/[#@]\s*source(Mapping)?URL=/.test(t);

// JS を 字句に 分けて、コメントの 範囲 [start, end) を 返す。決められない 所に 来たら stopAt に その 位置
function jsComments(s) {
  const out = [];
  let i = 0, n = s.length;
  let prev = null;          // 直前の 意味の ある 字句 { t: 'id'|'num'|'str'|'re'|'tpl'|'p', v }
  const stack = [];          // '{' の 種類：'b'（ふつうの かっこ）／'t'（テンプレートの ${）
  const parens = [];         // '(' の 前が if/while/for/with か
  let stopAt = -1;
  const regexOk = () => {
    if (!prev) return true;
    if (prev.t === 'num' || prev.t === 'str' || prev.t === 're' || prev.t === 'tpl') return false;
    if (prev.t === 'id') return KW_BEFORE_REGEX.has(prev.v);
    if (prev.v === ')') return prev.kw === true ? true : prev.kw === false ? false : null;
    if (prev.v === ']') return false;
    if (prev.v === '}') return null;   // かたまりの おわりか オブジェクトの おわりか 決められない
    if (prev.v === '++' || prev.v === '--') return null;
    return true;
  };
  // テンプレートの 文字の 部分を 読む（i は ` か } の つぎ）。おわりの ` で もどるか、${ で コードへ
  function tplChars() {
    while (i < n) {
      const c = s[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; prev = { t: 'tpl' }; return; }
      if (c === '$' && s[i + 1] === '{') { i += 2; stack.push('t'); prev = { t: 'p', v: '${' }; return; }
      i++;
    }
    throw new Error('テンプレートが 閉じない');
  }
  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿' || c === ' ' || c === ' ') { i++; continue; }
    if (c === '/' && s[i + 1] === '/') {
      let j = i + 2; while (j < n && s[j] !== '\n' && s[j] !== '\r' && s[j] !== ' ' && s[j] !== ' ') j++;
      out.push([i, j]); i = j; continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const j = s.indexOf('*/', i + 2); if (j < 0) throw new Error('コメントが 閉じない');
      out.push([i, j + 2]); i = j + 2; continue;
    }
    if (c === '<' && s.startsWith('<!--', i)) { stopAt = i; break; }   // HTML ふうの コメントは 見分けない
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && s[j] !== c) { if (s[j] === '\\') j++; else if (s[j] === '\n') throw new Error('文字列が 行で 切れる ' + i); j++; }
      i = j + 1; prev = { t: 'str' }; continue;
    }
    if (c === '`') { i++; tplChars(); continue; }
    if (c === '/') {
      const ok = regexOk();
      if (ok === null) { stopAt = i; break; }
      if (ok) {
        let j = i + 1, cls = false;
        for (; j < n; j++) {
          const d = s[j];
          if (d === '\n' || d === '\r') { j = -1; break; }
          if (d === '\\') { j++; continue; }
          if (cls) { if (d === ']') cls = false; continue; }
          if (d === '[') cls = true; else if (d === '/') break;
        }
        if (j < 0 || j >= n) { stopAt = i; break; }
        j++; while (j < n && /[A-Za-z]/.test(s[j])) j++;
        i = j; prev = { t: 're' }; continue;
      }
      i++; if (s[i] === '=') i++; prev = { t: 'p', v: '/' }; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && (/[0-9A-Za-z_.]/.test(s[j]) || ((s[j] === '+' || s[j] === '-') && /[eE]/.test(s[j - 1]) && !/^0[xX]/.test(s.slice(i, j))))) j++;
      i = j; prev = { t: 'num' }; continue;
    }
    if (isIdChar(c) || c === '\\' || c === '#') {
      let j = i + 1; while (j < n && (isIdChar(s[j]) || s[j] === '\\')) j++;
      const v = s.slice(i, j);
      // a.return / a?.of などの プロパティ名は キーワードと しない
      const dot = prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.');
      prev = { t: 'id', v: dot ? '' : v }; i = j; continue;
    }
    // 記号
    if (c === '{') { stack.push('b'); prev = { t: 'p', v: '{' }; i++; continue; }
    if (c === '}') {
      const k = stack.pop();
      if (k === 't') { i++; tplChars(); continue; }
      if (k === undefined) throw new Error('} が 多い ' + i);
      prev = { t: 'p', v: '}' }; i++; continue;
    }
    if (c === '(') { parens.push(!!(prev && prev.t === 'id' && KW_PAREN.has(prev.v))); prev = { t: 'p', v: '(' }; i++; continue; }
    if (c === ')') { const kw = parens.pop(); prev = { t: 'p', v: ')', kw }; i++; continue; }
    if ((c === '+' || c === '-') && s[i + 1] === c) { prev = { t: 'p', v: c + c }; i += 2; continue; }
    if (c === '?' && s[i + 1] === '.' && !/[0-9]/.test(s[i + 2] || '')) { prev = { t: 'p', v: '?.' }; i += 2; continue; }
    if (c === '=' && s[i + 1] === '>') { prev = { t: 'p', v: '=>' }; i += 2; continue; }
    prev = { t: 'p', v: c }; i++;
  }
  if (stopAt < 0 && stack.length) throw new Error('かっこが 閉じない');
  return { comments: out, stopAt };
}

// CSS：コメントの 範囲と、相対の url(…) の 中身の 範囲
function cssScan(s) {
  const comments = [], urls = [];
  let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {
      const j = s.indexOf('*/', i + 2); if (j < 0) throw new Error('CSS の コメントが 閉じない');
      comments.push([i, j + 2]); i = j + 2; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1; while (j < n && s[j] !== c) { if (s[j] === '\\') j++; j++; }
      i = j + 1; continue;
    }
    if ((c === 'u' || c === 'U') && /^url\(/i.test(s.slice(i, i + 4)) && !/[A-Za-z0-9_-]/.test(s[i - 1] || '')) {
      let j = i + 4; while (/\s/.test(s[j])) j++;
      let a, b, end;
      if (s[j] === '"' || s[j] === "'") {
        const q = s[j]; a = j + 1; b = a; while (b < n && s[b] !== q) { if (s[b] === '\\') b++; b++; }
        end = s.indexOf(')', b);
      } else { a = j; b = s.indexOf(')', j); end = b; }
      urls.push([a, b]); i = end + 1; continue;
    }
    i++;
  }
  return { comments, urls };
}

// コメントを ぬく。行の 数と 改行の 位置は 保つ。
// 行末の 空白は、ぬいた コメントの すぐ 前・すぐ あと（行の おわり まで）だけ けずる。そこは かならず コードの 中の 空白で、
// 文字列・テンプレートの 中では ない（コメントは コードの 中で しか 見つけない ので）
function strip(s, ranges, stopAt) {
  const parts = [];   // 長い 文字列を 毎回 つなぎ直さない（つなぐのは さいごに 1回）
  const trimEnd = () => {   // うしろの 空白・タブを けずる（改行の 手前まで）
    while (parts.length) {
      const t = parts[parts.length - 1].replace(/[ \t]+$/, '');
      if (t === '') { parts.pop(); continue; }
      parts[parts.length - 1] = t; break;
    }
  };
  const lastChar = () => { for (let k = parts.length - 1; k >= 0; k--) if (parts[k]) return parts[k].slice(-1); return ''; };
  let last = 0;
  for (const [a, b] of ranges) {
    if (stopAt >= 0 && a >= stopAt) break;
    const t = s.slice(a, b);
    if (keepComment(t)) continue;
    parts.push(s.slice(last, a));
    last = b;
    const nl = t.match(/\r\n|\n|\r|\u2028|\u2029/g) || [];
    const m = /^[ \t]*(?=\r|\n|$)/.exec(s.slice(b, b + 4096));
    if (m) {   // コメントの あとは 行の おわり：前の 空白と あとの 空白を けずる
      trimEnd();
      last = b + m[0].length;
      parts.push(nl.join(''));
    } else if (nl.length) {
      parts.push(nl.join(''));   // 行を またぐ コメントは 改行だけ のこす（ASI の 区切りも 保つ）
    } else {
      // 前後が 空白・行の はし で なければ 1字の 空白を 入れて、字句が くっつかない ように
      const before = lastChar(), after = s[b];
      if (before && !/\s/.test(before) && !/\s/.test(after)) parts.push(' ');
    }
  }
  parts.push(s.slice(last));
  return parts.join('');
}

function stripJs(src) {
  const { comments, stopAt } = jsComments(src);
  return { text: strip(src, comments, stopAt), stopAt, count: comments.length };
}

function stripCss(src) {
  const { comments, urls } = cssScan(src);
  // まず url を 書きかえる（位置が ずれない ように うしろ から）。範囲は 元の 位置なので、コメントの 中の url は 対象外
  const inComment = p => comments.some(([a, b]) => p >= a && p < b);
  let s = src; const shifts = [];
  for (const [a, b] of urls.slice().reverse()) {
    if (inComment(a)) continue;
    const u = src.slice(a, b);
    if (/^(data:|[a-z][a-z0-9+.-]*:|\/|#|%23)/i.test(u) || u === '') continue;
    s = s.slice(0, a) + '../' + u + s.slice(b);
    shifts.push(a);
  }
  // コメントの 範囲を 書きかえた あとの 位置に 直す
  const adj = p => p + 3 * shifts.filter(x => x < p).length;
  const cm = comments.map(([a, b]) => [adj(a), adj(b)]);
  return { text: strip(s, cm, -1), stopAt: -1, count: comments.length };
}

function build(f, src) { return f.endsWith('.css') ? stripCss(src) : stripJs(src); }

function readSrc(f, mode) {
  if (mode.index) return execFileSync('git', ['show', `:${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (mode.rev) return execFileSync('git', ['show', `${mode.rev}:${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  return fs.readFileSync(path.join(ROOT, f), 'utf8');
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const rev = (args.find(a => a.startsWith('--rev=')) || '').slice(6);
  const mode = { index: args.includes('--index'), rev };
  const quiet = args.includes('--quiet');
  let bad = [];
  for (const f of FILES) {
    let src, want;
    try { src = readSrc(SRC(f), mode); } catch (e) { bad.push(`${SRC(f)} が 読めない`); continue; }
    const r = build(f, src);
    want = r.text;
    if (r.stopAt >= 0 && !quiet) {
      const line = src.slice(0, r.stopAt).split('\n').length;
      console.error(`⚠ ${SRC(f)}:${line} から 先は 見分けに 自信が ないので コメントも のこした`);
    }
    if (check) {
      let have = null;
      try { have = readSrc(OUT(f), mode); } catch (e) { /* 無い */ }
      if (have !== want) bad.push(have === null ? `${OUT(f)} が 無い` : `${OUT(f)} が ${SRC(f)} と あって いない`);
    } else {
      fs.mkdirSync(path.join(ROOT, 'nishio-go/min'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, OUT(f)), want);
      if (!quiet) console.log(`${OUT(f)}：${Buffer.byteLength(src)} → ${Buffer.byteLength(want)} バイト（コメント ${r.count}）`);
    }
  }
  if (bad.length) {
    for (const b of bad) console.error(`✖ ${b}`);
    console.error('作り直す：node tools/strip-nishio.js && git add nishio-go/min');
    process.exit(1);
  }
  if (check && !quiet) console.log('ok：nishio-go/min の 4つ は 元と あって いる');
}

if (require.main === module) main();
module.exports = { jsComments, cssScan, stripJs, stripCss, FILES };
