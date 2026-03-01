// OAuth token storage
// Primary: JSON file (persists across restarts, works without Supabase)
// Secondary: Supabase oauth_tokens table if available

import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), '.oauth-tokens.json');

export interface OAuthToken {
  provider: string;
  access_token: string;
  token_type?: string;
  scope?: string;
  refresh_token?: string;
  expires_at?: string;
  workspace_id?: string;
  workspace_name?: string;
  workspace_icon?: string;
  bot_id?: string;
  owner?: Record<string, unknown>;
  stored_at: string;
}

function readTokens(): Record<string, OAuthToken> {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeTokens(tokens: Record<string, OAuthToken>): void {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (err) {
    console.error('[OAuth] Failed to write token file:', err);
  }
}

export function storeToken(provider: string, data: Omit<OAuthToken, 'provider' | 'stored_at'>): OAuthToken {
  const tokens = readTokens();
  const token: OAuthToken = { ...data, provider, stored_at: new Date().toISOString() };
  tokens[provider] = token;
  writeTokens(tokens);
  console.log(`[OAuth] Token stored for provider: ${provider}`);
  return token;
}

export function getToken(provider: string): OAuthToken | null {
  const tokens = readTokens();
  return tokens[provider] || null;
}

export function getAllTokens(): Record<string, OAuthToken> {
  return readTokens();
}

export function deleteToken(provider: string): void {
  const tokens = readTokens();
  delete tokens[provider];
  writeTokens(tokens);
}

export function isConnected(provider: string): boolean {
  const token = getToken(provider);
  if (!token) return false;
  if (token.expires_at && new Date(token.expires_at) < new Date()) return false;
  return true;
}
