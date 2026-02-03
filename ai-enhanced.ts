// ============================================================
// lib/ai-enhanced.ts
// AI 기반 학습 분석 및 최적화 모듈
// exports: analyzeWeaknessPatterns, generateExamReviewPlan,
//          generateSimilarProblems, diagnoseUnderstanding,
//          optimizeLearningSchedule
// ============================================================

import { FlashcardDeck, Flashcard } from './flashcard-types';

// ─── 약점 패턴 분석 결과 ─────────────────────────────────────

interface WeakArea {
  chapter: string;
  errorRate: number;
  priority: 'high' | 'medium' | 'low';
  recommendedActions: string[];
}

interface WeaknessAnalysisResult {
  averageAccuracy: number;
  strongAreas: string[];
  overallWeakAreas: WeakArea[];
  improvementTrend: 'improving' | 'stable' | 'declining';
  recommendations: string[];
}

// ─── 시험 복습 계획 결과 ────────────────────────────────────

interface ExamReviewPlan {
  examName: string;
  examDate: string;
  daysUntil: number;
  confidence: number;               // 0~100
  totalStudyHours: number;
  dailyPlan: DailyStudyPlan[];
  tips: string[];
}

interface DailyStudyPlan {
  day: number;
  date: string;
  topics: string[];
  duration: number;                 // 분
  priority: 'high' | 'medium' | 'low';
}

// ─── 유사 문제 생성 결과 ────────────────────────────────────

