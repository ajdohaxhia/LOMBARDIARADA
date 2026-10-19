import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],test:{environment:'jsdom',include:['src/**/*.test.{ts,tsx}'],coverage:{include:['src/**/*.{ts,tsx}'],exclude:['src/main.tsx','src/env.d.ts'],reporter:['text','json-summary']}}});
