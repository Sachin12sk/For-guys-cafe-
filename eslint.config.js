import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'docs/**/*', 'android/**/*', 'node_modules/**/*', 'src/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
