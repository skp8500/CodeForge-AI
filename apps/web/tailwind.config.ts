import type { Config } from 'tailwindcss';
import sharedConfig from '@codeforge/config/tailwind';

const config: Config = {
  ...sharedConfig,
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/shared/src/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;
