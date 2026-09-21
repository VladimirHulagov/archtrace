/**
 * AI Analysis Module — архитектурная прожарка решений
 *
 * Анализирует ADR на:
 * - Покрытие требований родителя
 * - Архитектурные противоречия
 * - Пробелы в концепции
 *
 * НЕ занимается QA, тестированием, багами.
 */

import https from 'https';

const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
const MODEL = 'glm-5.2';

interface AnalysisContext {
  adrId: string;
  adrTitle: string;
  adrBody: string;
  phase: number;
  parentTitle?: string;
  parentBody?: string;
  childrenTitles: string[];
  options: { letter: string; title: string }[];
}

interface AnalysisResult {
  analysis: string;
  model: string;
  alternatives?: string[];
}

export async function runArchitecturalAnalysis(ctx: AnalysisContext): Promise<AnalysisResult> {
  const prompt = buildPhasePrompt(ctx);

  const requestBody = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: 'Ты — старший архитектор. Анализируешь архитектурные решения на концептуальном уровне. Отвечаешь ТОЛЬКО на русском языке. Не касаешься QA, тестирования или багов.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 8000,
  });

  const response = await callZai(requestBody);
  const alternatives = extractAlternatives(response);
  return { analysis: response, model: MODEL, alternatives };
}

/** Extract suggested alternatives from the AI response (lines starting with "Альтернатива:" or bullet items in Alternatives section) */
function extractAlternatives(text: string): string[] {
  const alts: string[] = [];
  // Match patterns like "- **Альтернатива:** ..." or "Альтернатива: ..." or lines in an "## Альтернативы" section
  const lines = text.split('\n');
  let inAltSection = false;
  let sawAltSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\s*(Альтернативы|Alternatives)/i.test(trimmed)) { inAltSection = true; sawAltSection = true; continue; }
    if (/^#{1,3}\s/.test(trimmed) && inAltSection) { inAltSection = false; }
    if (inAltSection && /^[-*—–]\s+/.test(trimmed)) {
      const clean = trimmed.replace(/^[-*—–]\s+/, '').replace(/\*\*/g, '').trim();
      if (clean.length > 5) alts.push(clean);
    }
    // Also match inline "Альтернатива:" prefix
    const altMatch = trimmed.match(/^(?:[-*]?\s*)?\*{0,2}Альтернатива[:\s]*\*{0,2}\s*(.+)/i);
    if (altMatch && altMatch[1].length > 5) {
      alts.push(altMatch[1].trim());
    }
  }
  // Suggest-options responses are usually a plain bullet list without an
  // "## Альтернативы" header — fall back to parsing top-level bullets.
  if (!sawAltSection && alts.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#{1,3}\s/.test(trimmed)) continue; // skip headings
      const m = trimmed.match(/^[-*—–]\s+(.{6,})$/);
      if (m) {
        const clean = m[1].replace(/\*\*/g, '').trim();
        if (clean.length > 5) alts.push(clean);
      }
    }
  }
  return [...new Set(alts)].slice(0, 5); // dedupe, max 5
}

function buildPhasePrompt(ctx: AnalysisContext): string {
  switch (ctx.phase) {
    case 1: return buildProblemPrompt(ctx);
    case 2: return buildRequirementPrompt(ctx);
    case 3: return buildParadigmPrompt(ctx);
    case 4: default: return buildAdrPrompt(ctx);
  }
}

function buildProblemPrompt(ctx: AnalysisContext): string {
  let p = `Проанализируй следующую постановку проблемы на концептуальном уровне.\n\n`;
  p += `## Проблема\n\n**${ctx.adrTitle}**\n\n${ctx.adrBody}\n\n`;
  p += `## Задача анализа\n\n`;
  p += `1. **Существует ли проблема реально?** — Оцени, является ли описанная проблема действительной. Возможно, это не проблема, а уже известное решение?\n`;
  p += `2. **Есть ли готовые решения?** — Укажи, существуют ли уже известные подходы или продукты, решающие эту проблему.\n`;
  p += `3. **Масштаб и значимость** — Насколько проблема критична? Что будет, если её не решать?\n`;
  p += `4. **Альтернативы** — Предложи 2-3 альтернативных формулировки проблемы или подхода к её решению.\n\n`;
  p += `В конце ответа добавь секцию "## Альтернативы" со списком предложенных вариантов (если есть).\n`;
  p += `Формат — краткий markdown. Максимум 300 слов.`;
  return p;
}

