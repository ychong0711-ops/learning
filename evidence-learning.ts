// ============================================================
// lib/evidence-learning.ts
// 증거 기반 학습 모듈: 의도적 연습, 혼합 학습, 이중 부호화, 메타인지
// exports:
//   createDeliberatePracticeDeck, createInterleavedDeck
//   AdaptiveFeedback, getAdaptiveFeedback, difficultyToNumber
//   DualCodingCard, formatDualCodingCard, DualCodingConfig
//   createPreStudyMetacognition, createMidStudyCheck, createPostStudyMetacognition
//   MetacognitionChecklist, MetacognitionQuestion, calculateMetacognitionScore
//   analyzeInterleavedDistribution
// ============================================================

import { Flashcard, FlashcardDeck, DeliberatePracticeConfig, InterleavedConfig } from './flashcard-types';

// ──────────────────────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────────────────────

export interface AdaptiveFeedback {
  level: 'excellent' | 'good' | 'needs_review' | 'struggling';
  message: string;
  suggestedAction: string;
  adjustedDifficulty: 'easy' | 'medium' | 'hard';
}

export interface DualCodingConfig {
  enableVisual: boolean;
  enableVerbal: boolean;
  visualPrompt?: string;
  verbalPrompt?: string;
}

export interface DualCodingCard {
  id: string;
  front: string;
  back: string;
  visualDescription: string;   // 시각적 표현 제안
  verbalSummary: string;       // 언어적 요약
  mnemonic?: string;           // 기억술
  config: DualCodingConfig;
}

export interface MetacognitionQuestion {
  id: string;
  text: string;
  type: 'rating' | 'yesno' | 'selection' | 'text';
  scale?: number;              // rating일 때 최대값
  options?: string[];          // selection일 때 선택지
}

export interface MetacognitionChecklist {
  phase: 'pre' | 'mid' | 'post';
  questions: MetacognitionQuestion[];
  metadata?: {
    generatedAt: string;
    context?: string;
  };
  // pre/post 단계별 접근: preStudy / postStudy 키로 감싸기
  preStudy?: { questions: MetacognitionQuestion[] };
  postStudy?: { questions: MetacognitionQuestion[] };
}

// ──────────────────────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────────────────────

/**
 * difficulty 문자열을 숫자로 변환한다.
 */
export function difficultyToNumber(difficulty: 'easy' | 'medium' | 'hard'): number {
  switch (difficulty) {
    case 'easy':   return 1;
    case 'medium': return 2;
    case 'hard':   return 3;
    default:       return 2;
  }
}

// ──────────────────────────────────────────────────────────────
// 의도적 연습 덱 생성
// ──────────────────────────────────────────────────────────────

/**
 * DeliberatePracticeConfig에 따라 의도적 연습용 덱을 생성한다.
 * focusAreas에 해당하는 카드를 필터링하고, difficulty에 맞게 정렬한다.
 */
export function createDeliberatePracticeDeck(
  allDecks: FlashcardDeck[],
  config: DeliberatePracticeConfig
): FlashcardDeck {
  const { focusAreas, difficultyLevel, maxCards, adaptiveThreshold } = config;

  // 전체 카드를 수집
  let allCards: Flashcard[] = [];
  allDecks.forEach((deck) => {
    const cards = deck.cards || [];
    cards.forEach((card: Flashcard) => {
      // focusAreas가 있으면 카드의 카테고리/태그로 필터링
      if (focusAreas && focusAreas.length > 0) {
        const cardTags = (card.tags || []).map((t: string) => t.toLowerCase());
        const cardCategory = (card.category || deck.category || '').toLowerCase();
        const matched = focusAreas.some((area) =>
          cardTags.includes(area.toLowerCase()) || cardCategory.includes(area.toLowerCase())
        );
        if (!matched) return;
      }
      allCards.push(card);
    });
  });

  // difficulty 필터링
  if (difficultyLevel) {
    const diffNum = difficultyToNumber(difficultyLevel);
    // easeFactor 기준 분류: < 2.0 → hard, 2.0~2.5 → medium, > 2.5 → easy
    allCards = allCards.filter((card) => {
      const ef = card.easeFactor ?? 2.5;
      const cardDiffNum = ef < 2.0 ? 3 : ef < 2.5 ? 2 : 1;
      // adaptiveThreshold 기준으로 약간의 유연성 적용
      const threshold = adaptiveThreshold ?? 0;
      return Math.abs(cardDiffNum - diffNum) <= threshold;
    });
  }

  // 최대 카드 수 제한
  const limit = maxCards || 20;
  const selectedCards = allCards.slice(0, limit);

  return {
    id: `deliberate-practice-${Date.now()}`,
    name: `의도적 연습 덱 (${focusAreas?.join(', ') || '전체'})`,
    description: `${difficultyLevel || '전체'} 난이도 / ${selectedCards.length}장`,
    cards: selectedCards,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    category: 'deliberate-practice',
  };
}

