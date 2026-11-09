// 自定义构建脚本：复刻 @songloft/plugin-builder 的产物结构与哈希算法，
// 但绕开在当前 Windows 环境会 127 崩溃的 cpSync / CLI。
// 产物：dist/speaker-remote.jsplugin.zip（结构与官方 build 完全一致）
import esbuild from 'esbuild';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const { computeEntryHash, computeCanonicalZipHash, sha256Hex } = await import('@songloft/plugin-builder');

const cwd = process.cwd();
const outDir = path.join(cwd, 'dist');
const buildDir = path.join(outDir, '_build');

function sha(buf) { return createHash('sha256').update(buf).digest('hex'); }

// 递归拷贝（避开会崩的 fs.cpSync）
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item), d = path.join(dest, item);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
// 递归收集文件
function walk(dir, base = dir, acc = []) {
  for (const item of fs.readdirSync(dir)) {
    const fp = path.join(dir, item);
    if (fs.statSync(fp).isDirectory()) walk(fp, base, acc);
    else acc.push(path.relative(base, fp).replace(/\\/g, '/'));
  }
  return acc;
}

// 1. 编译后端 main.ts -> _build/main.js
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(cwd, 'src/main.ts')],
  outfile: path.join(buildDir, 'main.js'),
  bundle: true, platform: 'neutral', format: 'iife', target: 'es2020', minify: true,
});
console.log('  ✓ main.js bundled');

// 2. 拷贝 static/ -> _build/static/（staticHash:false，不改名）
const staticSrc = path.join(cwd, 'static');
if (fs.existsSync(staticSrc)) copyDir(staticSrc, path.join(buildDir, 'static'));

// 3. 计算 main.js 内容哈希 + zip 规范哈希
const mainJsContent = fs.readFileSync(path.join(buildDir, 'main.js'));
const entryHash = sha256Hex(mainJsContent);
const zipHash = computeCanonicalZipHash(buildDir);

// 4. 写最终 plugin.json（含哈希）：_build 内一份 + 项目根一份（GitHub 发现机制读根目录）
const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'plugin.json'), 'utf-8'));
const finalManifest = { ...manifest, main: 'main.js', entryHash, zipHash };
fs.writeFileSync(path.join(buildDir, 'plugin.json'), JSON.stringify(finalManifest, null, 2));
fs.writeFileSync(path.join(cwd, 'plugin.json'), JSON.stringify(finalManifest, null, 2));

// 5. 打 zip（_build 内容放根，与官方一致）
const zip = new JSZip();
function addDir(dir, prefix = '') {
  for (const item of fs.readdirSync(dir)) {
    const fp = path.join(dir, item);
    const zp = prefix ? `${prefix}/${item}` : item;
    if (fs.statSync(fp).isDirectory()) addDir(fp, zp);
    else zip.file(zp, fs.readFileSync(fp));
  }
}
addDir(buildDir);
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const zipPath = path.join(outDir, `${manifest.entryPath}.jsplugin.zip`);
fs.writeFileSync(zipPath, buf);

console.log('\n✅ Build successful!');
console.log(`  📦 ${zipPath} (${(buf.length / 1024).toFixed(1)} KB)`);
console.log(`  📄 main.js: ${(mainJsContent.length / 1024).toFixed(1)} KB`);
console.log(`  🔑 entryHash: ${entryHash}`);
console.log(`  🔑 zipHash:   ${zipHash}\n`);
