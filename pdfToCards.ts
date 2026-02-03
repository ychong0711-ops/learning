// ============================================================
// lib/pdfToCards.ts
// PDF → 플래시카드 변환 모듈
// exports:
//   generateCardsFromPDF, extractTextFromPDF, processLargePDF
//   CardGenerationProgress, PDFCardGenerationResult, PDFAnalysisResult
//   analyzePdfStructure
// ============================================================

import { Flashcard, FlashcardDeck } from './flashcard-types';
import { fetchAIResponse } from './ai';
import { saveDecksToStorage, loadDecksFromStorage } from './flashcard';

// ─── 타입 정의 ──────────────────────────────────────────────

export interface CardGenerationProgress {
  stage: 'extracting' | 'analyzing' | 'generating' | 'saving' | 'complete' | 'error';
  progress: number;               // 0~100
  message: string;
  currentPage?: number;
  totalPages?: number;
  cardsGenerated?: number;
}

export interface PDFCardGenerationResult {
  deckId: string;
  deckTitle: string;
  cards: Flashcard[];
  totalPages: number;
  extractedTextLength: number;
  generatedAt: string;
  metadata?: {
    difficulty: string;
    includeFormulas: boolean;
  };
}

export interface PDFAnalysisResult {
  totalPages: number;
  estimatedWordCount: number;
  detectedTopics: string[];
  recommendedCardCount: number;
  hasFormulas: boolean;
  hasTables: boolean;
  chapters: string[];
  complexity: 'simple' | 'moderate' | 'complex';
}

interface UploadOptions {
  cardCount: number;
  difficulty: '쉬움' | '중간' | '어려움';
  includeFormulas: boolean;
}

// ─── PDF.js 글로벌 타입 ─────────────────────────────────────
// window.pdfjsLib 타입은 next-env.d.ts 또는 컴포넌트 단에서 동적 로드 후 사용

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

// ─── PDF.js 동적 로드 ───────────────────────────────────────

async function ensurePdfJs(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.pdfjsLib) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ─── 텍스트 추출 ────────────────────────────────────────────

/**
 * PDF 파일에서 텍스트를 추출한다.
 * @param file PDF File 객체
 * @param maxPages 최대 페이지 수 (기본 50)
 * @param onProgress 진행 콜백
 */