// ──────────────────────────────────────────────────────────────
// 교차 학습(Interleaving) 덱 생성
// ──────────────────────────────────────────────────────────────

/**
 * InterleavedConfig에 따라 여러 덱의 카드를 혼합 배열한다.
 */
export function createInterleavedDeck(
  allDecks: FlashcardDeck[],
  config: InterleavedConfig
): FlashcardDeck {
  const { deckIds, cardsPerDeck, shuffleMode } = config;

  // 지정된 덱만 선택
  const targetDecks = deckIds && deckIds.length > 0
    ? allDecks.filter((d) => deckIds.includes(d.id))
    : allDecks;

  // 각 덱에서 카드 추출
  const cardGroups: Flashcard[][] = targetDecks.map((deck) => {
    const cards = deck.cards || [];
    return (cardsPerDeck ? cards.slice(0, cardsPerDeck) : cards) as Flashcard[];
  });

  let interleavedCards: Flashcard[] = [];

  if (shuffleMode === 'round-robin') {
    // Round-robin: 각 덱에서 1장씩 교대로 배치
    const maxLen = Math.max(...cardGroups.map((g) => g.length), 0);
    for (let i = 0; i < maxLen; i++) {
      cardGroups.forEach((group) => {
        if (i < group.length) {
          interleavedCards.push(group[i]);
        }
      });
    }
  } else {
    // random (기본): 전체를 수집 후 랜덤 셔플
    cardGroups.forEach((group) => {
      interleavedCards.push(...group);
    });
    // Fisher-Yates 셔플
    for (let i = interleavedCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [interleavedCards[i], interleavedCards[j]] = [interleavedCards[j], interleavedCards[i]];
    }
  }

  return {
    id: `interleaved-${Date.now()}`,
    name: '교차 학습 덱',
    description: `${targetDecks.length}개 덱 혼합 / ${interleavedCards.length}장`,
    cards: interleavedCards,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    category: 'interleaved',
  };
}

/**
 * 교차 학습 덱의 과목별 분포를 분석한다.
 * @param deck 교차 학습 덱
 * @param allDecks 원본 덱 배열 (카드 → 덱 매핑용)
 */
export function analyzeInterleavedDistribution(
  deck: FlashcardDeck,
  allDecks: FlashcardDeck[]
): Record<string, number> {
  const distribution: Record<string, number> = {};
  const cardToDeck: Record<string, string> = {};

  // 카드 ID → 덱 이름 매핑
  allDecks.forEach((d) => {
    (d.cards || []).forEach((c: Flashcard) => {
      cardToDeck[c.id] = d.title;
    });
  });

  (deck.cards || []).forEach((card: Flashcard) => {
    const deckName = cardToDeck[card.id] || '기타';
    distribution[deckName] = (distribution[deckName] || 0) + 1;
  });

  return distribution;
}

// ──────────────────────────────────────────────────────────────
// 적응적 피드백
// ──────────────────────────────────────────────────────────────

/**
 * 카드 복습 결과에 따라 적응적 피드백을 생성한다.
 * @param card 복습된 카드
 * @param isCorrect 정답 여부
 * @param responseTimeMs 응답 시간 (밀리초)
 * @param streak 연속 정답 횟수
 */