interface SimilarProblem {
  question: string;
  answer: string;
  variationType: string;            // 변형 유형 라벨
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ─── 이해도 진단 결과 ───────────────────────────────────────

interface DiagnosisResult {
  understandingLevel: 'excellent' | 'good' | 'fair' | 'poor';
  confidenceScore: number;          // 0~1
  recommendations: string[];
  detailedAnalysis: string;
}

// ─── 학습 최적화 결과 ───────────────────────────────────────

interface LearningOptimization {
  recommendedSessionLength: number; // 분
  bestStudyTimes: string[];
  predictedGPA: number;
  recommendations: string[];
  weeklyPlan: WeeklyOptimizedPlan[];
}

interface WeeklyOptimizedPlan {
  week: number;
  focusSubjects: string[];
  totalHours: number;
  strategies: string[];
}

// ─── 함수 구현 ──────────────────────────────────────────────

/**
 * 플래시카드 덱들의 복습 기록을 분석하여 약점 패턴을 도출한다.
 * @param decks 학습 중인 플래시카드 덱 배열
 */
export function analyzeWeaknessPatterns(decks: FlashcardDeck[]): WeaknessAnalysisResult {
  const chapterStats: Record<string, { total: number; correct: number; cards: string[] }> = {};

  decks.forEach((deck) => {
    const chapterLabel = deck.category || deck.title;
    if (!chapterStats[chapterLabel]) {
      chapterStats[chapterLabel] = { total: 0, correct: 0, cards: [] };
    }
    (deck.cards || []).forEach((card: Flashcard) => {
      chapterStats[chapterLabel].total += card.repetitions || 0;
      // easeFactor 기준: 기본값 2.5 기준으로 낮은 값이면 어려운 카드
      const ef = card.easeFactor ?? 2.5;
      const successRate = ef >= 2.5 ? 0.8 : ef >= 2.0 ? 0.5 : 0.2;
      chapterStats[chapterLabel].correct += Math.round((card.repetitions || 0) * successRate);
      chapterStats[chapterLabel].cards.push(card.id);
    });
  });

  const strongAreas: string[] = [];
  const overallWeakAreas: WeakArea[] = [];
  let totalCards = 0;
  let totalCorrectCards = 0;

  Object.entries(chapterStats).forEach(([chapter, stats]) => {
    if (stats.total === 0) return;
    const accuracy = stats.correct / stats.total;
    totalCards += stats.total;
    totalCorrectCards += stats.correct;

    if (accuracy >= 0.8) {
      strongAreas.push(chapter);
    } else {
      const errorRate = 1 - accuracy;
      const priority: 'high' | 'medium' | 'low' =
        errorRate >= 0.6 ? 'high' : errorRate >= 0.4 ? 'medium' : 'low';

      const actions: string[] = [];
      if (priority === 'high') {
        actions.push('기본 개념 재학습 권장');
        actions.push('관련 카드 집중 복습');
        actions.push('단순 암기 → 이해 중심으로 전환');
      } else if (priority === 'medium') {
        actions.push('복습 간격 줄이기');
        actions.push('유사 문제 연습');
      } else {
        actions.push('정기 복습 유지');
      }

      overallWeakAreas.push({
        chapter,
        errorRate,
        priority,
        recommendedActions: actions,
      });
    }
  });

  // 우선순위별 정렬: high → medium → low
  overallWeakAreas.sort((a, b) => {
    const pOrder = { high: 0, medium: 1, low: 2 };
    return pOrder[a.priority] - pOrder[b.priority];
  });

  const averageAccuracy = totalCards > 0 ? totalCorrectCards / totalCards : 0;

  // 개선 추세 평가 (간단히 약점 비율로 판단)
  const weakRatio = overallWeakAreas.length / (Object.keys(chapterStats).length || 1);
  const improvementTrend: 'improving' | 'stable' | 'declining' =
    weakRatio < 0.3 ? 'improving' : weakRatio < 0.6 ? 'stable' : 'declining';

  const recommendations: string[] = [];
  if (overallWeakAreas.length > 0) {
    recommendations.push(`약점 과목 "${overallWeakAreas[0].chapter}"에 학습 시간 집중 필요`);
  }
  if (strongAreas.length > 0) {
    recommendations.push(`강점 과목 "${strongAreas[0]}"의 복습 간격을 늘려 효율 향상`);
  }
  if (averageAccuracy < 0.6) {
    recommendations.push('전체 정확도가 낮으므로 기본 개념 강화 권장');
  }
  recommendations.push('매일 약 30분씩 약점 카드를 우선 복습하세요');
  recommendations.push('강점 과목과 약점 과목을 교대로 학습하여 효과 극대화');

  return {
    averageAccuracy,
    strongAreas,
    overallWeakAreas,
    improvementTrend,
    recommendations,
  };
}

/**
 * GPA 데이터와 시험 정보를 기반으로 시험 복습 계획을 생성한다.
 * @param gpaData GPATrackingData 객체
 * @param examDateStr 시험 날짜 (YYYY-MM-DD)
 * @param examName 시험 이름
 */
export function generateExamReviewPlan(gpaData: any, examDateStr: string, examName: string): ExamReviewPlan {
  const today = new Date();
  const examDate = new Date(examDateStr);
  const daysUntil = Math.max(1, Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  const subjects = gpaData?.subjects || [];
  const subjectNames = subjects.map((s: any) => s.name);

  // 학습 시간 계산: 과목당 하루 45분 기준, 일정 조정
  const hoursPerDay = Math.min(4, subjects.length * 0.75);
  const totalStudyHours = parseFloat((hoursPerDay * daysUntil).toFixed(1));

  // 신뢰도 계산: 남은 일수가 많을수록 높음
  const confidence = Math.min(95, Math.max(30, Math.round(40 + (daysUntil / 14) * 55)));

  // 일별 학습 계획 생성
  const dailyPlan: DailyStudyPlan[] = [];
  for (let d = 0; d < daysUntil; d++) {
    const planDate = new Date(today);
    planDate.setDate(today.getDate() + d);

    // 단계별 우선순위: 처음은 개념 정리, 중간은 문제 연습, 마지막 2일은 총정리
    let priority: 'high' | 'medium' | 'low';
    let topics: string[];

    if (d < daysUntil * 0.3) {
      // 초반: 기본 개념 강화
      priority = 'medium';
      topics = subjectNames.slice(0, Math.ceil(subjectNames.length * 0.5)).map((n: string) => `${n} - 개념 정리`);
    } else if (d < daysUntil * 0.7) {
      // 중반: 문제 풀이 연습
      priority = 'high';
      topics = subjectNames.map((n: string) => `${n} - 문제 연습`);
    } else {
      // 종반: 총정리 및 약점 강화
      priority = 'high';
      topics = subjectNames.map((n: string) => `${n} - 약점 강화 및 총정리`);
    }

    dailyPlan.push({
      day: d + 1,
      date: planDate.toISOString().split('T')[0],
      topics,
      duration: Math.round(hoursPerDay * 60),
      priority,
    });
  }

  const tips: string[] = [
    '시험 전 날은 충분히 休息하고, 가벼운 복습만 진행하세요.',
    '약점 과목을 먼저 학습하고, 강점 과목으로 자신감을 회복하세요.',
    '포모도로 기법(25분 학습 + 5분 휴식)을 활용하여 집중력을 유지하세요.',
    '복습할 때 단순 암기보다는 개념을 이해하고 설명해보는 방법을 사용하세요.',
    '매일 복습 후 빠르게 간격 복습카드를 돌아보세요.',
  ];

  return {
    examName,
    examDate: examDateStr,
    daysUntil,
    confidence,
    totalStudyHours,
    dailyPlan,
    tips,
  };
}

/**
 * 주어진 플래시카드에 기반해 유사 문제를 생성한다.
 * @param card 기본 카드
 * @param count 생성할 문제 수
 */
export function generateSimilarProblems(card: any, count: number = 3): SimilarProblem[] {
  const front = card.front || '';
  const back = card.back || '';
  const problems: SimilarProblem[] = [];

  const variationTypes = [
    { type: '개념 재정의', template: (q: string) => `다음 개념을 자신의 말로 설명해보세요: ${q}` },
    { type: '역방향 질문', template: (q: string) => `"${back}"이 답일 때, 이에 맞는 질문을 세우세요. (원래: ${q})` },
    { type: '예시 적용', template: (q: string) => `${q}의 실제 예시 3가지를 들어보세요.` },
    { type: '비교 분석', template: (q: string) => `${q}와 관련된 유사한 개념과의 차이점을 설명하세요.` },
    { type: '원인-결과', template: (q: string) => `${q}가 발생하는 원인과 그 결과를 분석하세요.` },
    { type: '공식 변환', template: (q: string) => `${q}에 관련된 핵심 공식을 유도하고 변환하세요.` },
  ];

  const explanations = [
    '원래 질문의 개념을 자신의 표현으로 다시 정리하는 연습입니다.',
    '답에서 질문으로 역추적하면 이해도가 깊어집니다.',
    '실제 상황에 적용하면 이론의 활용성을 파악할 수 있습니다.',
    '유사한 개념과 비교하면 구별 능력이 높아집니다.',
    '원인과 결과를 연결하면 논리적 사고력이 강화됩니다.',
    '공식 유도와 변환은 깊은 이해의 증거입니다.',
  ];

  for (let i = 0; i < count && i < variationTypes.length; i++) {
    const idx = i % variationTypes.length;
    const diff: 'easy' | 'medium' | 'hard' = i === 0 ? 'easy' : i === 1 ? 'medium' : 'hard';
    problems.push({
      question: variationTypes[idx].template(front),
      answer: back,
      variationType: variationTypes[idx].type,
      explanation: explanations[idx],
      difficulty: diff,
    });
  }

  return problems;
}

/**
 * 단일 카드에 대한 이해도를 진단한다.
 * @param card 평가할 카드
 * @param responseTimeMs 응답 시간 (밀리초)
 * @param isCorrect 정답 여부
 */
export function diagnoseUnderstanding(card: any, responseTimeMs: number, isCorrect: boolean): DiagnosisResult {
  // 응답 시간 기준: 빠르고 정답 → excellent, 느리고 정답 → fair, 틀림 → poor
  const thresholdFast = 8000;   // 8초
  const thresholdMedium = 15000; // 15초

  let confidenceScore: number;
  let level: 'excellent' | 'good' | 'fair' | 'poor';

  if (isCorrect) {
    if (responseTimeMs < thresholdFast) {
      level = 'excellent';
      confidenceScore = 0.9 + (1 - responseTimeMs / thresholdFast) * 0.1;
    } else if (responseTimeMs < thresholdMedium) {
      level = 'good';
      confidenceScore = 0.7 + ((thresholdMedium - responseTimeMs) / (thresholdMedium - thresholdFast)) * 0.15;
    } else {
      level = 'fair';
      confidenceScore = 0.5 + (1 - Math.min(responseTimeMs / 30000, 1)) * 0.15;
    }
  } else {
    if (responseTimeMs < thresholdFast) {
      // 빠르게 틀림 → 충동적 답변
      level = 'poor';
      confidenceScore = 0.2;
    } else {
      // 고민했지만 틀림 → 개념 혼란
      level = 'poor';
      confidenceScore = 0.25;
    }
  }

  confidenceScore = Math.min(1, Math.max(0, parseFloat(confidenceScore.toFixed(3))));

  // 권장사항 생성
  const recommendations: string[] = [];
  const front = card?.front || '이 개념';

  switch (level) {
    case 'excellent':
      recommendations.push('이 개념은 잘 이해되고 있습니다. 복습 간격을 늘려도 됩니다.');
      recommendations.push('깊은 이해를 위해 관련 응용 문제를 도전해보세요.');
      break;
    case 'good':
      recommendations.push('기본 이해는 되었지만, 빠른 회상을 위한 반복 복습이 좋겠습니다.');
      recommendations.push('관련 개념과 연결하여 기억력을 강화하세요.');
      break;
    case 'fair':
      recommendations.push('정답은 맞았지만 시간이 많이 걸렸습니다. 복습 간격을 줄여야 합니다.');
      recommendations.push('이 개념의 핵심을 간결하게 정리하여 복습하세요.');
      break;
    case 'poor':
      recommendations.push('이 개념을 다시 학습해야 합니다.');
      recommendations.push('기본 정의와 공식부터 차근차근 복습하세요.');
      recommendations.push('관련 예제 문제를 풀어보여 이해도를 높여야 합니다.');
      break;
  }

  const detailedAnalysis = `카드 "${front.substring(0, 30)}..."에 대해 ${(responseTimeMs / 1000).toFixed(1)}초 내에 ${isCorrect ? '정답' : '오답'}을 제출했습니다. ` +
    `이해 수준: ${level.toUpperCase()}, 신뢰도: ${(confidenceScore * 100).toFixed(0)}%`;

  return {
    understandingLevel: level,
    confidenceScore,
    recommendations,
    detailedAnalysis,
  };
}

/**
 * 학습 기록과 GPA 데이터를 분석하여 최적화된 학습 스케줄을 제안한다.
 * @param studyRecords 학습 기록 배열 ({ date, duration, subject? })
 * @param gpaData GPATrackingData 객체
 */
export function optimizeLearningSchedule(studyRecords: any[], gpaData: any): LearningOptimization {
  const records = studyRecords || [];
  const subjects = gpaData?.subjects || [];

  // 학습 세션 길이 분석
  let totalDuration = 0;
  let sessionCount = 0;
  const hourCounts: Record<number, number> = {};

  records.forEach((r: any) => {
    if (r.duration) {
      totalDuration += r.duration;
      sessionCount++;
    }
    if (r.date) {
      const hour = new Date(r.date).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  });

  // 권장 세션 길이: 기본 45분, 기록이 있으면 평균 기준 조정
  const avgDuration = sessionCount > 0 ? totalDuration / sessionCount : 45;
  const recommendedSessionLength = Math.round(Math.min(60, Math.max(25, avgDuration)));

  // 최적 학습 시간 추출 (가장 많이 학습한 시간대 상위 3)
  const sortedHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => {
      const hour = parseInt(h);
      const ampm = hour >= 12 ? '오후' : '오전';
      const h12 = hour >= 13 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${ampm} ${h12}시`;
    });

  const bestStudyTimes = sortedHours.length > 0 ? sortedHours : ['오후 2시', '오후 7시', '오후 10시'];

  // GPA 예측: 현재 학습 패턴 기준 간단한 추정
  const currentAvgGPA = subjects.length > 0
    ? subjects.reduce((sum: number, s: any) => sum + (s.currentGrade || s.targetGPA || 3.0), 0) / subjects.length
    : 3.0;
  const predictedGPA = parseFloat(Math.min(4.5, currentAvgGPA + (sessionCount > 5 ? 0.15 : 0.05)).toFixed(2));

  // 주간 학습 계획
  const weeklyPlan: WeeklyOptimizedPlan[] = [];
  for (let w = 1; w <= 2; w++) {
    const focusSubjects = subjects
      .slice((w - 1) * 2, (w - 1) * 2 + 3)
      .map((s: any) => s.name);

    weeklyPlan.push({
      week: w,
      focusSubjects: focusSubjects.length > 0 ? focusSubjects : ['일반 복습'],
      totalHours: parseFloat((recommendedSessionLength * 5 / 60).toFixed(1)),
      strategies: w === 1
        ? ['간격 복습 카드 집중', '약점 과목 기본개념 강화']
        : ['문제 풀이 중심', '교차 학습(interleaving) 활용'],
    });
  }

  // 권장사항
  const recommendations: string[] = [
    `권장 학습 세션: ${recommendedSessionLength}분씩 하루 1~2회`,
    bestStudyTimes.length > 0 ? `최적 학습 시간대: ${bestStudyTimes.join(', ')}` : '규칙적인 학습 시간대를 설정하세요',
    subjects.length > 0 ? `주 초반에는 "${subjects[0]?.name}"을 우선 복습하세요` : '학습 과목을 먼저 설정하세요',
    '포모도로 기법과 활성 회상(active recall)을 함께 사용하세요',
    '주간 학습 목표를 세우고, 달성 여부를 주말에 확인하세요',
  ];

  return {
    recommendedSessionLength,
    bestStudyTimes,
    predictedGPA,
    recommendations,
    weeklyPlan,
  };
}