function buildRequirementPrompt(ctx: AnalysisContext): string {
  let p = `Проанализируй следующее требование на концептуальном уровне.\n\n`;
  p += `## Требование\n\n**${ctx.adrTitle}**\n\n${ctx.adrBody}\n\n`;
  if (ctx.parentTitle) p += `## Родительская проблема\n\n**${ctx.parentTitle}**\n\n${ctx.parentBody || '(нет тела)'}\n\n`;
  p += `## Задача анализа\n\n`;
  p += `1. **Полнота** — Все ли аспекты проблемы покрыты этим требованием?\n`;
  p += `2. **Однозначность** — Сформулировано ли требование чётко, без двусмысленности?\n`;
  p += `3. **Проверимость** — Можно ли проверить, что требование выполнено?\n`;
  p += `4. **Альтернативы** — Предложи 2-3 альтернативных требования или уточнения.\n\n`;
  p += `В конце ответа добавь секцию "## Альтернативы" со списком предложенных вариантов (если есть).\n`;
  p += `Формат — краткий markdown. Максимум 300 слов.`;
  return p;
}

function buildParadigmPrompt(ctx: AnalysisContext): string {
  let p = `Проанализируй следующую концепцию/парадигму решения на концептуальном уровне.\n\n`;
  p += `## Концепция\n\n**${ctx.adrTitle}**\n\n${ctx.adrBody}\n\n`;
  if (ctx.parentTitle) p += `## Родительское требование\n\n**${ctx.parentTitle}**\n\n${ctx.parentBody || '(нет тела)'}\n\n`;
  if (ctx.options.length > 0) {
    p += `## Варианты\n\n${ctx.options.map(o => `- Вариант ${o.letter}: ${o.title}`).join('\n')}\n\n`;
  }
  p += `## Задача анализа\n\n`;
  p += `1. **Осуществимость** — Реализуема ли предложенная концепция?\n`;
  p += `2. **Покрытие требований** — Какие требования адресует эта парадигма?\n`;
  p += `3. **Риски** — Какие архитектурные риски несёт этот подход?\n`;
  p += `4. **Альтернативы** — Предложи 2-3 альтернативные парадигмы/подходы.\n\n`;
  p += `В конце ответа добавь секцию "## Альтернативы" со списком предложенных вариантов (если есть).\n`;
  p += `Формат — краткий markdown. Максимум 300 слов.`;
  return p;
}

function buildAdrPrompt(ctx: AnalysisContext): string {
  let prompt = `Проанализируй следующее архитектурное решение (ADR) на концептуальном уровне.\n\n`;
  prompt += `## Текущее решение\n\n**ADR-${ctx.adrId}: ${ctx.adrTitle}**\n\n${ctx.adrBody}\n\n`;

  if (ctx.parentTitle) {
    prompt += `## Родительское требование\n\n**${ctx.parentTitle}**\n\n${ctx.parentBody || '(нет тела)'}\n\n`;
  }

  if (ctx.childrenTitles.length > 0) {
    prompt += `## Дочерние решения\n\n${ctx.childrenTitles.map(t => `- ${t}`).join('\n')}\n\n`;
  }

  if (ctx.options.length > 0) {
    prompt += `## Варианты\n\n${ctx.options.map(o => `- Вариант ${o.letter}: ${o.title}`).join('\n')}\n\n`;
  }

  prompt += `## Задача анализа\n\n`;
  prompt += `Оцени ТОЛЬКО архитектурные концептуальные моменты:\n\n`;
  prompt += `1. **Покрытие требований**: Насколько решение покрывает требования родителя? Все ли аспекты требования адресованы?\n`;
  prompt += `2. **Противоречия**: Есть ли концептуальные противоречия с родительским требованием или дочерними решениями?\n`;
  prompt += `3. **Пробелы**: Какие архитектурные аспекты упущены? Какие критические вопросы не рассмотрены?\n`;
  prompt += `4. **Альтернативы**: Есть ли очевидные архитектурные альтернативы, не упомянутые в вариантах?\n\n`;
  prompt += `НЕ касайся: тестирования, QA, багов, производительности кода, UI/UX.\n\n`;
  prompt += `Формат ответа — краткий markdown с заголовками и списками. Максимум 300 слов.`;

  return prompt;
}