export function getAdaptiveFeedback(
  card: Flashcard,
  isCorrect: boolean,
  responseTimeMs: number = 10000,
  streak: number = 0
): AdaptiveFeedback {
  const fastThreshold = 8000;

  if (isCorrect && responseTimeMs < fastThreshold && streak >= 2) {
    return {
      level: 'excellent',
      message: '탁월합니다! 빠르고 정확하게 답변했습니다.',
      suggestedAction: '이 카드의 복습 간격을 늘려도 됩니다.',
      adjustedDifficulty: 'easy',
    };
  } else if (isCorrect && responseTimeMs < fastThreshold) {
    return {
      level: 'good',
      message: '잘 했습니다! 정확한 답변입니다.',
      suggestedAction: '현재 복습 간격을 유지하세요.',
      adjustedDifficulty: 'easy',
    };
  } else if (isCorrect) {
    return {
      level: 'good',
      message: '정답입니다. 조금 더 빠르게 떠올릴 수 있도록 복습해보세요.',
      suggestedAction: '복습 간격을 약간 줄여서 빠른 회상을 연습하세요.',
      adjustedDifficulty: 'medium',
    };
  } else if (streak === 0) {
    return {
      level: 'struggling',
      message: '이 개념은 아직 어려운 부분인 것 같습니다.',
      suggestedAction: '정답을 확인한 후, 내일 다시 복습해보세요.',
      adjustedDifficulty: 'hard',
    };
  } else {
    return {
      level: 'needs_review',
      message: '틀렸지만, 이전에 잘 했던 내용입니다. 다시 복습하세요.',
      suggestedAction: '카드를 다시 보고 24시간 후에 재복습하세요.',
      adjustedDifficulty: 'medium',
    };
  }
}

// ──────────────────────────────────────────────────────────────
// 이중 부호화 (Dual Coding)
// ──────────────────────────────────────────────────────────────

/**
 * 기존 카드를 이중 부호화 형식으로 변환한다.
 */
export function formatDualCodingCard(card: Flashcard, config?: DualCodingConfig): DualCodingCard {
  const cfg: DualCodingConfig = config || { enableVisual: true, enableVerbal: true };
  const front = card.front || '';
  const back = card.back || '';

  // 시각적 표현 제안 생성
  let visualDescription = '';
  if (cfg.enableVisual) {
    if (cfg.visualPrompt) {
      visualDescription = cfg.visualPrompt;
    } else if (front.includes('공식') || front.includes('formula') || back.match(/[=+\-×÷]/)) {
      visualDescription = `공식 다이어그램으로 표현: "${back}"의 각 변수를 시각적으로 배치하세요.`;
    } else if (front.includes('과정') || front.includes('단계')) {
      visualDescription = `단계별 순서도(flowchart)로 표현하여 과정을 시각화하세요.`;
    } else {
      visualDescription = `"${front.substring(0, 30)}..."의 핵심 개념을 간단한 그림이나 다이어그램으로 표현하세요.`;
    }
  }

  // 언어적 요약 생성
  let verbalSummary = '';
  if (cfg.enableVerbal) {
    if (cfg.verbalPrompt) {
      verbalSummary = cfg.verbalPrompt;
    } else {
      // 답변을 핵심 키워드로 요약
      const words = back.split(/[\s,.;:]+/).filter((w) => w.length > 2);
      const keywords = words.slice(0, 5).join(', ');
      verbalSummary = `핵심 키워드: ${keywords}. 이 키워드들을 이용하여 개념을 한 문장으로 설명해보세요.`;
    }
  }

  // 기억술 제안
  const firstLetter = front.charAt(0);
  const mnemonic = `"${front.substring(0, 15)}..."의 첫 글자 '${firstLetter}'를 기억하고, 답변의 핵심 단어와 연관하여 기억하세요.`;

  return {
    id: card.id,
    front,
    back,
    visualDescription,
    verbalSummary,
    mnemonic,
    config: cfg,
  };
}

// ──────────────────────────────────────────────────────────────
// 메타인지 체크리스트
// ──────────────────────────────────────────────────────────────

/**
 * 학습 전 메타인지 체크리스트를 생성한다.
 * 반환값은 MetacognitionChecklist이며, .preStudy.questions 형태로 접근한다.
 */
