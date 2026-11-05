/** Spanish texts (reference language: the other languages must have the same keys). */
const es = {
  common: {
    signOut: 'Cerrar sesión',
    unexpectedError: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  },
  brand: {
    tagline: 'Supervisión y control local',
  },
  connect: {
    title: 'Conectar con el servidor',
    subtitle: 'Escribe la dirección del equipo donde se ejecuta IntegrAlo en tu red local.',
    address: 'Dirección del servidor',
    addressHint: 'Por ejemplo: 192.168.1.10 o 192.168.1.10:4100',
    connect: 'Conectar',
    unreachable: 'No se pudo conectar con el servidor. Comprueba la dirección y que el equipo esté encendido y en la misma red.',
    notIntegralo: 'La dirección responde, pero no es un servidor de IntegrAlo.',
    change: 'Cambiar servidor',
    current: 'Servidor: {{url}}',
  },
  setup: {
    title: 'Primer uso',
    subtitle: 'Crea la cuenta de ingeniería que administrará esta instalación.',
    username: 'Usuario',
    password: 'Contraseña',
    confirm: 'Repite la contraseña',
    create: 'Crear cuenta',
    mismatch: 'Las contraseñas no coinciden.',
    tooShort: 'La contraseña debe tener al menos {{min}} caracteres.',
    invalidUsername: 'El usuario debe tener de 3 a 32 caracteres: letras, números, «.», «_» o «-».',
    alreadyDone: 'Esta instalación ya fue configurada. Inicia sesión.',
  },
  login: {
    title: 'Iniciar sesión',
    username: 'Usuario',
    password: 'Contraseña',
    submit: 'Entrar',
    invalid: 'Usuario o contraseña incorrectos.',
    locked: 'Demasiados intentos fallidos. Espera un minuto e inténtalo de nuevo.',
  },
  home: {
    greeting: 'Hola, {{name}}',
    nextSteps: 'Aquí aparecerán los nodos, sus lecturas y las alarmas.',
  },
  roles: {
    engineer: 'Ingeniería',
    user: 'Usuario',
  },
  preferences: {
    title: 'Preferencias',
    theme: 'Tema',
    language: 'Idioma',
    system: 'Sistema',
    light: 'Claro',
    dark: 'Oscuro',
    es: 'Español',
    en: 'English',
  },
};

export default es;
