import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { readFile, readdir } from 'fs/promises'
import path from 'path'
import type { Lang, ConsultationFormData } from '@/lib/consultation'
import { getQuestionText, QUESTION_KEYS } from '@/lib/consultation'

const FORM_DATA_REGEX = /\[FORM_DATA\]([\s\S]*?)\[\/FORM_DATA\]/
const FIELD_REGEX = /\[FIELD:(\w+)\]/g
const BASIC_PROFILE_MARKER = '[BASIC_PROFILE_COLLECTED]'
const CONTACT_FORM_URL = 'https://www.hairtransplantfue.org/book-a-consultation'
const CONTACT_PHONE_BLOCK = `Turkey: +90 216 4641111
United Kingdom: +44 2035191146
Italy: +39 0294755240
USA: +1 8454612049
France: +33 176542630
Spain: +34 911436417
Sweden: +46 313011832
Germany: +49 6989914911
Czech Republic: +420 228882249
Serbia: +421 233056718
Australia: +61 280156855
Republic of Korea: +82 2 6959 3393`

let cachedKnowledge = ''
let cachedYoutube = ''
let cachedTxt = ''
let cachedFaqSpecial = ''
let cacheLoaded = false

async function loadKnowledgeCache(): Promise<void> {
  if (cacheLoaded) return
  const knowledgeDir = path.join(process.cwd(), 'knowledge')
  const [k, y, t, f] = await Promise.all([
    readFile(path.join(knowledgeDir, 'asmed_bilgi.md'), 'utf-8').catch(() => ''),
    readFile(path.join(knowledgeDir, 'asmed_youtube_ve_gorseller.md'), 'utf-8').catch(() => ''),
    getAllTxtContent(knowledgeDir),
    readFile(path.join(knowledgeDir, 'txt', 'faq_special.txt'), 'utf-8').catch(() => ''),
  ])
  cachedKnowledge = k
  cachedYoutube = y
  cachedTxt = t
  cachedFaqSpecial = f
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
    .replace(BASIC_PROFILE_MARKER, '')
    .trim()
}

function hasExamplePatientGallery(text: string): boolean {
  return text.includes(EXAMPLE_PATIENT_GALLERY_MARKER)
}

function hasResultsGallery(text: string): boolean {
  return text.includes(RESULTS_GALLERY_MARKER)
}

function hasBasicProfileCollected(text: string): boolean {
  return text.includes(BASIC_PROFILE_MARKER)
}

function detectContactIntent(userMessage: string): boolean {
  const q = (userMessage || '').toLowerCase().trim()
  
  // Exclude FAQ-style questions (information questions, not contact requests)
  const excludePatterns = [
    /bilgi alabilir miyim/i,
    /hakkında bilgi/i,
    /nedir/i,
    /nasıl/i,
    /ne zaman/i,
    /neden/i,
    /var mı/i,
    /yapılabilir mi/i,
    /mümkün müdür/i,
    /what is/i,
    /how is/i,
    /how does/i,
    /when/i,
    /why/i,
    /can i see/i,
    /can you show/i,
  ]
  
  // If it's clearly an information question, exclude it
  if (excludePatterns.some((pattern) => pattern.test(q))) {
    // But allow if it explicitly asks for contact info even in question format
    const explicitContactInQuestion = [
      'numara', 'telefon', 'iletişim bilgileri', 'contact number', 'contact info',
      'randevu', 'booking', 'appointment',
    ]
    if (!explicitContactInQuestion.some((k) => q.includes(k))) {
      return false
    }
  }
  
  // Only detect if user explicitly asks for contact info, phone number, or booking
  // Exclude generic phrases like "iletişime geçin" that appear in AI responses
  const explicitKeys = [
    'numara', 'telefon', 'telefon no', 'telefon numarası', 'direk no', 'direkt no', 'ara', 'arayayım', 'arayim', 'arayabilir miyim',
    'phone number', 'phone no', 'call me', 'whatsapp', 'instagram', 'randevu', 'randevu almak', 'randevu alabilir miyim', 'book', 'booking', 'appointment',
    'iletişim bilgileri', 'iletişim bilgileriniz', 'iletişim numarası', 'iletişim numaraları', 'contact number', 'contact info', 'contact information',
  ]
  
  // Exclude if it's just a generic phrase that appears in AI responses
  const excludePhrases = [
    'ekibimizle iletişime geçin', 'iletişime geçin', 'contact our team', 'contact us',
  ]
  if (excludePhrases.some((p) => q.includes(p))) return false
  
  return explicitKeys.some((k) => q.includes(k))
}

