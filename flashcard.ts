// ============================================================
// lib/flashcard.ts
// SM-2 간격 반복 알고리즘 + 덱/세션 저장·로드 로직
// exports: getDueCards, sortCardsForStudy, calculateNextReview,
//          saveDecksToStorage, loadDecksFromStorage, getStudyStatistics
// ============================================================

import { Flashcard, FlashcardDeck, StudySession, ReviewResult } from './flashcard-types';

// ---------- localStorage 키 ----------
const DECKS_STORAGE_KEY = 'user_decks';
const SESSIONS_STORAGE_KEY = 'study_sessions';

// ─── SM-2 핵심 계산 ──────────────────────────────────────────

/**
 * quality: 0~5 평가 점수
 *   0 – 완전히 기억 못함
 *   1 – 간신히 떠올림
 *   2 – 틀리지만 답을 본 후 이해
 *   3 – 어렵지만 정답
 *   4 – 쉽게 정답
 *   5 – 완벽하게 정답
 */
export function calculateNextReview(card: Flashcard, quality: number): Flashcard {
  let { easeFactor, interval, repetitions } = card;

  if (quality < 3) {
    // 재학습: 간격 초기화
    repetitions = 0;
    interval = 1;
  } else {
    // 복습 성공
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // EF 조정 공식: EF' = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3; // 최소 EF

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);

  return {
    ...card,
    easeFactor,
    interval,
    repetitions,
    lastReviewDate: new Date().toISOString(),
    nextReviewDate: nextDate.toISOString(),
    difficulty: quality >= 4 ? 'easy' : quality >= 3 ? 'medium' : 'hard',
  };
}

// ─── 카드 조회 & 정렬 ─────────────────────────────────────────

/**
 * 오늘 복습이 필요한 카드 목록을 반환.
 * nextReviewDate가 현재 시각 이전인 카드만 포함.
 */
export function getDueCards(cards: Flashcard[]): Flashcard[] {
  const now = new Date();
  return cards.filter((card) => new Date(card.nextReviewDate) <= now);
}

/**
 * 학습 우선순위로 카드를 정렬.
 * 기준: 복습일 가장 오래된 순 → 어려운 카드 우선 → EF 낮은 순
 */
export function sortCardsForStudy(cards: Flashcard[]): Flashcard[] {
  return [...cards].sort((a, b) => {
    // 1순위: nextReviewDate 오름차순 (가장 오래된 복습일 먼저)
    const dateDiff = new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime();
    if (dateDiff !== 0) return dateDiff;
    // 2순위: difficulty (hard > medium > easy)
    const diffMap: Record<string, number> = { hard: 0, medium: 1, easy: 2 };
    const diffDiff = (diffMap[a.difficulty] ?? 1) - (diffMap[b.difficulty] ?? 1);
    if (diffDiff !== 0) return diffDiff;
    // 3순위: easeFactor 낮은 순
    return a.easeFactor - b.easeFactor;
  });
}

// ─── 저장소 CRUD ──────────────────────────────────────────────

/**
 * 사용자 덱 목록을 localStorage에 저장.
 * cards 배열은 제외하고 메타정보만 저장 (카드 본체는 별도 덱별 키에 저장).
 */
export function saveDecksToStorage(decks: FlashcardDeck[]): void {
  if (typeof window === 'undefined') return;
  try {
    // 덱 메타 목록 저장
    const deckMetas = decks.map(({ id, name, description, createdAt, updatedAt, tags, category, cards }) => ({
      id,
      name,
      description,
      cardCount: cards.length,
      createdAt,
      updatedAt,
      tags,
      category,
    }));
    localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(deckMetas));

    // 각 덱의 카드 본체를 개별 키에 저장
    decks.forEach((deck) => {
      localStorage.setItem(`deck_cards_${deck.id}`, JSON.stringify(deck.cards));
    });
  } catch (e) {
    console.error('덱 저장 실패:', e);
  }
}

/**
 * localStorage에서 사용자 덱 목록을 로드.
 * 각 덱의 카드 본체도 개별 키에서 복원.
 */
export function loadDecksFromStorage(): FlashcardDeck[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DECKS_STORAGE_KEY);
    if (!raw) return [];
    const metas = JSON.parse(raw);
    return metas.map((meta: any) => {
      const cardsRaw = localStorage.getItem(`deck_cards_${meta.id}`);
      const cards: Flashcard[] = cardsRaw ? JSON.parse(cardsRaw) : [];
      return {
        id: meta.id,
        name: meta.name,
        description: meta.description || '',
        cards,
        createdAt: meta.createdAt || new Date().toISOString(),
        updatedAt: meta.updatedAt || new Date().toISOString(),
        tags: meta.tags,
        category: meta.category,
      } as FlashcardDeck;
    });
  } catch (e) {
    console.error('덱 로드 실패:', e);
    return [];
  }
}

// ─── 학습 통계 ────────────────────────────────────────────────

export interface StudyStatistics {
  totalReviews: number;
  correctCount: number;
  incorrectCount: number;
  averageQuality: number;       // 평균 평가 점수
  completionRate: number;       // 정답율 (0–100)
  averageTime: number;          // 카드당 평균 응답 시간 (밀리초)
  streakCount: number;          // 연속 정답 횟수
  hardCards: string[];           // 반복 실패 카드 ID
}

/**
 * 세션의 리뷰 결과로부터 학습 통계를 계산.
 */
export function getStudyStatistics(session: StudySession): StudyStatistics {
  const results = session.results;
  if (results.length === 0) {
    return {
      totalReviews: 0,
      correctCount: 0,
      incorrectCount: 0,
      averageQuality: 0,
      completionRate: 0,
      averageTime: 0,
      streakCount: 0,
      hardCards: [],
    };
  }

  const totalReviews = results.length;
  const correctCount = results.filter((r) => r.quality >= 3).length;
  const incorrectCount = totalReviews - correctCount;
  const totalQuality = results.reduce((sum, r) => sum + r.quality, 0);
  const averageQuality = parseFloat((totalQuality / totalReviews).toFixed(2));
  const completionRate = parseFloat(((correctCount / totalReviews) * 100).toFixed(1));

  const timings = results.filter((r) => r.timeTaken && r.timeTaken > 0).map((r) => r.timeTaken!);
  const averageTime = timings.length > 0
    ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length)
    : 0;

  // 연속 정답 스트릭 (끝부터 역순으로)
  let streakCount = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].quality >= 3) streakCount++;
    else break;
  }

  // 반복 실패 카드 (quality < 3인 카드 ID, 중복 제거)
  const hardCards = [...new Set(results.filter((r) => r.quality < 3).map((r) => r.cardId))];

  return { totalReviews, correctCount, incorrectCount, averageQuality, completionRate, averageTime, streakCount, hardCards };
}