export async function runSectionSuggestion(params: {
  section: 'context' | 'options' | 'consequences';
  title: string;
  currentContent: string;
  phase: number;
  context?: string;
  parentTitle?: string;
  parentBody?: string;
  nodeType?: string;
}): Promise<{ content: string; alternatives?: string[] }> {
  const { section, title, currentContent, phase } = params;

  const sectionLabels: Record<string, string> = {
    context: 'контекст',
    options: 'варианты решения',
    consequences: 'последствия',
  };

  let prompt = '';

  const nodeType = params.nodeType || 'decision';
  const ctxBlock = (limit = 1800): string => {
    let s = '';
    if (params.parentTitle) {
      s += `Родительская карточка: "${params.parentTitle}".\n`;
      if (params.parentBody?.trim()) s += `Контекст родителя:\n${params.parentBody.slice(0, limit)}\n\n`;
    }
    if (params.context?.trim()) s += `Контекст этой карточки:\n${params.context.slice(0, limit)}\n\n`;
    return s;
  };

  // ── PROBLEM: reflect on relevance, NOT options ──
  if (nodeType === 'problem') {
    prompt += `Проблема: "${title}".\n\n`;
    prompt += ctxBlock();
    if (currentContent?.trim()) {
      prompt += `Уже есть:\n${currentContent}\n\nНапиши ТОЛЬКО новые дополнения. Не повторяй написанное.\n\n`;
    }
    prompt += `Задача — помочь ОСОЗНАТЬ актуальность проблемы:\n`;
    prompt += `- Какие факты/симптомы подтверждают, что проблема реальна и сейчас болезненна?\n`;
    prompt += `- Что случится, если её НЕ решать (цена бездействия, сроки)?\n`;
    prompt += `- Какие критерии покажут, что проблема решена или перестала быть актуальной?\n`;
    prompt += `- Если данных не хватает — сформулируй, ЧТО нужно узнать (открытые вопросы).\n\n`;
    prompt += `НЕ предлагай решений и технологий. Только осознание проблемы.\n`;
    prompt += `Формат: структурированный markdown, кратко. Русский язык. Максимум 250 слов.`;
  }
  // ── REQUIREMENT: generate requirements BY ANALOGY (bullet list like options) ──
  else if (nodeType === 'requirement') {
    prompt += `Требование/набор требований: "${title}".\n\n`;
    prompt += ctxBlock();
    if (currentContent?.trim()) {
      prompt += `Уже сформулированные требования:\n${currentContent}\n\n`;
    }
    prompt += `Сформулируй 4-6 ДОПОЛНИТЕЛЬНЫХ проверяемых требований, вытекающих из проблемы и контекста.\n\n`;
    prompt += `ВАЖНО:\n`;
    prompt += `- Каждое требование — одна строка, начинается с глагола/долженствования («Обеспечивать…», «Выдерживать…»)\n`;
    prompt += `- Требование ПРОВЕРЯЕМО: по нему можно сказать «выполнено/не выполнено»\n`;
    prompt += `- АТОМАРНОСТЬ: одно требование = один проверяемый аспект. НЕ объединяй два независимых требования в одну строку — если формулировка содержит два разных критерия через «а», «а также», «и», «при этом» — раздели их на отдельные строки\n`;
    prompt += `- БЕЗ РЕШЕНИЙ: требование формулирует ЦЕЛЬ и проверяемый критерий, а НЕ способ её достижения. Если в формулировке назван конкретный способ/технологию/трассу («отводить в дренаж», «через колодец», «утеплённая горловина») — переформулируй как критерий результата («не менее чем двумя независимыми способами», «работоспособность при −30 °C»). Выбор способа — задача следующих этапов (концепция/решения)\n`;
    prompt += `- ЛАКОНИЧНОСТЬ: одна строка до ~200 символов, без воды и обоснований — только само требование и его проверяемый критерий\n`;
    prompt += `- Учитывай масштаб/бюджет/условия из контекста — требования реалистичны для описанной ситуации\n`;
    prompt += `- НЕ повторяй уже сформулированные\n`;
    prompt += `- НЕ предлагай конкретных продуктов/моделей — только требования\n\n`;
    prompt += `Формат: каждое требование с новой строки через тире. Русский язык.`;
  }
  // ── PARADIGM: derive approaches FROM requirements/constraints ──
  else if (nodeType === 'paradigm') {
    prompt += `Концептуальный вопрос: "${title}".\n\n`;
    prompt += ctxBlock();
    if (currentContent?.trim()) {
      prompt += `Уже рассмотренные подходы:\n${currentContent}\n\n`;
    }
    prompt += `Предложи 3-5 КОНЦЕПТУАЛЬНЫХ ПОДХОДОВ, каждый из которых удовлетворяет требованиям родителя с учётом ограничений.\n\n`;
    prompt += `ВАЖНО:\n`;
    prompt += `- Подход = принцип/класс решений («биологическая очистка», «энергонезависимость через гравитацию»), НЕ конкретный продукт\n`;
    prompt += `- Для каждого подхода одной строкой: за счёт какого принципа он закрывает ключевые требования\n`;
    prompt += `- Отметь, какое ОГРАНИЧЕНИЕ для каждого подхода самое жёсткое\n`;
    prompt += `- НЕ сравнивай конкретные модели/бренды — это задача следующего этапа (решения)\n`;
    prompt += `- НЕ повторяй уже рассмотренные\n\n`;
    prompt += `Формат: каждый подход с новой строки через тире: «Подход — принцип; жёсткое ограничение: …». Русский язык.`;
  }
  // ── DECISION/TASK: options & text sections (previous behaviour) ──
  else if (section === 'options') {
    // OPTIONS: conceptual approaches, not feature combinations
    prompt += `Архитектурное решение: "${title}".\n`;
    if (params.parentTitle) {
      prompt += `Родительское требование/задача: "${params.parentTitle}".\n`;
      if (params.parentBody?.trim()) {
        prompt += `Контекст требования:\n${params.parentBody.slice(0, 1500)}\n\n`;
      }
    }
    if (params.context?.trim()) {
      prompt += `Контекст этого решения:\n${params.context.slice(0, 2000)}\n\n`;
    }
    if (currentContent?.trim()) {
      prompt += `Существующие варианты:\n${currentContent}\n\n`;
    }
    prompt += `Предложи 4-6 КОНЦЕПТУАЛЬНО РАЗНЫХ подходов к решению. Каждый подход — это отдельный физический принцип или технология, а НЕ комбинация элементов.\n\n`;
    prompt += `ВАЖНО:\n`;
    prompt += `- Каждый вариант должен основываться на РАЗНОМ физическом принципе\n`;
    prompt += `- НЕ комбинируй подходы (например, "осмос с углем" — это комбинация)\n`;
    prompt += `- НЕ повторяй уже существующие варианты\n`;
    prompt += `- Только короткие названия (2-5 слов)\n`;
    prompt += `- Учитывай МАСШТАБ, БЮДЖЕТ и условия эксплуатации из контекста: варианты должны быть реалистично применимы к описанной ситуации (частный дом ≠ промышленная установка; индивидуальный проект ≠ предприятие)\n`;
    prompt += `- Если контекст указывает масштаб (число пользователей, бюджет, место) — каждый вариант должен выдерживать проверку этими ограничениями\n\n`;
    prompt += `Формат: каждый вариант с новой строки через тире. Русский язык.`;
  } else if (section === 'context') {
    // CONTEXT: only context, NO options/variants
    prompt += `Архитектурное решение: "${title}". Секция: контекст.\n`;
    if (currentContent?.trim()) {
      prompt += `Существующий текст:\n${currentContent}\n\n`;
      prompt += `Напиши ТОЛЬКО новые дополнения к контексту. Не повторяй уже написанное.\n`;
    } else {
      prompt += `Напиши контекст архитектурного решения.\n`;
    }
    prompt += `НЕ предлагай варианты решения (Option A/B) — только контекст: предпосылки, ограничения, требования, окружение.\n`;
    prompt += `Не используй фразы "предлагаю", "рекомендую". Пиши сразу текст.\n`;
    prompt += `Формат: структурированный markdown. Русский язык. Максимум 200 слов.`;
  } else {
    // CONSEQUENCES
    prompt += `Архитектурное решение: "${title}". Секция: последствия.\n`;
    if (currentContent?.trim()) {
      prompt += `Существующий текст:\n${currentContent}\n\n`;
      prompt += `Напиши ТОЛЬКО новые дополнения о последствиях. Не повторяй уже написанное.\n`;
    } else {
      prompt += `Напиши последствия архитектурного решения.\n`;
    }
    prompt += `Не используй фразы "предлагаю", "рекомендую". Пиши сразу текст.\n`;
    prompt += `Формат: структурированный markdown. Русский язык. Максимум 200 слов.`;
  }

  const requestBody = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: 'Ты — старший архитектор. Помогаешь оформить архитектурные решения. Отвечаешь на русском.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    max_tokens: 8000,
  });

  const response = await callZai(requestBody);

  // For options section, also extract alternatives
  let alternatives: string[] | undefined;
  if (section === 'options') {
    alternatives = extractAlternatives(response);
  }

  return { content: response, alternatives };
}

async function callZai(body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.z.ai',
      path: '/api/coding/paas/v4/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content || 'Анализ недоступен';
          resolve(content);
        } catch {
          reject(new Error(`Z.ai API error: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Z.ai timeout')); });
    req.write(body);
    req.end();
  });
}
