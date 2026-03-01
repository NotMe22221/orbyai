// Rule-based safety gate for browser actions
// TASK-1042: Safety validation layer
// Auto-approves safe actions, flags destructive ones

import { BrowserAction, ActionType } from '@/types';

export interface SafetyResult {
  safe: boolean;
  requiresApproval: boolean;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
}

// Actions that are always safe (read/view only)
const SAFE_ACTIONS: ActionType[] = ['copy_clipboard', 'scroll_to', 'inject_overlay'];

// Actions that need approval based on context
const CONTEXT_DEPENDENT: ActionType[] = ['fill_field', 'open_tab', 'navigate'];

// Actions that always require approval
const ALWAYS_APPROVE: ActionType[] = ['click'];

// Destructive URL patterns
const DESTRUCTIVE_PATTERNS = [
  /delete/i,
  /remove/i,
  /destroy/i,
  /logout/i,
  /sign-?out/i,
  /unsubscribe/i,
  /cancel/i,
  /deactivate/i,
];

// Sensitive selector patterns
const SENSITIVE_SELECTORS = [
  /password/i,
  /credit.?card/i,
  /ssn/i,
  /social.?security/i,
  /cvv/i,
  /pin/i,
];

// Submit/send button patterns
const SUBMIT_PATTERNS = [
  /submit/i,
  /send/i,
  /confirm/i,
  /pay/i,
  /purchase/i,
  /buy/i,
  /checkout/i,
  /place.?order/i,
];

export function validateAction(action: BrowserAction): SafetyResult {
  const { type } = action;

  // Always safe
  if (SAFE_ACTIONS.includes(type)) {
    return { safe: true, requiresApproval: false, reason: 'Read-only action', riskLevel: 'low' };
  }

  // Always requires approval
  if (ALWAYS_APPROVE.includes(type)) {
    const selector = action.selector || '';
    const isDestructive = DESTRUCTIVE_PATTERNS.some(p => p.test(selector));
    const isSubmit = SUBMIT_PATTERNS.some(p => p.test(selector));

    if (isDestructive) {
      return {
        safe: false,
        requiresApproval: true,
        reason: `Potentially destructive click: ${selector}`,
        riskLevel: 'high',
      };
    }
    if (isSubmit) {
      return {
        safe: true,
        requiresApproval: true,
        reason: `Submit/send action requires confirmation`,
        riskLevel: 'medium',
      };
    }
    return {
      safe: true,
      requiresApproval: true,
      reason: 'Click action requires approval',
      riskLevel: 'medium',
    };
  }

  // Context-dependent
  if (CONTEXT_DEPENDENT.includes(type)) {
    if (type === 'fill_field') {
      const selector = action.selector || '';
      const isSensitive = SENSITIVE_SELECTORS.some(p => p.test(selector));
      if (isSensitive) {
        return {
          safe: false,
          requiresApproval: true,
          reason: `Sensitive field detected: ${selector}`,
          riskLevel: 'high',
        };
      }
      return { safe: true, requiresApproval: false, reason: 'Standard field fill', riskLevel: 'low' };
    }

    if (type === 'navigate' || type === 'open_tab') {
      const url = action.url || '';
      const isDestructive = DESTRUCTIVE_PATTERNS.some(p => p.test(url));
      if (isDestructive) {
        return {
          safe: false,
          requiresApproval: true,
          reason: `Potentially destructive navigation: ${url}`,
          riskLevel: 'high',
        };
      }
      return { safe: true, requiresApproval: false, reason: 'Safe navigation', riskLevel: 'low' };
    }
  }

  // Default: require approval for unknown
  return {
    safe: true,
    requiresApproval: true,
    reason: 'Unknown action type — approval required',
    riskLevel: 'medium',
  };
}

export function sanitizeAction(action: BrowserAction): BrowserAction {
  return {
    ...action,
    // Sanitize selector to prevent XSS via injected selectors
    selector: action.selector?.replace(/[<>"'`]/g, '') ?? action.selector,
    // Sanitize injected HTML
    html: action.html
      ? action.html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+="[^"]*"/gi, '')
      : action.html,
  };
}