export async function extractTextFromPDF(
  file: File,
  maxPages: number = 50,
  onProgress?: (progress: CardGenerationProgress) => void
): Promise<{ text: string; totalPages: number }> {
  await ensurePdfJs();

  if (!window.pdfjsLib) {
    throw new Error('PDF.js를 로드할 수 없습니다.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages: number = pdf.numPages;
  let fullText = '';

  const pagesToProcess = Math.min(totalPages, maxPages);

  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n\n';

    if (onProgress) {
      onProgress({
        stage: 'extracting',
        progress: Math.round((i / pagesToProcess) * 40), // 0~40%
        message: `텍스트 추출 중... (${i}/${pagesToProcess}페이지)`,
        currentPage: i,
        totalPages,
      });
    }
  }

  return { text: fullText, totalPages };
}

// ─── PDF 구조 분석 ──────────────────────────────────────────

/**
 * 추출된 텍스트를 분석하여 PDF의 구조와 특성을 파악한다.
 * @param text 추출된 텍스트
 */
export function analyzePdfStructure(text: string): PDFAnalysisResult {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const estimatedWordCount = words.length;

  // 챕터/섹션 감지 (숫자로 시작하는 제목 패턴)
  const chapterPattern = /(?:^|\n)\s*(?:Chapter|챕터|Ch\.|[\d]+[\.\-])\s*(.{3,50})/gi;
  const chapters: string[] = [];
  let match;
  while ((match = chapterPattern.exec(text)) !== null) {
    if (chapters.length < 20) {
      chapters.push(match[1].trim());
    }
  }

  // 수식 감지: LaTeX 패턴, 수학 기호
  const formulaPatterns = /[=+\-×÷∑∫∂√π∞≤≥≠α-ωΑ-Ω]|\\[a-z]+\{/g;
  const formulaMatches = text.match(formulaPatterns);
  const hasFormulas = (formulaMatches?.length || 0) > 10;

  // 테이블 감지: 파이프 구분자, 규칙적 숫자 배치
  const tablePattern = /\|[^|]+\|[^|]+\|/g;
  const tableMatches = text.match(tablePattern);
  const hasTables = (tableMatches?.length || 0) > 2;

  // 주제 감지 (빈도 높은 키워드 기반)
  const stopWords = new Set(['의', '은', '는', '이', '가', '를', '에', '서', '로', '와', '한', '또', '및',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or']);
  const wordFreq: Record<string, number> = {};
  words.forEach((w) => {
    const lower = w.toLowerCase().replace(/[^a-z가-힣0-9]/g, '');
    if (lower.length >= 3 && !stopWords.has(lower)) {
      wordFreq[lower] = (wordFreq[lower] || 0) + 1;
    }
  });

  const detectedTopics = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);

  // 복잡도 평가
  const avgWordLength = words.length > 0
    ? words.reduce((sum, w) => sum + w.length, 0) / words.length
    : 0;
  const complexity: 'simple' | 'moderate' | 'complex' =
    avgWordLength > 6 || hasFormulas ? 'complex' : avgWordLength > 4 ? 'moderate' : 'simple';

  // 권장 카드 수: 단어 수에 비례, 최소 10, 최대 50
  const recommendedCardCount = Math.min(50, Math.max(10, Math.round(estimatedWordCount / 150)));

  // 페이지 수 추정 (텍스트 양으로 역산, 페이지당 약 400단어)
  const estimatedPages = Math.max(1, Math.round(estimatedWordCount / 400));

  return {
    totalPages: estimatedPages,
    estimatedWordCount,
    detectedTopics,
    recommendedCardCount,
    hasFormulas,
    hasTables,
    chapters,
    complexity,
  };
}

// ─── 카드 생성 ───────────────────────────────────────────────

/**
 * AI를 사용하여 텍스트에서 플래시카드를 생성한다.
 * @param text 소스 텍스트
 * @param options 카드 생성 옵션
 * @param onProgress 진행 콜백
 */
async function generateCardsFromText(
  text: string,
  options: UploadOptions,
  onProgress?: (progress: CardGenerationProgress) => void
): Promise<Flashcard[]> {
  const { cardCount, difficulty, includeFormulas } = options;

  // 텍스트를 청크로 분할 (2000자씩)
  const chunkSize = 2000;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  const cardsPerChunk = Math.max(1, Math.ceil(cardCount / chunks.length));
  const allCards: Flashcard[] = [];

  const promptBase = `다음 텍스트에서 학습용 플래시카드 ${cardsPerChunk}장을 생성하세요.
각 카드는 다음 JSON 배열 형식으로 반환하세요:
[
  {
    "front": "질문 또는 개념 (짧은 형태)",
    "back": "답변 또는 설명 (간결하게)",
    "tags": ["관련키워드1", "관련키워드2"]
  }
]

규칙:
- front는 최대 100자 이내
- back는 최대 200자 이내
- 난이도: ${difficulty}
${includeFormulas ? '- 수식이 있으면 LaTeX 형태로 포함 (예: $E=mc^2$)' : '- 수식은 제외'}
- JSON만 반환하세요. 다른 텍스트 불필요.

텍스트:`;

  for (let i = 0; i < chunks.length && allCards.length < cardCount; i++) {
    if (onProgress) {
      onProgress({
        stage: 'generating',
        progress: 40 + Math.round((i / chunks.length) * 50), // 40~90%
        message: `카드 생성 중... (${allCards.length}/${cardCount}장)`,
        cardsGenerated: allCards.length,
      });
    }

    try {
      const response = await fetchAIResponse(
        [{ role: 'user', content: promptBase + '\n' + chunks[i] }],
      );

      // JSON 파싱
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            if (allCards.length >= cardCount) return;
            if (item.front && item.back) {
              allCards.push({
                id: `pdf-card-${Date.now()}-${allCards.length}`,
                front: item.front,
                back: item.back,
                difficulty: difficulty === '쉬움' ? 'easy' as const : difficulty === '어려움' ? 'hard' as const : 'medium' as const,
                tags: item.tags || [],
                easeFactor: 2.5,
                repetitions: 0,
                interval: 1,
                nextReviewDate: new Date().toISOString(),
                lastReviewDate: undefined,
              });
            }
          });
        }
      }
    } catch (e) {
      console.error(`청크 ${i + 1} 카드 생성 실패:`, e);
      // 한 청크 실패해도 다음 청크 계속 진행
      continue;
    }
  }

  return allCards;
}

// ─── 메인 함수: generateCardsFromPDF ─────────────────────────

/**
 * PDF 파일에서 텍스트를 추출하고 AI를 활용하여 플래시카드를 생성한다.
 * @param file PDF File 객체
 * @param options 카드 생성 옵션
 * @param onProgress 진행 콜백
 */
