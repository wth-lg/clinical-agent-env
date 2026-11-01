import { spawnSync } from 'node:child_process';
import { rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitFile, fakeKey, git, runScript, tempDir, tempRepo, write } from './helpers.ts';

const keyscan = (cwd: string, args: string[] = [], env: Record<string, string | undefined> = {}) =>
  runScript('scripts/keyscan.ts', args, { cwd, env });

function expectHit(r: ReturnType<typeof keyscan>, location: string, secret: string) {
  expect(r.status).toBe(1);
  expect(r.stdout).toContain(location);
  expect(r.stdout + r.stderr).not.toContain(secret);
}

describe('keyscan working tree and build output', () => {
  it('exits 0 on a clean repo', () => {
    const repo = tempRepo();
    expect(keyscan(repo).status).toBe(0);
  });

  it('flags a key in a tracked file and prints file:line only', () => {
    const repo = tempRepo();
    commitFile(repo, 'notes.txt', `line one\nkey=${fakeKey()}\n`);
    expectHit(keyscan(repo), 'notes.txt:2', fakeKey());
  });

  it('flags a key in an untracked, not ignored file', () => {
    const repo = tempRepo();
    write(repo, 'scratch.ts', `const k = "${fakeKey('B')}";\n`);
    expectHit(keyscan(repo), 'scratch.ts:1', fakeKey('B'));
  });

  it('flags a key in build output even though dist/ is ignored', () => {
    const repo = tempRepo();
    write(repo, 'apps/web/dist/assets/index.js', `a\nb\nconst k="${fakeKey('C')}"\n`);
    expectHit(keyscan(repo), 'apps/web/dist/assets/index.js:3', fakeKey('C'));
  });

  it('flags a named path outside the repo', () => {
    const repo = tempRepo();
    const outside = tempDir('keyscan-outside');
    write(outside, 'log.txt', fakeKey('D'));
    const r = keyscan(repo, [`${outside}/log.txt`]);
    expectHit(r, 'log.txt:1', fakeKey('D'));
  });

  it('flags the exact ANTHROPIC_API_KEY value even when it is not sk-ant-shaped', () => {
    const repo = tempRepo();
    const sentinel = ['SENTINEL', 'not', 'a', 'key', '7f3a9c'].join('_');
    expect(keyscan(repo, [], { ANTHROPIC_API_KEY: sentinel }).status).toBe(0);
    write(repo, 'tmp.txt', `x ${sentinel} y\n`);
    expectHit(keyscan(repo, [], { ANTHROPIC_API_KEY: sentinel }), 'tmp.txt:1', sentinel);
    expect(keyscan(repo).status).toBe(0);
  });

  it('flags a key in a file that holds a NUL byte', () => {
    const repo = tempRepo();
    write(repo, 'blob.bin', Buffer.concat([Buffer.from([0, 1, 2, 10]), Buffer.from(`${fakeKey('H')}\n`)]));
    expectHit(keyscan(repo), 'blob.bin:2', fakeKey('H'));
  });

  it('flags a key in a UTF-16 file', () => {
    const repo = tempRepo();
    write(repo, 'env.txt', Buffer.from(`\ufeffKEY=${fakeKey('I')}\n`, 'utf16le'));
    expectHit(keyscan(repo), 'env.txt:1', fakeKey('I'));
  });

  it('flags a key inside a gzip file, by its decompressed line', () => {
    const repo = tempRepo();
    commitFile(repo, 'fixtures/world.ndjson.gz', gzipSync(`{"resourceType":"Patient","id":"pt-1"}\n{"note":"${fakeKey('M')}"}\n`));
    expectHit(keyscan(repo), 'fixtures/world.ndjson.gz(gunzip):2', fakeKey('M'));
  });

  it('flags a key inside a gzip file in build output', () => {
    const repo = tempRepo();
    write(repo, 'apps/web/dist/data/world.ndjson.gz', gzipSync(`${fakeKey('N')}\n`));
    expectHit(keyscan(repo), 'apps/web/dist/data/world.ndjson.gz(gunzip):1', fakeKey('N'));
  });

  it('flags a key inside a base64 attachment data field, plain or gzipped', () => {
    const repo = tempRepo();
    const data = Buffer.from(`Note for the chart. ${fakeKey('O')}`).toString('base64');
    const line = `{"resourceType":"DocumentReference","id":"doc-1","content":[{"attachment":{"contentType":"text/plain","data":"${data}"}}]}\n`;
    write(repo, 'tasks/x/notes.ndjson', `{}\n${line}`);
    expectHit(keyscan(repo), 'tasks/x/notes.ndjson:2(base64)', fakeKey('O'));
    const gz = tempRepo();
    write(gz, 'apps/web/dist/data/world.ndjson.gz', gzipSync(line));
    expectHit(keyscan(gz), 'apps/web/dist/data/world.ndjson.gz(gunzip):1(base64)', fakeKey('O'));
  });

  it('passes a gzip file and base64 data that hold no key', () => {
    const repo = tempRepo();
    const data = Buffer.from('nothing secret here at all').toString('base64');
    write(repo, 'apps/web/dist/data/world.ndjson.gz', gzipSync(`{"attachment":{"data":"${data}"}}\n`));
    expect(keyscan(repo).status).toBe(0);
  });

  it('fails on a symlink in dist that points outside dist, since the Pages upload dereferences it', () => {
    const repo = tempRepo();
    const outside = tempDir('keyscan-outside');
    write(outside, 'clean.txt', 'nothing here\n');
    write(repo, 'apps/web/dist/index.html', '<!doctype html>\n');
    symlinkSync(join(outside, 'clean.txt'), join(repo, 'apps/web/dist/data.txt'));
    const r = keyscan(repo);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('apps/web/dist/data.txt');
  });

  it('allows a symlink in dist that points inside dist', () => {
    const repo = tempRepo();
    write(repo, 'apps/web/dist/index.html', '<!doctype html>\n');
    symlinkSync('index.html', join(repo, 'apps/web/dist/alias.html'));
    expect(keyscan(repo).status).toBe(0);
  });
});

