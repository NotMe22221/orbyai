// Google OAuth — callback handler
// Exchanges the authorization code for access + refresh tokens and stores them
import { NextRequest, NextResponse } from 'next/server';
import { storeToken } from '@/lib/oauth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://565ybsck.run.complete.dev';

  if (error || !code) {
    return NextResponse.redirect(
      `${appUrl}/dashboard?integration_error=google&reason=${encodeURIComponent(error || 'no_code')}`
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/dashboard?integration_error=google&reason=not_configured`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error('[Google OAuth] Token exchange failed:', tokenData);
      return NextResponse.redirect(
        `${appUrl}/dashboard?integration_error=google&reason=${encodeURIComponent(tokenData.error || 'token_exchange_failed')}`
      );
    }

    // Fetch user profile
    let profile: Record<string, unknown> = {};
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      profile = await profileRes.json();
    } catch { /* non-critical */ }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : undefined;

    storeToken('google', {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
      expires_at: expiresAt,
      owner: profile,
    });

    console.log(`[Google OAuth] Connected: ${profile.email || 'unknown'}`);
    return NextResponse.redirect(`${appUrl}/dashboard?integration_success=google`);

  } catch (err) {
    console.error('[Google OAuth] Unexpected error:', err);
    return NextResponse.redirect(`${appUrl}/dashboard?integration_error=google&reason=server_error`);
  }
}
