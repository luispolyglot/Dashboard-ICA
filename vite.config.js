var _a;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
// Premium voice for the local copy only (pnpm dev). See the file for details.
import { localPremiumVoice } from './scripts/vite-premium-voice.mjs';
var buildId = ((_a = process.env.VERCEL_GIT_COMMIT_SHA) === null || _a === void 0 ? void 0 : _a.slice(0, 12)) || String(Date.now());
var builtAt = new Date().toISOString();
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        localPremiumVoice(),
        {
            name: 'write-version-json',
            apply: 'build',
            closeBundle: function () {
                var outFile = path.resolve(__dirname, 'dist/version.json');
                fs.writeFileSync(outFile, JSON.stringify({ buildId: buildId, builtAt: builtAt }, null, 2), 'utf-8');
            },
        },
    ],
    define: {
        __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            path: 'path-browserify',
        },
    },
});
