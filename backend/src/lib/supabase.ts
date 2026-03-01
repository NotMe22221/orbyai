import { createClient } from '@supabase/supabase-js';
import { AgentLogEntry } from '@/types';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function logAgentAction(entry: AgentLogEntry): Promise<void> {
  if (!supabase) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Supabase mock] ${entry.agentName} | ${entry.durationMs}ms`);
    }
    return;
  }
  try {
    await supabase.from('agent_log').insert({
      session_id: entry.sessionId,
      agent_name: entry.agentName,
      input: entry.input,
      output: entry.output,
      duration_ms: entry.durationMs,
      created_at: entry.timestamp,
    });
  } catch (error) {
    console.error('[Supabase] Log error:', error);
  }
}

export async function createSession(sessionId: string, metadata: Record<string, unknown>) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('sessions')
    .insert({ id: sessionId, metadata, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function logMessage(sessionId: string, role: string, content: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, role, content, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function logAction(
  sessionId: string,
  action: Record<string, unknown>,
  result: Record<string, unknown>
) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('actions')
    .insert({
      session_id: sessionId,
      action_type: action.type,
      action_payload: action,
      result,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
