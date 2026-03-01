// Notion OAuth — initiate flow
// Redirects the user to Notion’s consent screen
import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'NOTION_CLIENT_ID not configured' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://565ybsck.run.complete.dev';
  const redirectUri = `${appUrl}/api/auth/notion/callback`;

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('redirect_uri', redirectUri);

  return NextResponse.redirect(authUrl.toString());
}
