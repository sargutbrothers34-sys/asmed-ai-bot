import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { readFile, readdir } from 'fs/promises'
import path from 'path'
import type { Lang, ConsultationFormData } from '@/lib/consultation'
import { getQuestionText, QUESTION_KEYS } from '@/lib/consultation'

const FORM_DATA_REGEX = /\[FORM_DATA\]([\s\S]*?)\[\/FORM_DATA\]/
const FIELD_REGEX = /\[FIELD:(\w+)\]/g

let cachedKnowledge = ''
let cachedYoutube = ''
let cachedTxt = ''
let cacheLoaded = false

async function loadKnowledgeCache(): Promise<void> {
  if (cacheLoaded) return
  const knowledgeDir = path.join(process.cwd(), 'knowledge')
  const [k, y, t] = await Promise.all([
    readFile(path.join(knowledgeDir, 'asmed_bilgi.md'), 'utf-8').catch(() => ''),
    readFile(path.join(knowledgeDir, 'asmed_youtube_ve_gorseller.md'), 'utf-8').catch(() => ''),
    getAllTxtContent(knowledgeDir),
  ])
  cachedKnowledge = k
  cachedYoutube = y
  cachedTxt = t
  cacheLoaded = true
}

async function getAllTxtContent(dir: string): Promise<string> {
  const parts: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        parts.push(await getAllTxtContent(full))
      } else if (e.name.endsWith('.txt')) {
        try {
          const content = await readFile(full, 'utf-8')
          parts.push(`\n---\n### ${e.name}\n${content}\n`)
        } catch {
          // skip unreadable
        }
      }
    }
  } catch {
    // dir not found
  }
  return parts.filter(Boolean).join('\n')
}

function extractFormData(text: string): ConsultationFormData | null {
  const match = text.match(FORM_DATA_REGEX)
  if (!match) return null
  const raw = match[1].trim()
  const candidates = [
    raw,
    raw.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'),
  ]
  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate) as ConsultationFormData
      if (data.personal && data.questionnaire) return data
    } catch {
      // try next
    }
  }
  return null
}

function extractSuggestedField(text: string): string | null {
  const m = text.match(/\[FIELD:(\w+)\]/)
  return m ? m[1] : null
}

const EXAMPLE_PATIENT_GALLERY_MARKER = '[EXAMPLE_PATIENT_GALLERY]'
const RESULTS_GALLERY_MARKER = '[RESULTS_GALLERY]'

function stripSpecialBlocks(text: string): string {
  return text
    .replace(FORM_DATA_REGEX, '')
    .replace(FIELD_REGEX, '')
    .replace(EXAMPLE_PATIENT_GALLERY_MARKER, '')
    .replace(RESULTS_GALLERY_MARKER, '')
    .trim()
}

function hasExamplePatientGallery(text: string): boolean {
  return text.includes(EXAMPLE_PATIENT_GALLERY_MARKER)
}

function hasResultsGallery(text: string): boolean {
  return text.includes(RESULTS_GALLERY_MARKER)
}

/** Galeri intent varsa AI'nın ürettiği gereksiz başlık/liste metnini temizle */
function stripGalleryRedundantText(text: string, intent: { resultsGallery: boolean; examplePatientGallery: boolean }): string {
  const redundantLines: RegExp[] = []
  if (intent.resultsGallery) {
    redundantLines.push(/^\s*Sonuç Görselleri\s*$/gm, /^\s*13 Ay Sonrası\s*:?\s*$/gm, /^\s*1 Yıl Sonrası\s*:?\s*$/gm, /^\s*14 Ay Sonrası\s*:?\s*$/gm)
  }
  if (intent.examplePatientGallery) {
    redundantLines.push(/^\s*Örnek Hasta Süreci\s*$/gm, /^\s*Ameliyat Öncesi\s*:?\s*$/gm, /^\s*Operasyon\s*:?\s*$/gm, /^\s*20 Ay Sonrası\s*:?\s*$/gm, /^\s*27 Ay Sonrası\s*:?\s*$/gm)
  }
  let out = text
  for (const re of redundantLines) out = out.replace(re, '')
  return out.replace(/\n{3,}/g, '\n\n').replace(/\n\s*\n/g, '\n\n').trim()
}

