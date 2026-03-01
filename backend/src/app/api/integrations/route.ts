// GET /api/integrations
// Returns connection status and metadata for all OAuth providers
import { NextResponse } from 'next/server';
import { getAllTokens, isConnected } from '@/lib/oauth';

const PROVIDERS = ['notion', 'google'] as const;

export async function GET() {
  const tokens = getAllTokens();

  const integrations = PROVIDERS.map(provider => {
    const token = tokens[provider];
    const connected = isConnected(provider);
    return {
      provider,
      connected,
      ...(connected && token ? {
        workspace_name: token.workspace_name,
        workspace_icon: token.workspace_icon,
        email: (token.owner as Record<string, unknown>)?.email,
        name: (token.owner as Record<string, unknown>)?.name,
        stored_at: token.stored_at,
        expires_at: token.expires_at,
      } : {}),
    };
  });

  return NextResponse.json({ integrations });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');
  if (!provider || !PROVIDERS.includes(provider as typeof PROVIDERS[number])) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }
  const { deleteToken } = await import('@/lib/oauth');
  deleteToken(provider);
  return NextResponse.json({ success: true });
}
