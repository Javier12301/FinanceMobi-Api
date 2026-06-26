import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Hash real precomputado al arrancar — garantiza que verifyPassword() siempre se ejecuta
// aunque el usuario no exista, eliminando la diferencia de tiempo que revela enumeración de usuarios
export const DUMMY_HASH = bcrypt.hashSync('__dummy__', ROUNDS);
