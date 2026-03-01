// Deploy AI client helper

export async function getAccessToken(): Promise<string> {
  const authUrl = process.env.AUTH_URL || 'https://api-auth.deploy.ai/oauth2/token';
  const res = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.CLIENT_ID || '',
      client_secret: process.env.CLIENT_SECRET || '',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

export async function createChat(accessToken: string): Promise<string> {
  const baseUrl = process.env.API_URL || 'https://core-api.deploy.ai';
  const res = await fetch(`${baseUrl}/chats`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Org': process.env.ORG_ID || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agentId: 'GPT_4O', stream: false }),
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Failed to create chat: ${JSON.stringify(data)}`);
  return data.id;
}

export async function sendMessage(
  accessToken: string,
  chatId: string,
  content: string
): Promise<string> {
  const baseUrl = process.env.API_URL || 'https://core-api.deploy.ai';
  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Org': process.env.ORG_ID || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chatId,
      stream: false,
      content: [{ type: 'text', value: content }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.value || '';
}

export async function callDeployAI(prompt: string): Promise<string> {
  const token = await getAccessToken();
  const chatId = await createChat(token);
  return await sendMessage(token, chatId, prompt);
}