export async function generateCardsFromPDF(
  file: File,
  options: UploadOptions,
  onProgress?: (progress: CardGenerationProgress) => void
): Promise<PDFCardGenerationResult> {
  // 1단계: 텍스트 추출
  const { text, totalPages } = await extractTextFromPDF(file, 50, onProgress);

  if (onProgress) {
    onProgress({
      stage: 'analyzing',
      progress: 42,
      message: 'PDF 구조 분석 중...',
    });
  }

  // 2단계: 구조 분석 (진행 표시용)
  analyzePdfStructure(text);

  if (onProgress) {
    onProgress({
      stage: 'generating',
      progress: 45,
      message: 'AI를 사용하여 카드 생성 중...',
    });
  }

  // 3단계: AI 카드 생성
  const cards = await generateCardsFromText(text, options, onProgress);

  // 4단계: 덱 생성 및 저장
  if (onProgress) {
    onProgress({
      stage: 'saving',
      progress: 92,
      message: '카드를 저장 중...',
    });
  }

  const deckId = `pdf-deck-${Date.now()}`;
  const deck: FlashcardDeck = {
    id: deckId,
    name: `PDF: ${file.name.replace('.pdf', '')}`,
    description: `PDF에서 생성된 ${cards.length}장의 플래시카드`,
    cards,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    category: 'pdf-generated',
  };

  // localStorage에 저장
  try {
    const existingDecks = loadDecksFromStorage();
    existingDecks.push(deck);
    saveDecksToStorage(existingDecks);
  } catch (e) {
    console.error('덱 저장 실패:', e);
  }

  if (onProgress) {
    onProgress({
      stage: 'complete',
      progress: 100,
      message: `완료! ${cards.length}장의 카드가 생성되었습니다.`,
      cardsGenerated: cards.length,
    });
  }

  return {
    deckId,
    deckTitle: deck.name,
    cards,
    totalPages,
    extractedTextLength: text.length,
    generatedAt: new Date().toISOString(),
    metadata: {
      difficulty: options.difficulty,
      includeFormulas: options.includeFormulas,
    },
  };
}

// ─── 대용량 PDF 처리 ─────────────────────────────────────────

/**
 * 대용량 PDF를 페이지별로 분할하여 처리한다.
 * @param file PDF File 객체
 * @param options 카드 생성 옵션
 * @param onProgress 진행 콜백
 * @param pageChunkSize 한 번에 처리할 페이지 수 (기본 10)
 */
export async function processLargePDF(
  file: File,
  options: UploadOptions,
  onProgress?: (progress: CardGenerationProgress) => void,
  pageChunkSize: number = 10
): Promise<PDFCardGenerationResult> {
  await ensurePdfJs();

  if (!window.pdfjsLib) {
    throw new Error('PDF.js를 로드할 수 없습니다.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages: number = pdf.numPages;
  let fullText = '';
  let processedPages = 0;

  // 페이지를 청크별로 처리
  for (let startPage = 1; startPage <= totalPages; startPage += pageChunkSize) {
    const endPage = Math.min(startPage + pageChunkSize - 1, totalPages);

    for (let i = startPage; i <= endPage; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
      processedPages++;
    }

    if (onProgress) {
      onProgress({
        stage: 'extracting',
        progress: Math.round((processedPages / totalPages) * 35),
        message: `페이지 추출 중... (${processedPages}/${totalPages})`,
        currentPage: processedPages,
        totalPages,
      });
    }
  }

  // 구조 분석
  if (onProgress) {
    onProgress({ stage: 'analyzing', progress: 38, message: 'PDF 구조 분석 중...' });
  }
  analyzePdfStructure(fullText);

  // AI 카드 생성
  if (onProgress) {
    onProgress({ stage: 'generating', progress: 42, message: 'AI로 카드 생성 중...' });
  }
  const cards = await generateCardsFromText(fullText, options, onProgress);

  // 저장
  const deckId = `pdf-large-deck-${Date.now()}`;
  const deck: FlashcardDeck = {
    id: deckId,
    name: `PDF(대용량): ${file.name.replace('.pdf', '')}`,
    description: `대용량 PDF에서 생성된 ${cards.length}장의 플래시카드 (${totalPages}페이지)`,
    cards,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    category: 'pdf-generated',
  };

  try {
    const existingDecks = loadDecksFromStorage();
    existingDecks.push(deck);
    saveDecksToStorage(existingDecks);
  } catch (e) {
    console.error('덱 저장 실패:', e);
  }

  if (onProgress) {
    onProgress({
      stage: 'complete',
      progress: 100,
      message: `완료! ${cards.length}장의 카드가 생성되었습니다.`,
      cardsGenerated: cards.length,
    });
  }

  return {
    deckId,
    deckTitle: deck.name,
    cards,
    totalPages,
    extractedTextLength: fullText.length,
    generatedAt: new Date().toISOString(),
    metadata: {
      difficulty: options.difficulty,
      includeFormulas: options.includeFormulas,
    },
  };
}
