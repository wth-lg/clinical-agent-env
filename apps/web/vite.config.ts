import { basename, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { copyDataPlugin } from './build/copy-data.ts';
import { APP_CSP } from './csp.ts';

// The CSP meta in each test page blocks the inline scripts and styles the dev server injects
// for HMR, so it is removed in `vite dev` only. Built pages keep it.
function stripCspInDev(): Plugin {
  return {
    name: 'strip-csp-in-dev',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
  };
}

// The build writes APP_CSP (csp.ts) into index.html right after its charset meta, so the CSP is
// written once; the test pages keep their own CSP meta, and `vite dev` has none, as above. The
// meta is spliced in as text: Vite's tag injection would escape each ' as &#39;, and the runner
// tests and cli/runner-check.ts compare the served meta with APP_CSP as text.
const CHARSET = '<meta charset="UTF-8" />';
function appCsp(): Plugin {
  return {
    name: 'app-csp',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (basename(ctx.filename) !== 'index.html') return html;
      if (!html.includes(CHARSET) || /["&<>]/.test(APP_CSP)) throw new Error('app-csp: index.html has no charset meta, or APP_CSP needs escaping');
      return html.replace(CHARSET, `${CHARSET}\n    <meta http-equiv="Content-Security-Policy" content="${APP_CSP}" />`);
    },
  };
}

// harness.html, probe.html and relay-probe.html are test pages: `pnpm build` builds them for the e2e runs, and
// the Pages build (`--mode pages`, .github/workflows/pages.yml) leaves them out of the artifact.
export default defineConfig(({ mode }) => ({
  base: '/clinical-agent-env/',
  plugins: [react(), tailwindcss(), stripCspInDev(), appCsp(), copyDataPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ...(mode === 'pages'
          ? {}
          : {
              harness: resolve(import.meta.dirname, 'harness.html'),
              probe: resolve(import.meta.dirname, 'probe.html'),
              'relay-probe': resolve(import.meta.dirname, 'relay-probe.html'),
            }),
      },
    },
  },
}));