/** Kullanıcı mesajından galeri isteğini tespit et – AI marker üretmese bile galeri açılır */
function detectGalleryIntent(userMessage: string): { resultsGallery: boolean; examplePatientGallery: boolean } {
  const lower = (userMessage || '').toLowerCase()
  const resultsKeywords = [
    'önce-sonra sonuç', 'sonuç örnekleri', 'sonuç galerisi', 'sonuç galerisini aç',
    'results', 'örnek sonuç', '13 ay', '1 yıl', '14 ay', 'sonuç görselleri',
  ]
  const exampleKeywords = [
    '1950 greft', 'örnek hasta', 'örnek süreç', 'örnek süreç görselleri',
    'ameliyat öncesi operasyon', 'öncesi operasyon 20 ay 27 ay',
    'example patient', 'önce/sonra görselleri',
  ]
  const resultsGallery = resultsKeywords.some((k) => lower.includes(k))
  const examplePatientGallery = exampleKeywords.some((k) => lower.includes(k))
  return { resultsGallery, examplePatientGallery }
}

const LANG_RULES: Record<Lang, string> = {
  tr: 'Tüm yanıtlarını Türkçe ver. Bilgi kaynaklarındaki (.md ve .txt) içeriği Türkçe olarak hastaya aktar. Form soruları ve diğer tüm sorularda kaynaklara dayanarak, aynı detay ve profesyonellikle yanıt ver.',
  en: 'Respond only in English. Convey the content from the knowledge sources (.md and .txt) to the patient in English. For form questions and all other questions, answer based on the sources with the same level of detail and professionalism.',
  ar: 'أجب بالعربية فقط. انقل محتوى مصادر المعرفة (.md و.txt) للمريض بالعربية. في أسئلة النموذج وجميع الأسئلة الأخرى، أجب بناءً على المصادر بنفس مستوى التفصيل والاحترافية.',
  de: 'Antworten Sie ausschließlich auf Deutsch. Übermitteln Sie den Inhalt der Wissensquellen (.md und .txt) dem Patienten auf Deutsch. Bei Formularfragen und allen anderen Fragen antworten Sie basierend auf den Quellen mit gleichem Detaillierungsgrad und Professionalität.',
  ru: 'Отвечайте только на русском. Передавайте содержание источников знаний (.md и .txt) пациенту на русском. На вопросы формы и все остальные вопросы отвечайте на основе источников с тем же уровнем детализации и профессионализма.',
}

function buildSlimSystemPrompt(lang: Lang): string {
  const langRule = LANG_RULES[lang]
  const questionsList = QUESTION_KEYS.map((k, i) => `${i + 1}. ${getQuestionText(lang, k)}`).join('\n')
  return `You are ASMED Hair Transplant Center consultation assistant. Collect form data only. Keep replies SHORT (1-2 sentences).

IMPORTANT – clarification questions: If user asks a SHORT clarification about the current form question (e.g. "ne farkı var?", "what's the difference?", "hangisi daha iyi?", "which one is better?"), give a 1-2 sentence direct answer, THEN repeat the form question. Do NOT say "Form tamamlandıktan sonra detaylı yanıt vereceğim" for these—answer briefly. Only defer for broad/general ASMED/FUE questions unrelated to the current question.

${langRule}

## Validation rules:
- **Phone:** TR max 11 digits. Format hint when asking: TR "(başında 0 olmadan)", EN "(with country code)", AR "(مع رمز البلد)", DE "(mit Ländervorwahl)", RU "(с кодом страны)"
- **Email:** user@domain.ext. Reject typos.
- **Profession:** Real job only. Reject vulgar.
- **Profanity:** Never respond.
- **Short/ambiguous answers:** Ask for detail. Do NOT output FORM_DATA until all valid.

## Flow – collect in order:
1. name 2. phone 3. email 4. dateOfBirth [FIELD:dateOfBirth] 5. country [FIELD:country] 6. city 7. profession
8-20. Questionnaire (ask one by one):
${questionsList}

When ALL collected and valid, you MUST output [FORM_DATA]...[/FORM_DATA] in the SAME message. Use valid JSON on one line: [FORM_DATA]{"language":"${lang}","personal":{"name":"...","phone":"...","email":"...","dateOfBirth":"...","country":"...","city":"...","profession":"..."},"questionnaire":{"q1":"...","q2":"...",...,"q13":"..."}}[/FORM_DATA]. The photo upload UI only appears when this block is present. Then ask for 6 Dry + 6 Wet photos.`
}