function detectOpinionOrReviewIntent(userMessage: string): boolean {
  const q = (userMessage || '').toLowerCase()
  const keys = [
    'sence', 'bence', 'iyi mi kötü', 'iyi mi', 'kötü mü', 'dezavantaj', 'avantaj',
    'yorum', 'yorumlar', 'review', 'reviews', 'internette', 'internette ne diyorlar',
    'webde', 'forumlarda', 'pahalı mı',
  ]
  return keys.some((k) => q.includes(k))
}

function getContactBlock(
  lang: Lang,
  options?: { includePhones?: boolean; includeForm?: boolean }
): string {
  const includePhones = options?.includePhones ?? true
  const includeForm = options?.includeForm ?? true
  const intro = {
    tr: 'Ekibimizle hemen iletişime geçebilirsiniz:',
    en: 'You can contact our team directly:',
    de: 'Sie können unser Team direkt kontaktieren:',
    ru: 'Вы можете напрямую связаться с нашей командой:',
    ar: 'يمكنك التواصل مع فريقنا مباشرة:',
  }[lang] || 'You can contact our team directly:'

  const formLabel = {
    tr: 'Konsültasyon formu',
    en: 'Consultation form',
    de: 'Beratungsformular',
    ru: 'Форма консультации',
    ar: 'نموذج الاستشارة',
  }[lang] || 'Consultation form'

  const consultationCta = {
    tr: 'Formu aç',
    en: 'Open form',
    de: 'Formular öffnen',
    ru: 'Открыть форму',
    ar: 'فتح النموذج',
  }[lang] || 'Open form'

  const phoneList = CONTACT_PHONE_BLOCK.split('\n').filter(Boolean).map((line) => `- ${line}`).join('\n')
  const sections: string[] = [intro]
  if (includePhones) sections.push(phoneList)
  if (includeForm) sections.push(`- ${formLabel}: [${consultationCta}](${CONTACT_FORM_URL})`)
  return sections.join('\n')
}

