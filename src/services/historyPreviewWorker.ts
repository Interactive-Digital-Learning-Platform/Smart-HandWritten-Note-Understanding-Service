import path from 'path';
import {spawn, ChildProcessWithoutNullStreams} from 'child_process';
import {StringDecoder} from 'string_decoder';
import {coverageRuntimeRoot, coveragePython} from './coverageRuntime';

const ROOT = coverageRuntimeRoot(path.resolve(__dirname, '../..'));
export const HISTORY_PREVIEW_SHA = '7e24afeafe9505f6ac82444d16a8c85aefe484a0fa6d673dc3207366bd7ed3a7';
export type HistoryPreviewInput = {text: string; conceptId: string; scopeConfirmed: true};
type State = {child: ChildProcessWithoutNullStreams; buffer: string; decoder: StringDecoder; ready: boolean};
type Job = {id: number; input: HistoryPreviewInput; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout};

/** One local Python worker, one bounded request, restart after any transport failure. */
export class HistoryPreviewWorker {
  private state?: State;
  private job?: Job;
  private sequence = 0;
  private disposed = false;
  constructor(private options: {command?: string; args?: string[]; timeoutMs?: number; modelSha256?: string; script?: string; pythonEnv?: string} = {}) {}

  private get modelSha256() {return this.options.modelSha256 || HISTORY_PREVIEW_SHA;}

  predict(input: HistoryPreviewInput): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error('Worker closed'));
    if (this.job) return Promise.reject(new Error('Worker busy'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Inference timed out')), this.options.timeoutMs ?? 90000);
      this.job = {id: ++this.sequence, input, resolve, reject, timer};
      try {
        if (!this.state) this.start();
        else if (this.state.ready) this.send();
      } catch { this.fail(new Error('Worker startup failed')); }
    });
  }

  private start() {
    const child = spawn(this.options.command || process.env[this.options.pythonEnv || 'HISTORY_COVERAGE_PYTHON'] || coveragePython(ROOT),
      this.options.args || ['-B', path.join(ROOT, this.options.script || 'ml-training/history_preview_cli.py'), '--worker'], {
        cwd: ROOT, windowsHide: true,
        env: {...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HUB_OFFLINE: '1'},
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    const state: State = {child, buffer: '', decoder: new StringDecoder('utf8'), ready: false};
    this.state = state;
    const fail = () => {if (this.state === state) this.fail(new Error('Worker transport failed'));};
    child.on('error', fail); child.on('close', fail); child.stdin.on('error', fail);
    child.stderr.on('data', () => { /* Drain progress; do not log private input. */ });
    child.stdout.on('data', chunk => {
      if (this.state !== state) return;
      state.buffer += state.decoder.write(chunk);
      if (Buffer.byteLength(state.buffer) > 1024 * 1024) return this.fail(new Error('Worker output limit'));
      let newline: number;
      while ((newline = state.buffer.indexOf('\n')) !== -1 && this.state === state) {
        const line = state.buffer.slice(0, newline); state.buffer = state.buffer.slice(newline + 1);
        try {
          const reply = JSON.parse(line);
          if (!state.ready) {
            if (reply.type !== 'ready' || reply.modelSha256 !== this.modelSha256) throw new Error('Invalid worker identity');
            state.ready = true; this.send();
          } else {
            const job = this.job;
            if (!job || reply.id !== job.id) throw new Error('Invalid worker response');
            if (reply.error) {
              clearTimeout(job.timer); this.job = undefined; job.reject(new Error('Local inference failed'));
            } else {
              if (reply.result?.modelSha256 !== this.modelSha256 || reply.result?.previewOnly !== true) throw new Error('Invalid candidate response');
              clearTimeout(job.timer); this.job = undefined; job.resolve(reply.result);
            }
          }
        } catch { this.fail(new Error('Invalid worker response')); }
      }
    });
  }

  private send() {
    if (!this.state || !this.job) return;
    const line = JSON.stringify({id: this.job.id, input: this.job.input}) + '\n';
    if (Buffer.byteLength(line) > 100000) {this.fail(new Error('Worker input limit')); return;}
    this.state.child.stdin.write(line);
  }

  private fail(error: Error) {
    const state = this.state; this.state = undefined;
    if (state) state.child.kill();
    const job = this.job; this.job = undefined;
    if (job) {clearTimeout(job.timer); job.reject(error);}
  }

  dispose() {this.disposed = true; this.fail(new Error('Worker closed'));}
}