function buildSystemPrompt(lang: Lang, knowledge: string, youtubeGorseller: string, txtContent: string): string {
  const langRule = LANG_RULES[lang]
  const questionsList = QUESTION_KEYS.map((k, i) => `${i + 1}. ${getQuestionText(lang, k)}`).join('\n')
  const txtSection = txtContent.trim() ? `\n## Additional sources (knowledge/*.txt - USE THIS CONTENT):\n${txtContent}\n` : ''
  return `You are ASMED Hair Transplant Center's official consultation assistant. Use ONLY the information sources below. Never mention other clinics or non-ASMED methods. If asked: "I can only provide information about ASMED and Dr. Koray Erdoğan methods."

## Response style (IMPORTANT)
Give DIRECT, EFFICIENT answers. Prefer 3-6 sentences for most questions—use bullet points for multi-step topics. Only expand to paragraphs for very complex topics. No long preamble. Start with the answer. Use knowledge sources for facts. Same professionalism in all languages.

${langRule}

## YouTube and images rule (IMPORTANT)
When your answer relates to a topic that has a YouTube link in the list below, include that link directly in your message (as a clickable URL). Video links render as preview cards.
MANDATORY for KE-Rest, KE-Bot, K.E.E.P., KE-Head, Coverage Value, Graft Calculator: ALWAYS include the corresponding YouTube link – KE-Rest https://youtu.be/4MH-1F0PuYE, KE-Bot https://youtu.be/h4fb9t-MLog, K.E.E.P. https://youtu.be/z9o9S8lrrXA, KE-Head https://youtu.be/dJabUx1lG2c, Coverage Value https://youtu.be/kXeTNdDB_e0, Graft Calculator https://youtu.be/NFn-R9WikC8
When discussing the clinic: use ![Clinic](/images/clinic/clinic-1.jpg).

**GALLERY MARKERS (MANDATORY):**
- "Önce-sonra sonuç", "sonuç örnekleri", "1950 greft", "örnek hasta", "örnek süreç" → append [RESULTS_GALLERY] and/or [EXAMPLE_PATIENT_GALLERY] at END of reply.
- FORBIDDEN: Do NOT write "Sonuç Görselleri", "13 Ay Sonrası: Sonuç", "Ameliyat Öncesi", "Operasyon", "20 Ay Sonrası", "27 Ay Sonrası" as headings or lists. The UI renders galleries only when you output the markers. If you write those headings, NO images appear – the galleries are broken.
- CORRECT format: Brief 1–2 sentence intro + [RESULTS_GALLERY] and/or [EXAMPLE_PATIENT_GALLERY]. Example: "İşte önce-sonra sonuçları ve videolar: [RESULTS_GALLERY]"
- "Konaklama Seçenekleri" – spell as "Konaklama", never "Kalamak".

When user asks for results: [RESULTS_GALLERY]. When user asks for 1950 greft example: [EXAMPLE_PATIENT_GALLERY]. When both: [RESULTS_GALLERY] [EXAMPLE_PATIENT_GALLERY].

## YouTube and image reference (use when topic matches):
${youtubeGorseller}
${txtSection}
## Main information source (use only this):
${knowledge}

## Validation rules (MUST follow – do not skip):
- **Phone:** Validate by language. When ASKING for phone, ALWAYS include the format hint in your message (see below).
  - **TR:** Max 11 digits. Reject 0555555555555 etc. Say: "Başında 0 olmadan, 10–11 hane."
  - **EN/AR/DE/RU:** Validate reasonable length, reject if invalid. Brief error in that language.
- **Email:** Must look like user@domain.ext (e.g. @gmail.com, @hotmail.com). If user writes @gmial.com or @gmai.com or similar typo, say: "E-posta adresinde yazım hatası olabilir, lütfen kontrol edin." / "There might be a typo in your email, please check."
- **Profession:** Must be a real profession. If user writes vulgar, joke, or inappropriate answer (e.g. "silah kaçakçısı", "tester", offensive terms), say: "Lütfen gerçek mesleğinizi yazın." / "Please enter your actual profession."
- **Profanity/vulgar:** Never respond to profanity or vulgar language. Say: "Lütfen uygun bir dil kullanın." / "Please use appropriate language."
- **Short answers:** For questions that need detail (e.g. q1: which hair area, expected result), if user answers with only 1–2 words (e.g. "tepe", "saç"), say: "Biraz daha detay verebilir misiniz? Örneğin tepe bölgesi derken ne tür sonuç bekliyorsunuz?" / "Could you provide a bit more detail? For example, when you say 'tepe', what kind of result do you expect?"
- **Ambiguous yes/no:** When the question has multiple parts (e.g. "Do you use medication? If not, are you willing to start?") and the user answers only "evet", "hayır", "yes", "no", ask: "Evet/hayır ile neyi kastettiniz? İlaç kullanıyor musunuz, yoksa kullanmıyorsanız başlamaya istekli misiniz?" / "Yes/no – which part? Are you using medication, or willing to start if not?" Get a clear answer before proceeding.
- Do NOT output FORM_DATA and do NOT proceed to photo upload until the user has given valid, appropriate answers to all fields.

## Consultation flow – collect in this exact order:

### Step 1 – Personal information (ask one at a time, politely):
1. name (full name)
2. phone – When asking, add short format hint: TR "(başında 0 olmadan)", EN "(with country code)", AR "(مع رمز البلد)", DE "(mit Ländervorwahl)", RU "(с кодом страны)"
3. email (validate format)
4. dateOfBirth – when asking, end your message with [FIELD:dateOfBirth]
5. country – when asking, end your message with [FIELD:country]
6. city
7. profession (validate: real job, not vulgar/joke)

### Step 2 – Questionnaire (13 questions). Ask naturally, one by one:
${questionsList}

When asking for date of birth, include [FIELD:dateOfBirth] at the end of your message.
When asking for country, include [FIELD:country] at the end of your message.

### CRITICAL – Photo upload step:
When ALL personal fields AND all 13 questionnaire answers are collected AND all answers are valid (no vulgar, correct email, sufficient detail), you MUST do BOTH in the SAME message:
1. Output this EXACT block at the end of your reply (use the user's exact values, escape quotes in values with backslash):
[FORM_DATA]{"language":"${lang}","personal":{"name":"...","phone":"...","email":"...","dateOfBirth":"...","country":"...","city":"...","profession":"..."},"questionnaire":{"q1":"...","q2":"...","q3":"...","q4":"...","q5":"...","q6":"...","q7":"...","q8":"...","q9":"...","q10":"...","q11":"...","q12":"...","q13":"..."}}[/FORM_DATA]
2. Tell the user they can now upload 6 "Kuru"/"Dry" and 6 "Islak"/"Wet" hair photos for Dr. Erdogan's evaluation.
The photo upload UI will NOT appear unless [FORM_DATA]...[/FORM_DATA] is in your message. So you MUST include it when asking for photos.`
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { message: 'Sunucu yapılandırma hatası. OPENAI_API_KEY tanımlı değil.' },
        { status: 500 }
      )
    }
    const openai = new OpenAI({ apiKey })

    const body = (await req.json()) as {
      messages: { role: string; content: string }[]
      language?: Lang
      collectedData?: Partial<ConsultationFormData>
      photoUploadRequested?: boolean
      consultationComplete?: boolean
      formDataPresent?: boolean
      stream?: boolean
    }
    const { messages, language = 'en', collectedData, photoUploadRequested, consultationComplete, formDataPresent, stream: wantStream } = body
    const useSlimPrompt = !consultationComplete && !formDataPresent
    const useStream = !!wantStream && !useSlimPrompt
    const lastUserMsg = (messages as { role: string; content: string }[]).filter((m) => m.role === 'user').pop()?.content ?? ''
    const galleryIntent = detectGalleryIntent(lastUserMsg)
    let systemPrompt: string
    if (useSlimPrompt) {
      systemPrompt = buildSlimSystemPrompt(language)
    } else {
      await loadKnowledgeCache()
      systemPrompt = buildSystemPrompt(language, cachedKnowledge, cachedYoutube, cachedTxt)
    }

    let context =
      collectedData && Object.keys(collectedData).length > 0
        ? `\n\nAlready collected from user (do not ask again): ${JSON.stringify(collectedData)}`
        : ''
    if (photoUploadRequested) {
      context += `\n\nURGENT: The user was previously asked to upload 6 Dry and 6 Wet photos but the photo upload UI did not appear because [FORM_DATA] was missing. You MUST output [FORM_DATA]{"language":"${language}","personal":{...},"questionnaire":{...}}[/FORM_DATA] in this response with ALL data extracted from the conversation. Extract name, phone, email, dateOfBirth, country, city, profession and q1-q13 from the user's messages. The UI depends on it.`
    }
    if (consultationComplete) {
      context += `\n\nThe user has already completed the consultation form and photo upload. They are now asking general questions. Answer normally from the knowledge base. Do NOT ask for form data or photos.`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 85000)

    const model = useSlimPrompt ? 'gpt-4o' : 'gpt-4o-mini'
    const trimmedMessages = useSlimPrompt ? messages : messages.slice(-10)
    const apiMessages = [
      { role: 'system' as const, content: systemPrompt + context },
      ...trimmedMessages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ]

    if (useStream) {
      const stream = await openai.chat.completions.create(
        { model, max_tokens: 1024, messages: apiMessages, stream: true },
        { signal: controller.signal }
      )
      clearTimeout(timeoutId)
      let fullContent = ''
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content ?? ''
              if (text) {
                fullContent += text
                controller.enqueue(encoder.encode(JSON.stringify({ c: text }) + '\n'))
              }
            }
            const fromAi = { g: hasExamplePatientGallery(fullContent), r: hasResultsGallery(fullContent) }
            const showExamplePatientGallery = fromAi.g || galleryIntent.examplePatientGallery
            const showResultsGallery = fromAi.r || galleryIntent.resultsGallery
            controller.enqueue(encoder.encode(JSON.stringify({ d: true, g: showExamplePatientGallery, r: showResultsGallery }) + '\n'))
          } catch (e) {
            controller.enqueue(encoder.encode(JSON.stringify({ e: (e as Error).message }) + '\n'))
          } finally {
            controller.close()
          }
        },
      })
      return new Response(readable, {
        headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
      })
    }

    const response = await openai.chat.completions.create(
      { model, max_tokens: 1024, messages: apiMessages },
      { signal: controller.signal }
    )
    clearTimeout(timeoutId)

    const content = response.choices[0]?.message?.content ?? ''
    const formData = extractFormData(content)
    const suggestedNextField = extractSuggestedField(content)
    let cleanMessage = stripSpecialBlocks(content)
    cleanMessage = stripGalleryRedundantText(cleanMessage, galleryIntent)
    const fromAi = { g: hasExamplePatientGallery(content), r: hasResultsGallery(content) }
    const showExamplePatientGallery = fromAi.g || galleryIntent.examplePatientGallery
    const showResultsGallery = fromAi.r || galleryIntent.resultsGallery

    if (formData) {
      console.log('Konsültasyon form verisi (metin):', JSON.stringify(formData, null, 2))
    }

    return NextResponse.json({
      message: cleanMessage,
      ...(formData && { formData }),
      ...(suggestedNextField && { suggestedNextField }),
      ...(showExamplePatientGallery && { showExamplePatientGallery: true }),
      ...(showResultsGallery && { showResultsGallery: true }),
    })
  } catch (error) {
    const err = error as Error & { name?: string }
    const isAbort =
      err?.name === 'AbortError' ||
      err?.name === 'APIUserAbortError' ||
      /abort|was aborted/i.test(err?.message ?? '')
    console.error('Chat API error:', isAbort ? 'Timeout/Abort' : error)
    return NextResponse.json(
      {
        message: isAbort
          ? 'Yanıt gecikti. Lütfen kısa bir mesajla tekrar deneyin.'
          : 'Bir hata oluştu. Lütfen tekrar deneyin.',
      },
      { status: 500 }
    )
  }
}
