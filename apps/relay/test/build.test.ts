// The uploaded relay builds into a function that loads (builder-131: Vercel's Node builder emitted
// .js but kept the '../src/*.ts' import specifiers, and every request got 500
// FUNCTION_INVOCATION_FAILED). CI has no Vercel CLI, so this runs scripts/relay-build-check.ts
// --tsc: the repo's TypeScript over the upload list with the uploaded tsconfig.json, then Node's own
// loader on the output. README Deploy step 4 runs the same probes on a real `vercel build`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UPLOAD_LIST } from '../../../scripts/relay-upload-list.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RELAY = fileURLToPath(new URL('../', import.meta.url));

describe('relay build', () => {
  it('uploads a package.json that makes the build ESM and a tsconfig.json that rewrites .ts imports', () => {
    expect(UPLOAD_LIST).toContain('package.json');
    expect(UPLOAD_LIST).toContain('tsconfig.json');
    expect(JSON.parse(readFileSync(`${RELAY}package.json`, 'utf8'))).toMatchObject({ type: 'module' });
    // tsconfig.json may hold comments, so its text is matched, not parsed as JSON.
    const text = readFileSync(`${RELAY}tsconfig.json`, 'utf8');
    expect(text).toMatch(/"rewriteRelativeImportExtensions":\s*true/);
    expect(text).toMatch(/"module":\s*"nodenext"/);
  });

  it('the emitted function loads with Node and answers OPTIONS 204, foreign Origin 403, other model 400, a valid POST 200', () => {
    let out: string;
    let code = 0;
    try {
      out = execFileSync('node', ['scripts/relay-build-check.ts', '--tsc'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      code = err.status;
      out = `${err.stdout}${err.stderr}`;
    }
    expect(out, out).toMatch(/PASS OPTIONS from the Pages origin 204/);
    expect(code, out).toBe(0);
  }, 60_000);
});
