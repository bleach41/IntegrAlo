/**
 * Spanish interface texts. Kept apart from the components so another language can be
 * added as a file with the same keys (requirement: interface ready for English).
 */
export const es = {
  common: {
    continue: 'Continuar',
    signOut: 'Cerrar sesión',
    loading: 'Cargando…',
    unexpectedError: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
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
  },
  setup: {
    title: 'Primer uso',
    subtitle: 'Crea la cuenta de ingeniería que administrará esta instalación.',
    username: 'Usuario',
    password: 'Contraseña',
    confirm: 'Repite la contraseña',
    create: 'Crear cuenta',
    mismatch: 'Las contraseñas no coinciden.',
    tooShort: 'La contraseña debe tener al menos 8 caracteres.',
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
    greeting: 'Hola, {name}',
    server: 'Servidor: {url}',
    nextSteps: 'Aquí aparecerán los nodos, sus lecturas y las alarmas.',
  },
};

const roles: Record<string, string> = { engineer: 'Ingeniería', user: 'Usuario' };

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Every valid text key, e.g. "login.title"; a typo is a compile error. */
export type TextKey = Leaves<typeof es>;

/** Display name of a role; unknown (custom) roles are shown by their id. */
export function roleName(roleId: string): string {
  return roles[roleId] ?? roleId;
}

/** Looks up a text by its key ("login.title") and fills {placeholders}. */
export function t(key: TextKey, params: Record<string, string> = {}): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], es);
  return String(value).replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`);
}