export function createPreStudyMetacognition(topic?: string): MetacognitionChecklist {
  const questions: MetacognitionQuestion[] = [
    {
      id: 'pre-1',
      text: '오늘 학습할 주제에 대해 얼마나 알고 있다고 생각하세요?',
      type: 'rating',
      scale: 5,
    },
    {
      id: 'pre-2',
      text: '오늘의 학습 목표를 떠올릴 수 있나요?',
      type: 'yesno',
    },
    {
      id: 'pre-3',
      text: '지금 집중 상태는 어떤가요?',
      type: 'selection',
      options: ['완전히 집중됨', '어느 정도 집중됨', '집중이 어려운 상태'],
    },
    {
      id: 'pre-4',
      text: '오늘 학습에서 특히 어려운 부분이 있다면 적어보세요.',
      type: 'text',
    },
  ];

  return {
    phase: 'pre',
    questions,
    preStudy: { questions },
    metadata: {
      generatedAt: new Date().toISOString(),
      context: topic,
    },
  };
}

/**
 * 학습 중간 메타인지 체크를 생성한다.
 * 반환값은 .questions로 직접 접근한다 (mid 단계).
 */
export function createMidStudyCheck(): MetacognitionChecklist {
  const questions: MetacognitionQuestion[] = [
    {
      id: 'mid-1',
      text: '지금까지의 학습 내용을 얼마나 이해했다고 생각하세요?',
      type: 'rating',
      scale: 5,
    },
    {
      id: 'mid-2',
      text: '집중력이 유지되고 있나요?',
      type: 'yesno',
    },
    {
      id: 'mid-3',
      text: '가장 어려운 개념이 무엇인지 떠올릴 수 있나요?',
      type: 'selection',
      options: ['명확하게 떠올릴 수 있음', '대략적으로 떠올릴 수 있음', '떠올릴 수 없음'],
    },
  ];

  return {
    phase: 'mid',
    questions,
    metadata: {
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * 학습 후 메타인지 평가를 생성한다.
 * 반환값은 .postStudy.questions 형태로 접근한다.
 * @param cardsStudied 학습한 카드 수
 * @param correctRate 정답율 (0~1)
 */
export function createPostStudyMetacognition(cardsStudied: number, correctRate: number): MetacognitionChecklist {
  const questions: MetacognitionQuestion[] = [
    {
      id: 'post-1',
      text: `오늘 학습한 ${cardsStudied}장의 카드 중 얼마나 잘 기억된다고 생각하세요?`,
      type: 'rating',
      scale: 5,
    },
    {
      id: 'post-2',
      text: '오늘의 학습 목표를 달성했다고 느끼나요?',
      type: 'yesno',
    },
    {
      id: 'post-3',
      text: `정답율이 ${(correctRate * 100).toFixed(0)}%였습니다. 이 결과에 만족하나요?`,
      type: 'selection',
      options: ['매우 만족', '보통', '만족하지 못함'],
    },
    {
      id: 'post-4',
      text: '다음 학습에서 개선할 점이 있다면 적어보세요.',
      type: 'text',
    },
  ];

  return {
    phase: 'post',
    questions,
    postStudy: { questions },
    metadata: {
      generatedAt: new Date().toISOString(),
      context: `카드 ${cardsStudied}장 학습, 정답율 ${(correctRate * 100).toFixed(0)}%`,
    },
  };
}

/**
 * 메타인지 체크리스트의 답변을 점수로 변환한다.
 * rating: 점수 그대로, yesno: true=1/false=0, selection: index 기반, text: 답변 있으면 1
 * @param answers { questionId: answer } 형태의 답변 객체
 * @param questions 질문 배열
 * @returns 0~100 사이의 점수
 */
export function calculateMetacognitionScore(
  answers: Record<string, number | string | boolean>,
  questions: MetacognitionQuestion[]
): number {
  if (questions.length === 0) return 0;

  let totalScore = 0;
  let maxScore = 0;

  questions.forEach((q) => {
    const answer = answers[q.id];
    if (answer === undefined || answer === '') return;

    switch (q.type) {
      case 'rating': {
        const scale = q.scale || 5;
        maxScore += scale;
        totalScore += typeof answer === 'number' ? answer : 0;
        break;
      }
      case 'yesno': {
        maxScore += 1;
        totalScore += answer === true ? 1 : 0;
        break;
      }
      case 'selection': {
        const options = q.options || [];
        maxScore += options.length;
        // 첫 번째 옵션이 가장 좋은 답변으로 간주
        const idx = options.indexOf(answer as string);
        totalScore += idx >= 0 ? options.length - idx : 0;
        break;
      }
      case 'text': {
        maxScore += 1;
        totalScore += (answer as string).length > 0 ? 1 : 0;
        break;
      }
    }
  });

  return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
}
