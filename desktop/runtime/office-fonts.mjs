import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readdir,stat,readFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {commandEnvironment} from './command.mjs';
import {FONT_SUBSTITUTIONS} from '../src/shared/office-font-map.js';

const xml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');

// [lane:render] <accept> keeps the original family when installed and only falls back when it is missing.
export function fontAliasXml(){return FONT_SUBSTITUTIONS.flatMap(r=>r.from.map(f=>' <alias binding="same"><family>'+xml(f)+'</family><accept>'+r.to.map(t=>'<family>'+xml(t)+'</family>').join('')+'</accept></alias>')).join('\n')+'\n <alias><family>sans-serif</family><prefer><family>PingFang SC</family><family>Helvetica Neue</family></prefer></alias>\n';}

const exec = promisify(execFile);
const optionalEntries = directory => readdir(directory, {withFileTypes: true}).catch(error => {
 if (['ENOENT','ENOTDIR','EACCES','EPERM'].includes(error.code)) return [];
 throw error;
});

async function assetFontDirectories(root) {
 const families = /^(pingfang|songti|simsong|stsong|heiti|stheiti|kaiti|stkaiti|fangsong|stfangso|hiragino)/i;
 const catalogs = (await optionalEntries(root)).filter(entry => entry.isDirectory() && /^com_apple_MobileAsset_Font\d+$/.test(entry.name));
 const dirs = await Promise.all(catalogs.map(async catalog => {
  const parent = path.join(root, catalog.name);
  const assets = (await optionalEntries(parent)).filter(entry => entry.isDirectory() && entry.name.endsWith('.asset'));
  return Promise.all(assets.map(async asset => {
   const dir = path.join(parent, asset.name, 'AssetData');
   return (await optionalEntries(dir)).some(entry => families.test(entry.name) && /\.(ttc|ttf|otf)$/i.test(entry.name)) ? dir : null;
  }));
 }));
 return dirs.flat().filter(Boolean).sort();
}

async function directoryTimes(dir) {
 let info;
 try { info = await stat(dir); }
 catch (error) {
  if (['ENOENT','ENOTDIR','EACCES','EPERM'].includes(error.code)) return [[dir, null]];
  throw error;
 }
 const children = (await optionalEntries(dir)).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
 return [[dir, info.mtimeMs], ...(await Promise.all(children.map(name => directoryTimes(path.join(dir, name))))).flat()];
}

export function officeWorkerCommand(python, args, lowPriority) {
 return lowPriority && process.platform === 'darwin'
  ? ['/usr/bin/nice', ['-n', '10', python, ...args]]
  : [python, args];
}

const fontconfigInit = `import ctypes, sys
lib = ctypes.CDLL(sys.argv[1])
lib.FcInitLoadConfigAndFonts.restype = ctypes.c_void_p
lib.FcConfigDestroy.argtypes = [ctypes.c_void_p]
config = lib.FcInitLoadConfigAndFonts()
if not config:
    sys.exit("Fontconfig initialization failed")
lib.FcConfigDestroy(config)
`;

async function buildFontCache({python, officeDirectory, env, lowPriority}) {
 const library = path.resolve(officeDirectory, '../Frameworks/libfontconfig.1.dylib');
 const [bin, args] = officeWorkerCommand(python, ['-c', fontconfigInit, library], lowPriority);
 await exec(bin, args, {env: {...commandEnvironment(), ...env, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1'}, timeout: 60000});
}

async function fontDirectories(officeDirectory, home, assetsRoot) {
 return [path.resolve(officeDirectory,'../Resources/fonts/truetype'), '/System/Library/Fonts',
  '/Library/Fonts', path.join(home, 'Library/Fonts'), ...await assetFontDirectories(assetsRoot)];
}

async function fontFingerprint(dirs) {
 return createHash('sha256').update(JSON.stringify(await Promise.all(dirs.map(directoryTimes)))).digest('hex');
}

export async function officeFontFingerprint(officeDirectory) {
 if (process.platform !== 'darwin') return '';
 return fontFingerprint(await fontDirectories(officeDirectory, os.homedir(), '/System/Library/AssetsV2'));
}

export async function officeFontEnvironment({
 directory, officeDirectory, platform = process.platform, home = os.homedir(),
 assetsRoot = '/System/Library/AssetsV2', cacheDirectory = path.join(directory, 'fontcache'),
 python, lowPriority, onTiming, onFingerprint, build = buildFontCache,
}) {
 if (platform !== 'darwin') return {};
 const started = performance.now();
 if ([directory, officeDirectory, home, cacheDirectory, assetsRoot].some(p => !path.isAbsolute(p) || /[\x00-\x1f]/.test(p))) throw Error('Office字体路径无效');
 await mkdir(cacheDirectory, {recursive: true, mode: 0o700});
 const dirs = await fontDirectories(officeDirectory, home, assetsRoot);
 const config = path.join(directory, 'fontconfig-willbuddy.conf');
 const content = '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n'
  + dirs.map(p => ' <dir>' + xml(p) + '</dir>').join('\n')
  + '\n <cachedir>' + xml(cacheDirectory) + '</cachedir>\n' + fontAliasXml() + '</fontconfig>\n';
 await writeFile(config, content, {mode: 0o600, flag: 'wx'});
 const env = {FONTCONFIG_FILE: config, FONTCONFIG_PATH: directory};
 if (python || onFingerprint) {
  const fingerprint = await fontFingerprint(dirs);
  onFingerprint?.(fingerprint);
  if (python) await prepareFontCache({fingerprint, cacheDirectory, python, officeDirectory, env, lowPriority, onTiming, build, started});
 }
 return env;
}

const preparations = new Map();

async function prepareFontCache({fingerprint, cacheDirectory, python, officeDirectory, env, lowPriority, onTiming, build, started}) {
 const marker = path.join(cacheDirectory, 'fingerprint');
 const previous = preparations.get(cacheDirectory) || Promise.resolve();
 const task = previous.catch(() => {}).then(async () => {
  const saved = await readFile(marker, 'utf8').catch(error => {
   if (error.code === 'ENOENT') return '';
   throw error;
  });
  const hit = saved === fingerprint;
  if (!hit) {
   await build({python, officeDirectory, env, lowPriority});
   const temp = marker + '.tmp';
   try {
    await writeFile(temp, fingerprint, {mode: 0o600});
    await rename(temp, marker);
   } finally { await rm(temp, {force: true}); }
  }
  onTiming?.({hit, ms: Math.round(performance.now() - started)});
 });
 preparations.set(cacheDirectory, task);
 try { await task; }
 finally { if (preparations.get(cacheDirectory) === task) preparations.delete(cacheDirectory); }
}
