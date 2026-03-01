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
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in auth response');
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

// One-shot: creates a fresh chat per call (used by AgentA / AgentB)
export async function callDeployAI(prompt: string): Promise<string> {
  const token = await getAccessToken();
  const chatId = await createChat(token);
  return await sendMessage(token, chatId, prompt);
}

/**
 * Session-aware: creates or reuses a persistent DeployAI chat thread.
 * Pass existingChatId to continue a conversation; omit to start fresh.
 * When starting fresh, supply systemPrompt to establish context before
 * the first real user message.
 */
export async function callDeployAIInSession(
  message: string,
  existingChatId?: string,
  systemPrompt?: string
): Promise<{ response: string; chatId: string }> {
  const token = await getAccessToken();
  let chatId = existingChatId;

  if (!chatId) {
    chatId = await createChat(token);
    if (systemPrompt) {
      // Prime the conversation — response is intentionally discarded
      await sendMessage(token, chatId, systemPrompt);
    }
  }

  const response = await sendMessage(token, chatId, message);
  return { response, chatId };
}
