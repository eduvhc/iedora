import { defineConfig, globalIgnores } from 'eslint/config'
import { base, react, typescript, vitest } from '@iedora/eslint-config'

const eslintConfig = defineConfig([
  ...base(),
  ...typescript(),
  ...react(),
  ...vitest(),
  globalIgnores(['dist/**', 'eslint.config.mjs']),
])

export default eslintConfig