describe('keyscan history', () => {
  it('finds a key committed then deleted only with --history', () => {
    const repo = tempRepo();
    git(repo, 'checkout', '-q', '-b', 'scratch');
    const added = commitFile(repo, 'leak.txt', `${fakeKey('E')}\n`);
    commitFile(repo, 'leak.txt', 'gone\n');
    git(repo, 'checkout', '-q', 'main');
    expect(keyscan(repo).status).toBe(0);
    const r = keyscan(repo, ['--history']);
    expectHit(r, `${added.slice(0, 12)}:leak.txt:1`, fakeKey('E'));
  });

  it('finds a key in a commit message', () => {
    const repo = tempRepo();
    commitFile(repo, 'a.txt', 'a\n', `oops ${fakeKey('F')}`);
    const r = keyscan(repo, ['--history']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('(commit message)');
    expect(r.stdout).not.toContain(fakeKey('F'));
  });

  it('--range scans only the named commits', () => {
    const repo = tempRepo();
    const base = git(repo, 'rev-parse', 'HEAD');
    const leak = commitFile(repo, 'leak.txt', `${fakeKey('G')}\n`);
    commitFile(repo, 'leak.txt', 'gone\n');
    const head = commitFile(repo, 'b.txt', 'b\n');
    expectHit(keyscan(repo, ['--range', `${base}..${head}`]), 'leak.txt:1', fakeKey('G'));
    expect(keyscan(repo, ['--range', `${leak}..${head}`]).status).toBe(0);
    // A bare revision scans everything reachable from it (used by the hook for a new branch).
    expect(keyscan(repo, ['--range', head]).status).toBe(1);
  });

  // Each case adds a key and deletes it in a later commit, so only the history scan can see it.
  function expectHistoryHit(repo: string, base: string, location: string, secret: string) {
    expectHit(keyscan(repo, ['--history']), location, secret);
    expectHit(keyscan(repo, ['--range', `${base}..HEAD`]), location, secret);
  }

  it('finds a key that only a merge resolution added', () => {
    const repo = tempRepo();
    const base = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', '-q', '-b', 'side');
    commitFile(repo, 'side.txt', 'side\n');
    git(repo, 'checkout', '-q', 'main');
    commitFile(repo, 'main.txt', 'main\n');
    git(repo, 'merge', '-q', '--no-ff', '--no-commit', 'side');
    write(repo, 'leak.txt', `${fakeKey('J')}\n`);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'merge side');
    const merge = git(repo, 'rev-parse', 'HEAD');
    commitFile(repo, 'leak.txt', 'gone\n');
    expectHistoryHit(repo, base, `${merge.slice(0, 12)}:leak.txt:1`, fakeKey('J'));
  });

  it('finds a key in a path that .gitattributes marks -diff', () => {
    const repo = tempRepo();
    const base = git(repo, 'rev-parse', 'HEAD');
    commitFile(repo, '.gitattributes', '*.json -diff\n');
    const added = commitFile(repo, 'trace.json', `{\n"k": "${fakeKey('K')}"\n}\n`);
    commitFile(repo, 'trace.json', '{}\n');
    expectHistoryHit(repo, base, `${added.slice(0, 12)}:trace.json:2`, fakeKey('K'));
  });

  it('finds a key in a committed file that holds a NUL byte', () => {
    const repo = tempRepo();
    const base = git(repo, 'rev-parse', 'HEAD');
    const added = commitFile(repo, 'blob.bin', Buffer.concat([Buffer.from([0, 10]), Buffer.from(`${fakeKey('L')}\n`)]));
    commitFile(repo, 'blob.bin', 'gone\n');
    expectHistoryHit(repo, base, `${added.slice(0, 12)}:blob.bin:2`, fakeKey('L'));
  });

  it('keeps reading a commit message past a 0x02 byte', () => {
    const repo = tempRepo();
    commitFile(repo, 'a.txt', 'a\n', `subject\n\nnote \x02\n${fakeKey('M')}`);
    const r = keyscan(repo, ['--history']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('(commit message):4');
    expect(r.stdout).not.toContain(fakeKey('M'));
  });

  it('exits 2 on a range git cannot resolve, as a keyscan error rather than a finding', () => {
    const repo = tempRepo();
    const r = keyscan(repo, ['--range', 'nope..alsonope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('keyscan error');
    expect(r.stderr).not.toContain('finding');
  });

  it('fails closed with a keyscan error when git dies partway through the log', () => {
    const repo = tempRepo();
    const base = git(repo, 'rev-parse', 'HEAD');
    commitFile(repo, 'lost.txt', 'this blob goes missing\n');
    const blob = git(repo, 'rev-parse', 'HEAD:lost.txt');
    commitFile(repo, 'later.txt', 'printed before git reaches the missing blob\n');
    rmSync(join(repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
    const r = keyscan(repo, ['--range', `${base}..HEAD`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('keyscan error');
    expect(r.stderr).not.toContain('clean');
  });
});

// `git log -p` of this history is about 600 MB, past the longest string V8 can hold (~536 MB), so
// a scanner that reads the whole log into one string throws ERR_STRING_TOO_LONG. Each blob stays
// under core.bigFileThreshold (512 MB) so git still prints it as text. The blobs are written with
// `git hash-object` and committed from the index, so the working tree never holds them.
describe('keyscan history larger than one string', () => {
  const BLOB_BYTES = 300_000_000;
  let repo: string;
  let early: string;

  const blobs = new Map<string, string>();

  // Hashes a blob of BLOB_BYTES once per fill and commits it from the index.
  function commitBigBlob(fill: string, message: string): void {
    let blob = blobs.get(fill);
    if (!blob) {
      const line = `${fill} `.repeat(250);
      const r = spawnSync('bash', ['-c', `yes '${line}' | head -c ${BLOB_BYTES} | git hash-object -w --stdin`], {
        cwd: repo,
        encoding: 'utf8',
      });
      if (r.status !== 0) throw new Error(`hash-object failed: ${r.stderr}`);
      blob = r.stdout.trim();
      blobs.set(fill, blob);
    }
    git(repo, 'update-index', '--add', '--cacheinfo', `100644,${blob},${fill}.txt`);
    git(repo, 'commit', '-q', '-m', message);
  }

  beforeAll(() => {
    repo = tempRepo();
    // clean: init, big-one, big-two. leaky: init, a key, big-one, big-two.
    commitBigBlob('big-one', 'first large fixture rebuild');
    commitBigBlob('big-two', 'second large fixture rebuild');
    git(repo, 'branch', 'clean');
    git(repo, 'reset', '-q', '--mixed', 'HEAD~2');
    git(repo, 'checkout', '-q', '-b', 'leaky');
    early = commitFile(repo, 'early.txt', `one\nkey=${fakeKey('P')}\n`);
    commitBigBlob('big-one', 'first large fixture rebuild');
    commitBigBlob('big-two', 'second large fixture rebuild');
  }, 300_000);

  it('finds a key planted in an early commit', () => {
    expectHit(keyscan(repo, ['--range', 'leaky']), `${early.slice(0, 12)}:early.txt:2`, fakeKey('P'));
  }, 300_000);

  it('exits 0 on a clean large history', () => {
    const r = keyscan(repo, ['--range', 'clean']);
    expect(r.stderr).toContain('clean, 3 commit(s) scanned');
    expect(r.status).toBe(0);
  }, 300_000);
});
