// ============================================================
// app/api/ai/route.ts
// MiniMax AI API 프록시 — Next.js API Route
// POST /api/ai → MiniMax chatcompletion_v2 전달
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

const MINIMAX_ENDPOINT = 'https://api.minimax.chat/v1/text/chatcompletion_v2';

interface AIRequestBody {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  apiKey: string;               // 클라이언트에서 전달하는 API 키
}

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  try {
    const body: AIRequestBody = await request.json();

    // API 키 검증
    if (!body.apiKey) {
      return NextResponse.json(
        { error: 'API 키가 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    // 메시지 검증
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: '메시지가 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    // MiniMax API 요청 본문 구성
    const miniMaxPayload = {
      model: body.model || 'MiniMax-01',
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
      top_p: body.top_p ?? 0.9,
      max_tokens: body.max_tokens ?? 2048,
      stream: body.stream ?? false,
    };

    // MiniMax API 호출
    const response = await fetch(MINIMAX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${body.apiKey}`,
      },
      body: JSON.stringify(miniMaxPayload),
    });

    // 스트리밍 응답 처리
    if (body.stream && response.body) {
      // 스트리밍 응답을 그대로 전달
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // 비스트리밍 응답 처리
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `MiniMax API 오류 (${response.status}): ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('AI API 프록시 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '내부 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// GET 요청 거부
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'GET 요청은 지원되지 않습니다. POST 요청을 사용하세요.' },
    { status: 405 }
  );
}
