// ============================================================
// lib/ai.ts
// MiniMax AI API 통신, 스트리밍, API 키 관리, 채팅 히스토리
// exports: ChatMessage, QuizQuestion, QuizResponse, SummaryResponse,
//          LearningPlan, streamAIResponse, fetchAIResponse,
//          saveApiKey, getApiKey, hasApiKey,
//          saveChatHistory, loadChatHistory, trimContext
// ============================================================

// ---------- localStorage 키 ----------
const API_KEY_STORAGE = 'minimax_api_key';
const MODEL_STORAGE   = 'minimax_model';
const CHAT_HISTORY_KEY = 'chat_history';

// ---------- MiniMax API 설정 ----------
const MINIMAX_ENDPOINT = 'https://api.minimax.chat/v1/text/chatcompletion_v2';
const DEFAULT_MODEL    = 'MiniMax-01';

// ─── 타입 정의 ────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic?: string;
}

export interface QuizResponse {
  questions: QuizQuestion[];
  metadata?: {
    topic: string;
    totalQuestions: number;
    generatedAt: string;
  };
}

export interface SummaryResponse {
  keySummary: string;          // 핵심 요약
  eli5Explanation: string;    // 쉬운 설명 (ELI5)
  keyTerms: string[];         // 핵심 용어 목록
  metadata?: {
    sourceLength: number;
    generatedAt: string;
  };
}

export interface LearningPlan {
  id: string;
  title: string;
  description: string;
  weeklyGoals: WeeklyGoal[];
  generatedAt: string;
  estimatedHoursPerDay: number;
}

export interface WeeklyGoal {
  week: number;
  topics: string[];
  tasks: string[];
  milestones: string[];
}

// ─── API 키 관리 ──────────────────────────────────────────────

export function saveApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(API_KEY_STORAGE);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

function getModel(): string {
  if (typeof window === 'undefined') return DEFAULT_MODEL;
  return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
}

// ─── 컨텍스트 관리 ────────────────────────────────────────────

/**
 * 메시지 배열을 토큰 제한을 고려하여 잘라냄.
 * system 메시지는 항상 보존, 최근 메시지부터 우선.
 * @param maxMessages 유지할 최대 메시지 수
 */
export function trimContext(messages: ChatMessage[], maxMessages: number = 20): ChatMessage[] {
  if (messages.length <= maxMessages) return messages;

  // system 메시지를 분리
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const otherMsgs  = messages.filter((m) => m.role !== 'system');

  // 최근 메시지만 유지 (system 메시지 수를 제외한 분)
  const allowedCount = maxMessages - systemMsgs.length;
  const trimmedOther = otherMsgs.slice(-allowedCount);

  return [...systemMsgs, ...trimmedOther];
}

// ─── 채팅 히스토리 저장·로드 ──────────────────────────────────

export function saveChatHistory(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
  } catch (e) {
    console.error('채팅 히스토리 저장 실패:', e);
  }
}

export function loadChatHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('채팅 히스토리 로드 실패:', e);
    return [];
  }
}

// ─── API 호출 (비스트리밍) ────────────────────────────────────

/**
 * MiniMax API에 메시지를 보내고 완전한 응답을 반환.
 * 주로 퀴즈·요약·학습 계획 등 구조화된 응답이 필요한 경우 사용.
 */
export async function fetchAIResponse(
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API 키가 설정되어 있지 않습니다. 먼저 API 키를 입력하세요.');

  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const trimmed = trimContext(fullMessages, 30);

  const response = await fetch(MINIMAX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages: trimmed,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2048,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`MiniMax API 오류 (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 응답에서 내용을 추출할 수 없습니다.');
  return content;
}

// ─── API 호출 (스트리밍) ──────────────────────────────────────

/**
 * MiniMax API 스트리밍 응답을 AsyncGenerator로 반환.
 * 주로 채팅 모드에서 실시간 타이핑 효과를 위해 사용.
 *
 * 사용법:
 *   for await (const chunk of streamAIResponse(messages)) {
 *     setResponseText(prev => prev + chunk);
 *   }
 */
export async function* streamAIResponse(
  messages: ChatMessage[],
  systemPrompt?: string
): AsyncGenerator<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API 키가 설정되어 있지 않습니다.');

  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const trimmed = trimContext(fullMessages, 30);

  const response = await fetch(MINIMAX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages: trimmed,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2048,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`MiniMax API 스트리밍 오류 (${response.status}): ${errBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('스트리밍 본문을 읽을 수 없습니다.');

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    // SSE 형식 파싱: "data: {...}\n\n"
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('data: ')) {
        const jsonStr = trimmedLine.slice(6);
        if (jsonStr === '[DONE]') return;
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 불완전한 JSON은 무시
        }
      }
    }
  }
}
