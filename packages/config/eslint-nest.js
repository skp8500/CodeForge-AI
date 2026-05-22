/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: [require.resolve('./eslint.js')],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
};
