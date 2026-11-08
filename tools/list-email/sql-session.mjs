// Disposable test transport only. The caller must first load the attested
// disposable target, then pass its zero-argument spawnPsql capability.
export class SqlSession {
  constructor(spawnPsql, { queryTimeoutMs = 15000, closeTimeoutMs = 5000, maxBytes = 16 * 1024 * 1024 } = {}) {
    if (typeof spawnPsql !== 'function' || !Number.isInteger(queryTimeoutMs) || queryTimeoutMs < 1 || queryTimeoutMs > 15000
      || !Number.isInteger(closeTimeoutMs) || closeTimeoutMs < 1 || closeTimeoutMs > 5000
      || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw new Error('Invalid disposable SQL bounds');
    this.queryTimeoutMs = queryTimeoutMs; this.closeTimeoutMs = closeTimeoutMs; this.maxBytes = maxBytes;
    this.pending = []; this.lines = []; this.buffer = ''; this.sequence = 0; this.bytes = 0;
    this.terminal = false; this.closed = false; this.closing = false; this.sqlstate = null; this.diagnostics = {}; this.stderrTail = '';
    this.child = spawnPsql();
    this.child.stdout.on('data', (chunk) => {
      this.bytes += chunk.length;
      if (this.bytes > this.maxBytes) return this.fail('Disposable SQL output exceeded its bound');
      this.buffer += chunk.toString();
      let index;
      while ((index = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, index).replace(/\r$/, ''); this.buffer = this.buffer.slice(index + 1);
        const active = this.pending[0];
        if (active && line === active.marker) {
          this.pending.shift(); clearTimeout(active.timer); active.resolve(this.lines.join('\n'));
          this.lines = []; this.bytes = Buffer.byteLength(this.buffer);
        } else if (active && line) this.lines.push(line);
      }
    });
    this.child.stderr.on('data', (chunk) => {
      // Verbose psql fields are parsed only in memory. Emit SQLSTATE and these
      // structural catalog identifiers only, never DETAIL, row values or SQL.
      let buffer = this.stderrTail + chunk.toString(); let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1);
        const state = line.match(/(?:ERROR|FATAL):\s*([0-9A-Z]{5})(?=[:\s]|$)/);
        if (state) this.sqlstate = state[1];
        const structural = line.match(/^\s*(SCHEMA NAME|TABLE NAME|CONSTRAINT NAME):\s*([a-z_][a-z0-9_]{0,62})\s*$/);
        if (structural) this.diagnostics[{ 'SCHEMA NAME': 'schema', 'TABLE NAME': 'table', 'CONSTRAINT NAME': 'constraint' }[structural[1]]] = structural[2];
      }
      this.stderrTail = buffer.slice(-512);
    });
    this.child.on('error', () => this.fail('Disposable SQL process failed'));
    this.child.stdin.on('error', () => this.fail('Disposable SQL input failed'));
    // Exit can precede closing stdio. Refuse every new request immediately,
    // then settle pending requests at close, after the SQLSTATE bytes arrive.
    this.child.on('exit', () => { this.terminal = true; });
    this.child.on('close', () => {
      this.terminal = true; this.closed = true;
      this.rejectPending(this.error('Disposable SQL process closed'));
      this.finishClose?.();
    });
    this.child.stdin.write('\\set VERBOSITY verbose\n');
  }
  error(message) {
    const error = new Error(this.sqlstate ? `${message} (SQLSTATE ${this.sqlstate})` : message);
    if (this.sqlstate) error.sqlstate = this.sqlstate;
    Object.assign(error, this.diagnostics);
    return error;
  }
  rejectPending(error) {
    for (const item of this.pending.splice(0)) { clearTimeout(item.timer); item.reject(error); }
  }
  forceStop() {
    try { this.child.kill('SIGKILL'); } catch { /* owned process may already have exited */ }
    for (const stream of [this.child.stdin, this.child.stdout, this.child.stderr]) stream.destroy();
    this.child.unref?.();
  }
  fail(message) {
    this.terminal = true; this.rejectPending(this.error(message)); this.forceStop();
  }
  query(sql) {
    if (this.terminal || this.closing || this.child.exitCode !== null || this.child.signalCode !== null
      || this.child.stdin.destroyed || !this.child.stdin.writable) return Promise.reject(this.error('Disposable SQL session is closed'));
    if (typeof sql !== 'string' || !sql.trim()) return Promise.reject(new Error('Disposable SQL statement required'));
    const marker = `__list_email_result_${++this.sequence}__`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail('Disposable SQL query timed out'), this.queryTimeoutMs);
      this.pending.push({ marker, resolve, reject, timer });
      this.child.stdin.write(`${sql};\n\\echo ${marker}\n`, (error) => { if (error) this.fail('Disposable SQL input failed'); });
    });
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    if (this.closed) return Promise.resolve();
    this.closePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.terminal = true; this.rejectPending(this.error('Disposable SQL close timed out')); this.forceStop();
        reject(this.error('Disposable SQL close timed out'));
      }, this.closeTimeoutMs);
      this.finishClose = () => { clearTimeout(timer); resolve(); };
      if (this.terminal || this.child.exitCode !== null || this.child.signalCode !== null) {
        // There may still be open stdio after exit; close it only for our child.
        this.forceStop();
      } else this.child.stdin.end('\\q\n', (error) => { if (error) this.fail('Disposable SQL close failed'); });
    });
    return this.closePromise;
  }
}
