import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  // Scripts de construction en CommonJS (configuration de l'installeur, génération de l'icône)
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } }
)
