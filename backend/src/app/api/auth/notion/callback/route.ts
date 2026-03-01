// Notion OAuth — callback handler
// Exchanges the authorization code for an access token and stores it
import { NextRequest, NextResponse } from 'next/server';
import { storeToken } from '@/lib/oauth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://565ybsck.run.complete.dev';

  if (error || !code) {
    return NextResponse.redirect(
      `${appUrl}/dashboard?integration_error=notion&reason=${encodeURIComponent(error || 'no_code')}`
    );
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = `${appUrl}/api/auth/notion/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/dashboard?integration_error=notion&reason=not_configured`);
  }

  try {
    // Exchange code for token using Basic auth (Notion requirement)
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error('[Notion OAuth] Token exchange failed:', tokenData);
      return NextResponse.redirect(
        `${appUrl}/dashboard?integration_error=notion&reason=${encodeURIComponent(tokenData.error || 'token_exchange_failed')}`
      );
    }

    // Store the token
    storeToken('notion', {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      bot_id: tokenData.bot_id,
      workspace_id: tokenData.workspace_id,
      workspace_name: tokenData.workspace_name,
      workspace_icon: tokenData.workspace_icon,
      owner: tokenData.owner,
    });

    console.log(`[Notion OAuth] Connected: workspace=${tokenData.workspace_name}`);
    return NextResponse.redirect(`${appUrl}/dashboard?integration_success=notion`);

  } catch (err) {
    console.error('[Notion OAuth] Unexpected error:', err);
    return NextResponse.redirect(`${appUrl}/dashboard?integration_error=notion&reason=server_error`);
  }
}
