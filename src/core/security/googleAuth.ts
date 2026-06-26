import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { AppError } from '../errors';

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export async function verifyGoogleIdToken(idToken: string): Promise<{ sub: string; email: string }> {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) throw new Error('Payload de Google incompleto');
    // Rechazamos emails no verificados — evita que un atacante use un email sin confirmar
    // para hacer matching por email con una cuenta existente
    if (!payload.email_verified) throw new Error('Email de Google no verificado');
    return { sub: payload.sub, email: payload.email };
  } catch {
    // No re-lanzamos el error original para no filtrar detalles de Google al cliente
    throw new AppError(401, 'Token de Google inválido');
  }
}
