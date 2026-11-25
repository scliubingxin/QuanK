import {spawn, execFile} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {OFFICE_WORKER_FILES} from './office-worker-bundle.mjs';
import {officeFontEnvironment, officeWorkerCommand} from './office-fonts.mjs';
import {commandEnvironment} from './command.mjs';
import {nativeWorker} from './office-lok-native.mjs';

const exec = promisify(execFile);
const maxFrame = 64 * 1024 * 1024;

export async function startOfficeLokWorker({python, officeDirectory, fontCacheDirectory, scratchDirectory = tmpdir(), timeoutMs = 30000}) {
    const directory = await mkdtemp(path.join(scratchDirectory, 'quank-office-lok-'));
    let child;
    try {
        await writeFile(path.join(directory, 'ABI.json'), OFFICE_WORKER_FILES['ABI.json'].text, {mode:0o600});
        const fontEnvironment = await officeFontEnvironment({directory, officeDirectory,
            cacheDirectory:fontCacheDirectory, python:fontCacheDirectory ? python : undefined});
        const [bin, args] = officeWorkerCommand(python, ['-u', '-c', nativeWorker, officeDirectory, directory], false);
        child = spawn(bin, args, {env:{...commandEnvironment(), ...fontEnvironment, PYTHONNOUSERSITE:'1', PYTHONDONTWRITEBYTECODE:'1'}});
    } catch (error) {
        await rm(directory, {recursive:true, force:true});
        throw error;
    }
    let next = 0, dead, header = Buffer.alloc(0), frame, offset = 0, data, stderr = '';
    const pending = new Map();
    const closed = new Promise(resolve => child.once('close', resolve));
    const cleanup = closed.then(() => rm(directory, {recursive:true, force:true}));
    cleanup.catch(() => {});
    function stop(error) {
        if (dead) return;
        dead = error;
        child.kill('SIGKILL');
        for (const {reject, timer} of pending.values()) {
            clearTimeout(timer);
            reject(error);
        }
        pending.clear();
    }
    child.on('error', stop);
    child.stdin.on('error', stop);
    child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-1000); });
    child.on('close', (code, signal) => stop(Error('Office worker exited: ' + (signal ?? code) + ' ' + stderr)));
    function finish() {
        const waiter = pending.get(frame.id);
        if (!waiter) throw Error('Unexpected Office frame');
        clearTimeout(waiter.timer);
        pending.delete(frame.id);
        if (frame.error) waiter.reject(Error(frame.error));
        else waiter.resolve(data.length ? {...frame.result, binary:data} : frame.result);
        frame = null;
    }
    child.stdout.on('data', chunk => {
        try {
            while (chunk.length) {
                if (!frame) {
                    const end = chunk.indexOf(10);
                    const length = end < 0 ? chunk.length : end;
                    header = Buffer.concat([header, chunk.subarray(0,length)]);
                    if (header.length > 1024 * 1024) throw Error('Office frame header too large');
                    if (end < 0) return;
                    const line = header.toString();
                    chunk = chunk.subarray(end+1);
                    header = Buffer.alloc(0);
                    if (!line.startsWith('QKLOK ')) throw Error('Invalid Office frame prefix');
                    frame = JSON.parse(line.slice(6));
                    if (!Number.isInteger(frame.size) || frame.size < 0 || frame.size > maxFrame) throw Error('Invalid Office frame size');
                    data = new Uint8Array(frame.size);
                    offset = 0;
                    if (!frame.size) finish();
                    continue;
                }
                const length = Math.min(data.length-offset, chunk.length);
                data.set(chunk.subarray(0,length), offset);
                offset += length;
                chunk = chunk.subarray(length);
                if (offset === data.length) finish();
            }
        } catch (error) { stop(error); }
    });
    function wait(id) {
        if (dead) return Promise.reject(dead);
        return new Promise((resolve,reject) => {
            const timer = setTimeout(() => stop(Error('Office worker timed out')), timeoutMs);
            pending.set(id, {resolve,reject,timer});
        });
    }
    const ready = wait(0);
    ready.catch(() => {});
    return {
        ready, closed,
        async request(op, payload = {}) {
            await ready;
            if (dead) throw dead;
            const {bytes, binary, ...rest} = payload;
            const encode = value => value instanceof Uint8Array ? Buffer.from(value).toString('base64') : value;
            const id = ++next;
            const line = JSON.stringify({...rest, bytes:encode(bytes), binary:encode(binary), id, op}) + '\n';
            if (line.length > 96 * 1024 * 1024) throw Error('Office worker request too large');
            const response = wait(id);
            child.stdin.write(line);
            return response;
        },
        async rss() {
            const {stdout} = await exec('ps', ['-o','rss=','-p',String(child.pid)]);
            return Number(stdout.trim()) * 1024;
        },
        async close() {
            stop(Error('Office worker closed'));
            await cleanup;
        },
    };
}
