import type es from './es';

/** English texts. Typed against Spanish: a missing or extra key is a compile error. */
const en: typeof es = {
  common: {
    signOut: 'Sign out',
    unexpectedError: 'Something went wrong. Please try again.',
  },
  brand: {
    tagline: 'Local supervision and control',
  },
  connect: {
    title: 'Connect to the server',
    subtitle: 'Enter the address of the computer running IntegrAlo on your local network.',
    address: 'Server address',
    addressHint: 'For example: 192.168.1.10 or 192.168.1.10:4100',
    connect: 'Connect',
    unreachable: 'Could not reach the server. Check the address and that the computer is on and on the same network.',
    notIntegralo: 'The address answers, but it is not an IntegrAlo server.',
    change: 'Change server',
    current: 'Server: {{url}}',
  },
  setup: {
    title: 'First run',
    subtitle: 'Create the engineering account that will manage this installation.',
    username: 'Username',
    password: 'Password',
    confirm: 'Repeat the password',
    create: 'Create account',
    mismatch: 'The passwords do not match.',
    tooShort: 'The password must have at least {{min}} characters.',
    invalidUsername: 'The username must have 3 to 32 characters: letters, digits, ".", "_" or "-".',
    alreadyDone: 'This installation is already set up. Please sign in.',
  },
  login: {
    title: 'Sign in',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    invalid: 'Wrong username or password.',
    locked: 'Too many failed attempts. Wait a minute and try again.',
  },
  home: {
    greeting: 'Hello, {{name}}',
    nextSteps: 'Nodes, their readings and alarms will appear here.',
  },
  roles: {
    engineer: 'Engineering',
    user: 'User',
  },
  preferences: {
    title: 'Preferences',
    theme: 'Theme',
    language: 'Language',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    es: 'Español',
    en: 'English',
  },
};

export default en;
