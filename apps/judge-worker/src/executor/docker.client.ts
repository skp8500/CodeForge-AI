import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import Docker from 'dockerode';

import { MAX_OUTPUT_BYTES } from '../constants.js';

const dockerSocketPath =
  process.env['DOCKER_SOCKET_PATH'] ||
  (process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock');

export const docker = new Docker({ socketPath: dockerSocketPath });

export const WORK_BASE = process.env['WORK_DIR'] ?? '/tmp/codeforge';

// ─── Work-directory helpers ───────────────────────────────────────────────────

export async function createWorkDir(submissionId: string): Promise<string> {
  const dir = join(WORK_BASE, submissionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeSource(workDir: string, filename: string, code: string): Promise<void> {
  await writeFile(join(workDir, filename), code, 'utf8');
}

export async function cleanupWorkDir(workDir: string): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
}

// ─── Container run ────────────────────────────────────────────────────────────

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  oomKilled: boolean;
  runtimeMs: number;
}

export interface ContainerRunOptions {
  image: string;
  workDir: string;
  /** stdin bytes to pipe into the container. Omit for compilation containers. */
  stdin?: string;
  timeoutMs: number;
  /** Hard memory ceiling in bytes (HostConfig.Memory + MemorySwap). */
  memoryBytes: number;
  /** Absolute path to a seccomp JSON profile on the Docker host. */
  seccompProfilePath?: string;
}

export async function runContainer(opts: ContainerRunOptions): Promise<RunResult> {
  const hasStdin = opts.stdin !== undefined;

  const securityOpt: string[] = ['no-new-privileges:true'];
  if (opts.seccompProfilePath) {
    securityOpt.push(`seccomp=${opts.seccompProfilePath}`);
  }

  const container = await docker.createContainer({
    Image: opts.image,
    Tty: false,
    OpenStdin: hasStdin,
    StdinOnce: hasStdin,
    AttachStdin: hasStdin,
    AttachStdout: true,
    AttachStderr: true,
    HostConfig: {
      Binds: [`${opts.workDir}:/code:rw`],
      Memory: opts.memoryBytes,
      MemorySwap: opts.memoryBytes,
      NetworkMode: 'none',
      PidsLimit: 64,
      SecurityOpt: securityOpt,
      AutoRemove: false,
    },
  });

  // Attach before start so we don't miss early output
  const attachStream = await container.attach({
    hijack: true,
    stream: true,
    stdin: hasStdin,
    stdout: true,
    stderr: true,
  });

  const stdoutPass = new PassThrough();
  const stderrPass = new PassThrough();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutSize = 0;
  let outputTruncated = false;

  stdoutPass.on('data', (chunk: Buffer) => {
    stdoutSize += chunk.length;
    if (stdoutSize <= MAX_OUTPUT_BYTES) {
      stdoutChunks.push(chunk);
    } else {
      outputTruncated = true;
    }
  });
  stderrPass.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  docker.modem.demuxStream(attachStream, stdoutPass, stderrPass);

  await container.start();
  const startMs = Date.now();

  // Write stdin and close the write end (suppress EPIPE if container exits early)
  attachStream.on('error', () => {});
  if (hasStdin) {
    attachStream.write(Buffer.from(opts.stdin!, 'utf8'));
    attachStream.end();
  }

  // Race natural exit against timeout
  let timedOut = false;
  let exitCode = 0;
  const waitPromise = container.wait();

  await new Promise<void>((resolve) => {
    const handle = setTimeout(() => {
      timedOut = true;
      container.kill({ signal: 'SIGKILL' }).catch(() => {});
      resolve();
    }, opts.timeoutMs);

    waitPromise
      .then((r) => {
        clearTimeout(handle);
        exitCode = r.StatusCode;
        resolve();
      })
      .catch(() => {
        clearTimeout(handle);
        exitCode = -1;
        resolve();
      });
  });

  if (timedOut) {
    // Wait for the SIGKILL to take effect before inspecting
    const r = await waitPromise.catch(() => ({ StatusCode: -1 }));
    exitCode = r.StatusCode;
  }

  const runtimeMs = Date.now() - startMs;

  let oomKilled = false;
  try {
    const info = await container.inspect();
    oomKilled = info.State.OOMKilled ?? false;
  } catch {
    // container might already be gone
  }

  try {
    await container.remove({ force: true });
  } catch {}

  // Flush and read buffered output
  stdoutPass.end();
  stderrPass.end();

  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');

  return {
    exitCode,
    stdout: outputTruncated ? `${stdout}\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]` : stdout,
    stderr,
    timedOut,
    oomKilled,
    runtimeMs,
  };
}
