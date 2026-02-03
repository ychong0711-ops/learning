// ============================================================
// lib/flashcard-types.ts
// 플래시카드 시스템 전체에서 공유하는 타입 정의
// ============================================================

// ---------- 기본 카드 & 덱 타입 ----------

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  chapter?: string;
  section?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  easeFactor: number;       // SM-2 이즈팩토리 (초기값 2.5)
  interval: number;         // 복습 간격 (일 단위)
  repetitions: number;      // 복습 횟수
  nextReviewDate: string;   // ISO string
  lastReviewDate?: string;
  tags?: string[];
  visualMedia?: VisualMedia;
}

export interface FlashcardDeck {
  id: string;
  name: string;
  description: string;
  cards: Flashcard[];
  createdAt: string;        // ISO string
  updatedAt: string;        // ISO string
  tags?: string[];
  category?: string;
}

// ---------- 학습 세션 & 리뷰 결과 ----------

export interface ReviewResult {
  cardId: string;
  quality: number;          // 0–5 평가 점수
  reviewedAt: string;       // ISO string
  timeTaken?: number;       // 밀리초
  isCorrect?: boolean;
}

export interface StudySession {
  id: string;
  deckId: string;
  startedAt: string;
  endedAt?: string;
  results: ReviewResult[];
  mode: 'normal' | 'interleaved' | 'deliberate' | 'dual-coding';
}

// ---------- 시각 미디어 ----------

export interface VisualMedia {
  type: 'image' | 'diagram' | 'chart' | 'formula';
  url?: string;
  alt?: string;
  caption?: string;
  latexFormula?: string;    // KaTeX 수식
}

// ---------- 의도적 연습 (Deliberate Practice) ----------

export interface DeliberatePracticeConfig {
  focusAreas: string[];           // 약점 주제들
  difficultyLevel: 'easy' | 'medium' | 'hard';
  maxCards: number;
  adaptiveThreshold: number;      // 정답율 기준값 (0–1)
  sourceDeckIds?: string[];       // 소스 덱 필터
}

// ---------- 혼합 연습 (Interleaved Practice) ----------

export interface InterleavedConfig {
  deckIds: string[];              // 혼합할 덱 ID 목록
  cardsPerDeck: number;           // 덱당 카드 수
  shuffleMode: 'random' | 'round-robin' | 'weighted';
  difficultyRange?: {
    min: 'easy' | 'medium' | 'hard';
    max: 'easy' | 'medium' | 'hard';
  };
}
