import { google } from 'googleapis';
import { decrypt } from './encryption';
import { env } from '../config/env';

export function getDriveClient(encryptedRefreshToken: string) {
  const oauth2 = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  const refreshToken = decrypt(encryptedRefreshToken, env.ENCRYPTION_KEY);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}
