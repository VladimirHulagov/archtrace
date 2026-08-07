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
    max_tokens: 4000,
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
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\s*(Альтернативы|Alternatives)/i.test(trimmed)) { inAltSection = true; continue; }
    if (/^#{1,3}\s/.test(trimmed) && inAltSection) { inAltSection = false; }
    if (inAltSection && /^[-*]\s+/.test(trimmed)) {
      const clean = trimmed.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim();
      if (clean.length > 5) alts.push(clean);
    }
    // Also match inline "Альтернатива:" prefix
    const altMatch = trimmed.match(/^(?:[-*]?\s*)?\*{0,2}Альтернатива[:\s]*\*{0,2}\s*(.+)/i);
    if (altMatch && altMatch[1].length > 5) {
      alts.push(altMatch[1].trim());
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
}): Promise<{ content: string; alternatives?: string[] }> {
  const { section, title, currentContent, phase } = params;

  const sectionLabels: Record<string, string> = {
    context: 'контекст',
    options: 'варианты решения',
    consequences: 'последствия',
  };

  let prompt = '';

  if (section === 'options') {
    // OPTIONS: short names only, no descriptions
    prompt += `Архитектурное решение: "${title}".\n`;
    if (currentContent?.trim()) {
      prompt += `Существующие варианты:\n${currentContent}\n\n`;
    }
    prompt += `Предложи 3-5 новых вариантов решения. Только короткие названия (2-7 слов), без описаний.\n`;
    prompt += `Формат: каждый вариант с новой строки, через тире. Пример:\n- Air cooling с радиаторами\n- Liquid cooling с холодными пластинами\n- Hybrid immersion cooling\n\n`;
    prompt += `Не используй "Вариант А", "Option A", буквы. Только названия. Русский язык.`;
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
    max_tokens: 4000,
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
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Z.ai timeout')); });
    req.write(body);
    req.end();
  });
}