function ensureContactBlock(text: string, lang: Lang): string {
  const hasPhone = /\+\d{1,3}\s?\d/.test(text)
  const hasForm = text.includes(CONTACT_FORM_URL)
  const needPhones = !hasPhone
  const needForm = !hasForm
  if (!needPhones && !needForm) return text
  const base = text.trim()
  const block = getContactBlock(lang, { includePhones: needPhones, includeForm: needForm })
  return base ? `${base}\n\n${block}` : block
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

function getPhoneForLanguage(lang: Lang): string {
  const phoneMap: Record<Lang, string> = {
    tr: '+90 216 4641111',
    en: '+44 2035191146', // UK default for English
    de: '+49 6989914911',
    ru: '+7 495 1234567', // Russia (placeholder, adjust if needed)
    ar: '+90 216 4641111', // Turkey for Arabic speakers
  }
  return phoneMap[lang] || '+90 216 4641111'
}

function buildSlimSystemPrompt(lang: Lang): string {
  const langRule = LANG_RULES[lang]
  const primaryPhone = getPhoneForLanguage(lang)
  
  const phoneRequestText = {
    tr: `Şimdi lütfen telefon numaranızı başında 0 olmadan paylaşır mısınız? (Örnek: 555 135 15 32)`,
    en: `Now please share your phone number with country code. (Example: ${primaryPhone})`,
    de: `Bitte teilen Sie nun Ihre Telefonnummer mit Ländervorwahl mit. (Beispiel: ${primaryPhone})`,
    ru: `Теперь, пожалуйста, укажите ваш номер телефона с кодом страны. (Пример: ${primaryPhone})`,
    ar: `الآن يرجى مشاركة رقم هاتفك مع رمز البلد. (مثال: ${primaryPhone})`,
  }[lang] || `Now please share your phone number with country code. (Example: ${primaryPhone})`

  return `You are ASMED Hair Transplant Center consultation assistant. Keep replies SHORT (1-2 sentences).

${langRule}

You are in BASIC ONBOARDING mode. Collect ONLY these two fields, in this order:
1) Full name (name + surname)
2) Phone number

Rules:
- Do NOT ask for email, date of birth, country, city, profession, or questionnaire in this mode.
- **CRITICAL: When asking for phone number, use ONLY this exact text (translate to user's language): "${phoneRequestText}"**
- **ABSOLUTELY FORBIDDEN: Do NOT add contact numbers, phone lists, "Ekibimizle iletişime geçebilirsiniz", "You can contact our team", consultation form links, or any other contact information when asking for phone number.**
- **ABSOLUTELY FORBIDDEN: Do NOT append contact blocks, phone lists, or form links after asking for phone number.**
- If user asks a medical/general question before completing name+phone, politely ask them to first share full name and phone.
- Phone validation: TR max 11 digits (without leading 0). Other countries: validate format but be flexible.
- Full name validation: require realistic full name (at least 2 words, letters only). Reject fake/gibberish samples like "asdas", "test user", "qwe qwe".

When BOTH name and phone are collected and valid:
- confirm shortly that onboarding is complete
- tell the user they can now ask any question freely
- append this marker at the END: [BASIC_PROFILE_COLLECTED]
`
}

function buildSystemPrompt(lang: Lang, knowledge: string, youtubeGorseller: string, txtContent: string, faqSpecial: string): string {
  const consultationFormUrl = 'https://www.hairtransplantfue.org/book-a-consultation'
  const contactDetails = `We answer your calls from our clinic in Istanbul during our normal business hours (from 8am to 6pm GMT +2) and 24h/day for emergencies.

Turkey: +90 216 4641111
United Kingdom: +44 2035191146
Italy: +39 0294755240
USA: +1 8454612049
France: +33 176542630
Spain: +34 911436417
Sweden: +46 313011832
Germany: +49 6989914911
Czech Republic: +420 228882249
Serbia: +421 233056718
Australia: +61 280156855
Republic of Korea: +82 2 6959 3393

Bosphorus IstanbulH
Hair Transplant Turkey
Asmed Hair Transplant Clinic
Atatürk Mah. Sedef Caddesi No: 1/1
Ataşehir - İstanbul`

  const languageInstruction = {
    tr: 'Cevapları Türkçe ver.',
    en: 'Answer in English.',
    de: 'Antworte auf Deutsch.',
    ru: 'Отвечай на русском.',
    ar: 'أجب باللغة العربية.',
  }[lang] || 'Answer in English.'

  const fallbackNoInfo = {
    tr: `Bu konuda size en doğru yönlendirmeyi ekibimiz sağlayacaktır. Daha detaylı bilgi için lütfen ekibimizle iletişime geçin veya konsültasyon formunu doldurun: ${consultationFormUrl}`,
    en: `Our team can provide the most accurate guidance for this topic. For detailed information, please contact our team or fill out the consultation form: ${consultationFormUrl}`,
    de: `Unser Team kann Ihnen hierzu die genaueste Einschätzung geben. Für detaillierte Informationen kontaktieren Sie bitte unser Team oder füllen Sie das Beratungsformular aus: ${consultationFormUrl}`,
    ru: `Самую точную информацию по этому вопросу предоставит наша команда. Для подробностей свяжитесь с нашей командой или заполните консультационную форму: ${consultationFormUrl}`,
    ar: `سيقدّم فريقنا أدق توجيه بخصوص هذا الموضوع. لمزيد من التفاصيل يرجى التواصل مع فريقنا أو تعبئة نموذج الاستشارة: ${consultationFormUrl}`,
  }[lang] || `Our team can provide the most accurate guidance for this topic. For detailed information, please contact our team or fill out the consultation form: ${consultationFormUrl}`

  const partialInfoFallback = {
    tr: `Bu sorunun bazı detayları kişisel değerlendirme gerektirir. Netleştirmek için lütfen ekibimizle iletişime geçin veya formu doldurun: ${consultationFormUrl}`,
    en: `Some details of this question require a personalized evaluation. Please contact our team or fill out the consultation form: ${consultationFormUrl}`,
    de: `Einige Details dieser Frage erfordern eine individuelle Bewertung. Bitte kontaktieren Sie unser Team oder füllen Sie das Beratungsformular aus: ${consultationFormUrl}`,
    ru: `Некоторые детали этого вопроса требуют индивидуальной оценки. Пожалуйста, свяжитесь с нашей командой или заполните консультационную форму: ${consultationFormUrl}`,
    ar: `بعض تفاصيل هذا السؤال تتطلب تقييماً شخصياً. يرجى التواصل مع فريقنا أو تعبئة نموذج الاستشارة: ${consultationFormUrl}`,
  }[lang] || `Some details of this question require a personalized evaluation. Please contact our team or fill out the consultation form: ${consultationFormUrl}`

  const priceFallback = {
    tr: 'Fiyatlandırma greft başına kişiye özel yapılmaktadır. Net bilgi için formu doldurmanız gerekmektedir.',
    en: 'Pricing is personalized per graft. Please complete the consultation form for exact information.',
    de: 'Die Preisgestaltung erfolgt individuell pro Graft. Für genaue Informationen füllen Sie bitte das Beratungsformular aus.',
    ru: 'Стоимость рассчитывается индивидуально за графт. Для точной информации заполните, пожалуйста, консультационную форму.',
    ar: 'يتم تحديد السعر بشكل فردي لكل طُعم. للحصول على معلومات دقيقة يرجى تعبئة نموذج الاستشارة.',
  }[lang] || 'Pricing is personalized per graft. Please complete the consultation form for exact information.'

  const operationCountFallback = {
    tr: 'ASMED butik bir kliniktir ve her hastaya özel planlama yapılır. Günlük sayı, kalite standartlarımıza göre belirlenir.',
    en: 'ASMED is a boutique clinic and each patient is planned individually. Daily numbers are determined according to our quality standards.',
    de: 'ASMED ist eine Boutique-Klinik, und jeder Patient wird individuell geplant. Die tägliche Anzahl richtet sich nach unseren Qualitätsstandards.',
    ru: 'ASMED — бутиковая клиника, и для каждого пациента составляется индивидуальный план. Ежедневное количество определяется по нашим стандартам качества.',
    ar: 'ASMED عيادة بوتيك ويتم التخطيط لكل مريض بشكل فردي. يتم تحديد العدد اليومي وفقًا لمعايير الجودة لدينا.',
  }[lang] || 'ASMED is a boutique clinic and each patient is planned individually. Daily numbers are determined according to our quality standards.'

  const txtSection = txtContent.trim()
    ? `\n## CONTEXT_BLOCK_TXT (knowledge/**/*.txt, includes faq_special.txt):\n${txtContent}\n`
    : '\n## CONTEXT_BLOCK_TXT:\nNo txt content provided.\n'
  const faqSection = faqSpecial.trim()
    ? `\n## FAQ_SPECIAL_HIGH_PRIORITY (knowledge/txt/faq_special.txt):\n${faqSpecial}\n`
    : '\n## FAQ_SPECIAL_HIGH_PRIORITY:\nNo faq_special provided.\n'

  return `
Role: You are the official AI Consultant for ASMED Hair Transplant Center (Dr. Koray Erdogan).
Your Goal: Assist potential patients with professional, accurate medical information based ONLY on the provided context.

--- CRITICAL RULES (STRICT COMPLIANCE REQUIRED) ---

1. **NO HALLUCINATIONS:** You must ONLY use the information provided in the CONTEXT_BLOCK below.
   If the answer is fully absent in context, you MUST say exactly this (in conversation language):
   "${fallbackNoInfo}"
   If the question is partially covered, first answer the covered part from context, then add this sentence:
   "${partialInfoFallback}"

2. **NO NUMBERS/PRICES:** NEVER invent operation counts, prices, or statistics.
   - If asked about PRICE, say: "${priceFallback}"
   - If asked about OPERATION COUNT, say: "${operationCountFallback}"
   - **FORBIDDEN: Do NOT mention investment amounts, facility costs, or facility investment figures (e.g., "50 milyon TL'lik yatırım", "million investment", "yatırım yapılmış", etc.) even if mentioned in context. Skip these financial investment details entirely.**
   - **ALLOWED: You CAN mention phone numbers, ages, graft counts, time periods, and other necessary operational numbers. Only facility investment/financial figures are forbidden.**

3. **BRAND IDENTITY:** You are not a generic AI. You represent a Luxury, Boutique Medical Clinic.
   - NEVER suggest other clinics.
   - Focus areas when relevant: Manual FUE, KE-Bot, K.E.E.P. Embedding, Coverage Value.

4. **DATA PRIVACY:** Do not ask for personal data in normal chat answers. Direct users to the consultation form flow when needed.

5. **GALLERY OUTPUT (UI-CRITICAL):**
   - Before/after or results requests => append [RESULTS_GALLERY] at the end.
   - 1950 graft example patient process => append [EXAMPLE_PATIENT_GALLERY] at the end.
   - Do NOT write manual placeholder headings like "Sonuç Görselleri", "13 Ay Sonrası", "Örnek Hasta Süreci".

6. **YOUTUBE LINKS (MANDATORY WHEN TOPIC MATCHES):**
   For KE-Rest, KE-Bot, K.E.E.P., KE-Head, Coverage Value, Graft Calculator topics, include the corresponding YouTube links from context.

7. **USE ALL LOADED SOURCES (VERY IMPORTANT):**
   - Always answer by checking ALL provided context blocks together: MAIN_KNOWLEDGE_MD + FAQ_SPECIAL_HIGH_PRIORITY + YOUTUBE_AND_VISUALS_MD + CONTEXT_BLOCK_TXT.
   - Do not ignore details just because the answer can be short.
   - Interpret paraphrased/colloquial user questions by meaning (semantic match), not only exact wording.
   - If the question is covered in FAQ_SPECIAL_HIGH_PRIORITY, include the key details from that source and do not over-shorten.
   - If multiple sources mention the same topic, merge them into one coherent answer.

8. **COMMUNICATION STYLE FOR LIMITS:**
   - Never say phrases like "kaynaklarımızda yok", "dökümanlarımda yok", or "doktorunuza danışın".
   - If details are missing/uncertain, you can mention "ekibimizle iletişime geçin" or "konsültasyon formunu doldurun" but DO NOT append contact phone numbers or form links unless user explicitly asks for them.
   - When you say "ekibimizle iletişime geçin", just mention the consultation form URL once, do NOT add phone number lists.

9. **NO PERSONAL OPINION / NO SPECULATION (STRICT):**
   - Never answer as personal opinion (e.g., "bence", "sence", "I think", "in my opinion").
   - Never invent or infer disadvantages, criticism, or negative claims unless explicitly stated in context.
   - If user asks "dezavantajları ne?", "iyi mi kötü mü?", "sence pahalı mı?" etc., answer only with context-backed facts.
   - If a requested claim is not explicitly in context, provide available factual info and then guide user to ASMED team for detailed evaluation.

10. **INTERNET/REVIEWS QUESTIONS (STRICT):**
   - Do not claim live web browsing or external review aggregation.
   - For "internette ne diyorlar / yorumlar ne?" style questions, only share official channels and references present in context (official forum, official YouTube, official contacts).
   - Do not produce unverifiable popularity/reputation statements beyond context.

---------------------------------------------------

CONTEXT_BLOCK (SOURCE OF TRUTH):
## MAIN_KNOWLEDGE_MD
${knowledge}

${faqSection}

## YOUTUBE_AND_VISUALS_MD
${youtubeGorseller}
${txtSection}

## OFFICIAL_CONTACT_AND_BOOKING
Consultation form: ${consultationFormUrl}
${contactDetails}

---------------------------------------------------

INSTRUCTIONS:
- ${languageInstruction}
- Keep answers professional and empathetic. Prefer complete answers with relevant context details (usually 6-10 sentences, or bullets for clarity). If user explicitly asks "kısaca/brief", then shorten.
- For technical comparison questions (FUE/FUT, motorlu vs manuel, vb.), clearly include ASMED/Dr. Koray Erdoğan yaklaşımını ve farkını context'e dayanarak belirt.
- If user asks "How many grafts do I need?", answer that this requires ASMED team's personalized evaluation via consultation form.
- **CRITICAL: Do NOT append contact numbers/form to answers unless user EXPLICITLY asks for:**
  - Phone number ("numara", "telefon", "phone number")
  - Contact information ("iletişim bilgileri", "contact info")
  - Booking/appointment ("randevu", "booking", "appointment")
- **FORBIDDEN: Do NOT add contact block when you say generic phrases like "ekibimizle iletişime geçin" or "contact our team". These are just directions, not requests for contact info.**
- **FORBIDDEN: Do NOT add contact block for FAQ/information questions (questions starting with "nedir", "nasıl", "ne zaman", "var mı", "yapılabilir mi", "what is", "how", "when", "can you show", etc.). These are knowledge questions, not contact requests.**
- Only when user EXPLICITLY requests contact info/phone/booking (not just asking "bilgi alabilir miyim" or similar), then include consultation form URL and relevant contact details.
- If discussing clinic/facilities and relevant in context, use: ![Clinic](/images/clinic/clinic-1.jpg)
- Do NOT add claims that are not explicitly present in context.

**PHONE NUMBER UPDATE (AFTER ONBOARDING):**
- If user says they wrote wrong phone number, wants to change/update phone number, or provides a new phone number after onboarding is complete (e.g., "yanlış numara yazdım", "telefon numaramı değiştirmek istiyorum", "numara değiştirdim"), accept it gracefully.
- Ask for the correct phone number using this format (translate to user's language):
  ${{
    tr: 'Tabii ki! Lütfen doğru telefon numaranızı başında 0 olmadan paylaşır mısınız? (Örnek: 555 135 15 32)',
    en: 'Of course! Please share your correct phone number with country code.',
    de: 'Natürlich! Bitte teilen Sie Ihre korrekte Telefonnummer mit Ländervorwahl mit.',
    ru: 'Конечно! Пожалуйста, укажите ваш правильный номер телефона с кодом страны.',
    ar: 'بالطبع! يرجى مشاركة رقم هاتفك الصحيح مع رمز البلد.',
  }[lang] || 'Of course! Please share your correct phone number with country code.'}
- Do NOT add contact numbers or "Ekibimizle iletişime geçebilirsiniz" messages when asking for phone update.
- After receiving the updated phone number, confirm briefly and continue the conversation normally.
`
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
      basicProfileCollected?: boolean
      stream?: boolean
    }
    const {
      messages,
      language = 'en',
      collectedData,
      photoUploadRequested,
      consultationComplete,
      formDataPresent,
      basicProfileCollected = false,
      stream: wantStream,
    } = body
    const useSlimPrompt = !consultationComplete && !formDataPresent && !basicProfileCollected
    const useStream = !!wantStream && !useSlimPrompt
    const lastUserMsg = (messages as { role: string; content: string }[]).filter((m) => m.role === 'user').pop()?.content ?? ''
    const galleryIntent = detectGalleryIntent(lastUserMsg)
    const contactIntent = detectContactIntent(lastUserMsg)
    const opinionOrReviewIntent = detectOpinionOrReviewIntent(lastUserMsg)
    let systemPrompt: string
    if (useSlimPrompt) {
      systemPrompt = buildSlimSystemPrompt(language)
    } else {
      await loadKnowledgeCache()
      systemPrompt = buildSystemPrompt(language, cachedKnowledge, cachedYoutube, cachedTxt, cachedFaqSpecial)
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
    if (opinionOrReviewIntent) {
      context += `\n\nSTRICT FOR THIS TURN: The user asks for opinion/reviews/disadvantages. Respond ONLY with context-backed facts. No personal opinion, no speculation, no invented disadvantages. If asking about internet/reviews, do not claim live browsing; share only official channels in context and invite contact form/team for details.`
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
            if (contactIntent && !useSlimPrompt) {
              const hasPhone = /\+\d{1,3}\s?\d/.test(fullContent)
              const hasForm = fullContent.includes(CONTACT_FORM_URL)
              const needPhones = !hasPhone
              const needForm = !hasForm
              if (needPhones || needForm) {
                const contactAppend = getContactBlock(language, { includePhones: needPhones, includeForm: needForm })
                fullContent += `\n\n${contactAppend}`
                controller.enqueue(encoder.encode(JSON.stringify({ c: `\n\n${contactAppend}` }) + '\n'))
              }
            }
            const fromAi = { g: hasExamplePatientGallery(fullContent), r: hasResultsGallery(fullContent) }
            const showExamplePatientGallery = fromAi.g || galleryIntent.examplePatientGallery
            const showResultsGallery = fromAi.r || galleryIntent.resultsGallery
            const basicDone = basicProfileCollected || hasBasicProfileCollected(fullContent)
            controller.enqueue(encoder.encode(JSON.stringify({ d: true, g: showExamplePatientGallery, r: showResultsGallery, b: basicDone }) + '\n'))
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
    if (contactIntent && !useSlimPrompt) cleanMessage = ensureContactBlock(cleanMessage, language)
    const fromAi = { g: hasExamplePatientGallery(content), r: hasResultsGallery(content) }
    const showExamplePatientGallery = fromAi.g || galleryIntent.examplePatientGallery
    const showResultsGallery = fromAi.r || galleryIntent.resultsGallery
    const basicDone = basicProfileCollected || hasBasicProfileCollected(content)

    if (formData) {
      console.log('Konsültasyon form verisi (metin):', JSON.stringify(formData, null, 2))
    }

    return NextResponse.json({
      message: cleanMessage,
      ...(formData && { formData }),
      ...(suggestedNextField && { suggestedNextField }),
      ...(showExamplePatientGallery && { showExamplePatientGallery: true }),
      ...(showResultsGallery && { showResultsGallery: true }),
      ...(basicDone && { basicProfileCollected: true }),
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
