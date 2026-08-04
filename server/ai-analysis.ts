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
  parentTitle?: string;
  parentBody?: string;
  childrenTitles: string[];
  options: { letter: string; title: string }[];
}

export async function runArchitecturalAnalysis(ctx: AnalysisContext): Promise<{ analysis: string; model: string }> {
  const prompt = buildPrompt(ctx);

  const requestBody = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: 'Ты — старший архитектор аппаратного обеспечения. Анализируешь архитектурные решения (ADR) на концептуальном уровне. Отвечаешь ТОЛЬКО на русском языке. Не касаешься QA, тестирования или багов.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 800,
  });

  const response = await callZai(requestBody);
  return { analysis: response, model: MODEL };
}

function buildPrompt(ctx: AnalysisContext): string {
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
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Z.ai timeout')); });
    req.write(body);
    req.end();
  });
}
