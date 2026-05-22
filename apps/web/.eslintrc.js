module.exports = {
  ...require('@codeforge/config/eslint-next'),
  rules: {
    ...require('@codeforge/config/eslint-next').rules,
    'import/default': 'off',
    'import/namespace': 'off',
  },
};
