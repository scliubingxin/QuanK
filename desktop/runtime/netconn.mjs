// [p3-m3] Small buffered socket wrapper shared by the IMAP and SMTP clients: bounded reads, timeouts, cancellation, STARTTLS upgrade.
import tls from 'node:tls';
import net from 'node:net';

export const defaultConnect = ({host, port, tls: secure = true}) => secure ? tls.connect({host, port, servername: host}) : net.connect({host, port});
export const defaultUpgrade = host => socket => tls.connect({socket, servername: host});
const code = e => e?.code === 'ENOTFOUND' ? '找不到服务器' : e?.code === 'ECONNREFUSED' ? '服务器拒绝连接' : e?.code === 'ETIMEDOUT' ? '连接超时'
  : /certificate|CERT_|SELF_SIGNED/i.test(String(e?.code || e?.message)) ? '服务器证书无效' : String(e?.code || e?.message || e).slice(0, 120);

export class Conn {
  constructor(socket, {timeoutMs = 20000, signal, maxBytes = 16 * 1024 * 1024} = {}) {
    this.buf = Buffer.alloc(0); this.err = null; this.closed = false; this.waiter = null;
    this.timeoutMs = timeoutMs; this.maxBytes = maxBytes;
    this.attach(socket);
    if (signal) { if (signal.aborted) this.fail(new Error('已取消')); else signal.addEventListener('abort', () => { this.fail(new Error('已取消')); this.close(); }, {once: true}); }
  }
  attach(s) {
    this.socket = s; this.closed = false;
    this.onData = d => { this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : Buffer.from(d); if (this.buf.length > this.maxBytes) { this.fail(new Error('服务器返回的数据过大')); this.close(); } this.wake(); };
    this.onError = e => this.fail(new Error('连接失败：' + code(e)));
    this.onClose = () => { this.closed = true; this.wake(); };
    s.on('data', this.onData); s.on('error', this.onError); s.on('close', this.onClose);
  }
  detach() { const s = this.socket; s.off('data', this.onData); s.off('error', this.onError); s.off('close', this.onClose); return s; }
  upgrade(fn) { const s = this.detach(); this.buf = Buffer.alloc(0); this.attach(fn(s)); }
  fail(e) { if (!this.err) this.err = e; this.wake(); }
  wake() { const w = this.waiter; this.waiter = null; w?.(); }
  /** parse(buf) -> {value, used} | null */
  async read(parse) {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      if (this.err) throw this.err;
      const r = parse(this.buf);
      if (r) { this.buf = this.buf.subarray(r.used); return r.value; }
      if (this.closed) throw new Error('服务器断开了连接');
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('服务器响应超时');
      await new Promise(res => { const t = setTimeout(res, left); this.waiter = () => { clearTimeout(t); res(); }; });
    }
  }
  write(s) { if (this.err) throw this.err; this.socket.write(s); }
  close() { try { this.socket.end(); this.socket.destroy(); } catch {} }
}
