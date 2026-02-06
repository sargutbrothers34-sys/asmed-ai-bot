'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Lang, ConsultationData, ConsultationFormData } from '@/lib/consultation'
import { LANG_LABELS } from '@/lib/consultation'
import { COUNTRIES } from '@/lib/countries'

type Message = { role: 'user' | 'assistant'; content: string; showExamplePatientGallery?: boolean; showResultsGallery?: boolean }

const FORM_DATA_REGEX = /\[FORM_DATA\]([\s\S]*?)\[\/FORM_DATA\]/
const FIELD_REGEX = /\[FIELD:(\w+)\]/g

/** Galeri intent varsa AI'nın gereksiz başlık/liste metnini temizle */
function stripGalleryRedundantText(
  text: string,
  intent: { resultsGallery: boolean; examplePatientGallery: boolean }
): string {
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

function extractFormDataFromText(text: string): ConsultationFormData | null {
  const match = text.match(FORM_DATA_REGEX)
  if (!match) return null
  const raw = match[1].trim()
  for (const candidate of [raw, raw.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')]) {
    try {
      const data = JSON.parse(candidate) as ConsultationFormData
      if (data.personal && data.questionnaire) return data
    } catch {
      /* try next */
    }
  }
  return null
}

const LANG_OPTIONS: Lang[] = ['tr', 'en', 'ar', 'de', 'ru']

const SELECT_LANGUAGE_PROMPT: Record<Lang, string> = {
  tr: 'Lütfen dilinizi seçin',
  en: 'Please select your language',
  ar: 'الرجاء اختيار لغتك',
  de: 'Bitte wählen Sie Ihre Sprache',
  ru: 'Пожалуйста, выберите язык',
}

const SCROLL_STRIP_ITEMS: Record<Lang, string[]> = {
  tr: ['Dr. Koray Erdoğan', 'FUE', 'Long Hair', 'Saç Ekimi', '•', 'AI Konsültasyon', 'ASMED', 'Dr. Koray Erdoğan', 'FUE', 'Long Hair', 'Saç Ekimi'],
  en: ['Dr. Koray Erdogan', 'FUE', 'Long Hair', 'Hair Transplant', '•', 'AI Consultation', 'ASMED', 'Dr. Koray Erdogan', 'FUE', 'Long Hair', 'Hair Transplant'],
  ar: ['د. كوراي أردوغان', 'FUE', 'Long Hair', 'زراعة الشعر', '•', 'استشارة AI', 'ASMED', 'د. كوراي أردوغان', 'FUE', 'Long Hair', 'زراعة الشعر'],
  de: ['Dr. Koray Erdogan', 'FUE', 'Long Hair', 'Haartransplantation', '•', 'AI-Beratung', 'ASMED', 'Dr. Koray Erdogan', 'FUE', 'Long Hair', 'Haartransplantation'],
  ru: ['Др. Корай Эрдоган', 'FUE', 'Long Hair', 'Пересадка волос', '•', 'AI Консультация', 'ASMED', 'Др. Корай Эрдоган', 'FUE', 'Long Hair', 'Пересадка волос'],
}

const HEADER_SUBTITLE: Record<Lang, string> = {
  tr: 'Form ve Asistan AI',
  en: 'Form & Assistant AI',
  ar: 'النموذج والمساعد AI',
  de: 'Formular & Assistent AI',
  ru: 'Форма и Ассистент AI',
}

const ADVOCACY_LABEL: Record<Lang, string> = {
  tr: 'ASMED bu hasta savunucu kuruluşlarının onaylı üyesidir',
  en: 'ASMED is an accepted member of these patient advocacy agencies',
  ar: 'ASMED عضو معتمد في وكالات الدفاع عن المرضى',
  de: 'ASMED ist zugelassenes Mitglied dieser Patientenschutzorganisationen',
  ru: 'ASMED — аккредитованный член этих организаций по защите пациентов',
}

const ADVOCACY_FOOTNOTE: Record<Lang, string> = {
  tr: 'ASMED, dünya çapında üç organizasyona da kabul edilen 30\'dan az klinikten biridir.',
  en: 'ASMED is one of fewer than thirty clinics worldwide accepted to all three organizations.',
  ar: 'ASMED هي واحدة من أقل من 30 عيادة في العالم مقبولة في المنظمات الثلاث.',
  de: 'ASMED gehört zu den weniger als 30 Kliniken weltweit, die von allen drei Organisationen anerkannt sind.',
  ru: 'ASMED — одна из менее чем тридцати клиник в мире, принятых во все три организации.',
}

const ADVOCACY_LOGOS = [
  { src: '/images/IAHRS_Logo.webp', alt: 'IAHRS' },
  { src: '/images/AHLA_Logo.webp', alt: 'AHLA' },
  { src: '/images/hairtransplantmentor-logo.webp', alt: 'Hair Transplant Mentor' },
]

function AdvocacyLogos({ lang, big = false, onClose }: { lang: Lang; big?: boolean; onClose?: () => void }) {
  const logoClass = big ? 'h-16 sm:h-20 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity' : 'h-8 w-auto object-contain'
  return (
    <div className={`relative flex flex-col items-center gap-2 py-3 px-4 rounded-2xl bg-[#cceee9]/95 border border-teal-200/60 ai-card-glow ${big ? 'gap-3 py-4' : ''}`}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-teal-600 hover:bg-teal-200/60 hover:text-teal-800 transition-colors"
          aria-label="Kapat"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <p className={`font-medium tracking-wider text-teal-800 uppercase ${big ? 'text-xs' : 'text-[10px]'}`}>
        {ADVOCACY_LABEL[lang]}
      </p>
      <div className={`flex items-center justify-center ${big ? 'gap-8' : 'gap-6'}`}>
        {ADVOCACY_LOGOS.map((l, i) => (
          <img
            key={i}
            src={l.src}
            alt={l.alt}
            className={logoClass}
            title={l.alt}
          />
        ))}
      </div>
      <p className={`text-teal-800/80 text-center max-w-md leading-tight ${big ? 'text-xs' : 'text-[10px]'}`}>
        {ADVOCACY_FOOTNOTE[lang]}
      </p>
    </div>
  )
}

function ScrollingStrip({ lang }: { lang: Lang }) {
  const items = SCROLL_STRIP_ITEMS[lang]
  const content = items.join('  ')
  const repeated = [content, content, content, content]
  return (
    <div className="w-full overflow-hidden bg-black/40 border-t border-white/5">
      <div className="flex animate-scroll-left justify-start gap-8 py-2.5 text-[11px] font-medium tracking-[0.25em] text-slate-400 uppercase" style={{ width: 'max-content' }}>
        {repeated.map((c, i) => (
          <span key={i} className="whitespace-nowrap flex-shrink-0" aria-hidden={i > 0}>
            {c}
          </span>
        ))}
      </div>
    </div>
  )
}

function AppHeader({ lang, subtitle }: { lang?: Lang | null; subtitle?: string }) {
  const displaySubtitle = subtitle ?? (lang ? HEADER_SUBTITLE[lang] : HEADER_SUBTITLE.tr)
  return (
    <header className="relative w-full overflow-hidden bg-[#0a0f0e] text-white">
      {/* Digital grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(20,184,166,.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(20,184,166,.15) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      />
      {/* Gradient: teal accent top-left to dark */}
      <div className="absolute inset-0 bg-gradient-to-br from-asmed-primary/20 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f0e] via-[#0d1514] to-[#0a0f0e]" />
      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-asmed-light/60 to-transparent" />

      <div className="relative max-w-3xl mx-auto px-4 py-5">
        <div className="flex items-center gap-4">
          <img src="/images/logo.webp" alt="ASMED" className="w-20 h-20 sm:w-28 sm:h-28 object-contain flex-shrink-0" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">ASMED AI</h1>
            <p className="text-slate-400 text-sm mt-0.5 font-medium">
              {displaySubtitle}
            </p>
          </div>
        </div>
      </div>
      <ScrollingStrip lang={lang ?? 'tr'} />
    </header>
  )
}

const WELCOME: Record<Lang, string> = {
  tr: 'Merhaba, ASMED Saç Ekimi Merkezi konsültasyon asistanına hoş geldiniz. Dr. Koray Erdoğan ile değerlendirme için bilgilerinizi toplayacağız. Adınız ve soyadınız nedir?',
  en: 'Hello, welcome to the ASMED Hair Transplant Centre consultation assistant. We will collect your information for an evaluation with Dr. Koray Erdogan. What is your full name?',
  ar: 'مرحباً، أهلاً بكم في مساعد استشارات مركز ASMED لزراعة الشعر. سنجمع معلوماتكم لتقييم مع د. كوراي أردوغان. ما هو اسمكم الكامل؟',
  de: 'Guten Tag, willkommen beim ASMED-Beratungsassistenten für Haartransplantation. Wir sammeln Ihre Angaben für eine Bewertung mit Dr. Koray Erdogan. Wie lautet Ihr vollständiger Name?',
  ru: 'Здравствуйте, добро пожаловать в консультационный ассистент центра ASMED по пересадке волос. Мы соберём ваши данные для оценки доктором Кораем Эрдоганом. Как вас зовут полностью?',
}

const CHAT_TIMEOUT_MS = 90000

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  ms: number
): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

const SUCCESS_MSG: Record<Lang, string> = {
  tr: 'Uzman ekibimize başarıyla iletildi.',
  en: 'Successfully submitted to our expert team.',
  ar: 'تم إرسال معلوماتكم بنجاح إلى فريقنا المتخصص.',
  de: 'Ihre Angaben wurden erfolgreich an unser Expertenteam übermittelt.',
  ru: 'Ваши данные успешно переданы нашей экспертной команде.',
}

const CONTINUE_AFTER_SUBMIT: Record<Lang, string> = {
  tr: 'Dr. Koray Erdoğan ekibimiz en kısa sürede sizinle iletişime geçecektir. Sorularınız için aşağıdan devam edebilirsiniz.',
  en: 'Dr. Koray Erdogan\'s team will contact you as soon as possible. You may continue below to ask any further questions.',
  ar: 'سيتواصل فريق د. كوراي أردوغان معكم في أقرب وقت. يمكنكم متابعة الأسئلة أدناه.',
  de: 'Das Team von Dr. Koray Erdogan wird sich in Kürze bei Ihnen melden. Sie können unten weiterhin Fragen stellen.',
  ru: 'Команда доктора Корая Эрдогана свяжется с вами в ближайшее время. Вы можете продолжить задавать вопросы ниже.',
}

const UI_STRINGS: Record<Lang, { dateOfBirth: string; country: string; select: string; topicsTitle: string; topicsToggle: string; faqTitle: string; messagePlaceholder: string; send: string }> = {
  tr: { dateOfBirth: 'Doğum tarihi', country: 'Ülke', select: 'Seçiniz', topicsTitle: 'Konular – tıklayarak sorun', topicsToggle: 'Konular ve SSS', faqTitle: 'Sık sorulan sorular', messagePlaceholder: 'Mesajınızı yazın...', send: 'Gönder' },
  en: { dateOfBirth: 'Date of Birth', country: 'Country', select: 'Select', topicsTitle: 'Topics – click to ask', topicsToggle: 'Topics & FAQ', faqTitle: 'FAQ', messagePlaceholder: 'Type your message...', send: 'Send' },
  ar: { dateOfBirth: 'تاريخ الميلاد', country: 'البلد', select: 'اختر', topicsTitle: 'مواضيع – انقر للسؤال', topicsToggle: 'المواضيع والأسئلة', faqTitle: 'الأسئلة الشائعة', messagePlaceholder: 'اكتب رسالتك...', send: 'إرسال' },
  de: { dateOfBirth: 'Geburtsdatum', country: 'Land', select: 'Auswählen', topicsTitle: 'Themen – klicken zum Fragen', topicsToggle: 'Themen & FAQ', faqTitle: 'Häufige Fragen', messagePlaceholder: 'Nachricht eingeben...', send: 'Senden' },
  ru: { dateOfBirth: 'Дата рождения', country: 'Страна', select: 'Выберите', topicsTitle: 'Темы – нажмите, чтобы спросить', topicsToggle: 'Темы и FAQ', faqTitle: 'Частые вопросы', messagePlaceholder: 'Введите сообщение...', send: 'Отправить' },
}

function normalizeUrl(href: string): string {
  if (!href?.trim()) return ''
  const u = href.trim().replace(/[\s).,;:]+$/, '')
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

function getYouTubeVideoId(url: string): string | null {
  if (!url) return null
  const u = normalizeUrl(url)
  const short = u.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (short) return short[1]
  const watch = u.match(/(?:youtube\.com\/watch\?v=)([a-zA-Z0.9_-]+)/)
  if (watch) return watch[1]
  return null
}

function isYouTubeVideoUrl(href: string): boolean {
  return getYouTubeVideoId(href) != null
}

function isYouTubeChannelUrl(href: string): boolean {
  if (!href?.trim()) return false
  return /youtube\.com\/(user\/[a-zA-Z0-9_-]+|@[a-zA-Z0-9_-]+)/i.test(normalizeUrl(href))
}

const YOUTUBE_RAW_URL_REGEX = /(^|[\s\n])((https?:\/\/)?(www\.)?(youtu\.be\/[a-zA-Z0-9_-]+|youtube\.com\/watch\?v=[a-zA-Z0-9_-]+))([\s\n.,;:)]|$)/gm
const YOUTUBE_CHANNEL_RAW_REGEX = /(^|[\s\n])((https?:\/\/)?(www\.)?youtube\.com\/(user\/[a-zA-Z0-9_-]+|@[a-zA-Z0-9_-]+)[^\s)*,;:]*)([\s\n.,;:)]|$)/gm
function ensureYouTubeLinksAsMarkdown(text: string): string {
  let out = text.replace(YOUTUBE_RAW_URL_REGEX, (_, before, url, _protocol, _www, after) => {
    return `${before}[Videoyu izle](${normalizeUrl(url)})${after}`
  })
  out = out.replace(YOUTUBE_CHANNEL_RAW_REGEX, (_, before, url, _protocol, _www, after) => {
    return `${before}[ASMED YouTube Kanalı](${normalizeUrl(url)})${after}`
  })
  return out
}

function YouTubePreview({ url, title }: { url: string; title?: string }) {
  const videoId = getYouTubeVideoId(url)
  if (!videoId) return null
  const thumb = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  const thumbFallback = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
  const fullUrl = normalizeUrl(url)
  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-md hover:shadow-lg hover:border-asmed-primary/40 transition-all duration-200 my-3 no-underline text-slate-800 w-full max-w-sm group"
    >
      <div className="relative flex-shrink-0 w-44 min-h-[99px] aspect-video overflow-hidden bg-slate-100">
        <img src={thumb} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200" onError={(e) => { e.currentTarget.src = thumbFallback }} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
          <div className="w-14 h-14 rounded-full bg-[#FF0000] flex items-center justify-center shadow-xl ring-4 ring-white/40 group-hover:scale-105 transition-transform">
            <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white uppercase tracking-wide">YouTube</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center p-3.5">
        <span className="text-xs font-semibold text-slate-800 line-clamp-2">{title || 'Videoyu izle'}</span>
        <span className="text-xs text-asmed-primary font-medium mt-1.5 flex items-center gap-1">İzle <span className="text-[10px]">→</span></span>
      </div>
    </a>
  )
}

function YouTubeChannelPreview({ url, title }: { url: string; title?: string }) {
  const fullUrl = normalizeUrl(url)
  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-md hover:shadow-lg hover:border-asmed-primary/40 transition-all duration-200 my-3 no-underline text-slate-800 w-full max-w-sm p-4 group"
    >
      <div className="w-14 h-14 rounded-xl bg-[#FF0000] flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform">
        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">YouTube Kanalı</span>
        <span className="text-sm font-semibold text-slate-800 truncate block mt-0.5">{title || 'ASMED YouTube Kanalı'}</span>
        <span className="text-xs text-asmed-primary font-medium mt-1 flex items-center gap-1">Kanalı ziyaret et <span>→</span></span>
      </div>
    </a>
  )
}

function ExternalLinkCard({ href, children }: { href: string; children: React.ReactNode }) {
  const fullUrl = normalizeUrl(href)
  const displayText = typeof children === 'string' ? children : 'Bağlantıya git'
  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 my-2 no-underline text-slate-800 shadow-sm hover:shadow-md hover:border-asmed-primary/40 hover:bg-white transition-all duration-200 text-sm font-medium max-w-full"
    >
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-200/80 flex items-center justify-center">
        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
      </span>
      <span className="truncate flex-1 min-w-0">{displayText}</span>
      <span className="text-asmed-primary text-xs flex-shrink-0">Aç →</span>
    </a>
  )
}

const CONSULTATION_EXAMPLE_IMAGES = [
  '/images/consultation-example-1.webp',
  '/images/consultation-example-2.webp',
  '/images/consultation-example-3.webp',
  '/images/consultation-example-4.webp',
  '/images/consultation-example-5.webp',
  '/images/consultation-example-6.webp',
]

/** Örnek hasta: 1950 greft FUE, Norwood 2. Kategorilere göre gruplanmış görseller */
const EXAMPLE_PATIENT_CATEGORIES: { key: string; images: string[] }[] = [
  {
    key: 'before',
    images: ['BEFORE THE OPERATION.jpg', 'BEFORE THE OPERATION (2).jpg', 'BEFORE THE OPERATION (3).jpg', 'BEFORE THE OPERATION (4).jpg', 'BEFORE THE OPERATION (5).jpg'],
  },
  {
    key: 'operation',
    images: ['OPERATION.jpg', 'OPERATION (2).jpg', 'OPERATION (3).webp'],
  },
  {
    key: '20months',
    images: ['20 MONTHS.jpg', '20 MONTHS (2).jpg', '20 MONTHS (3).jpg', '20 MONTHS (4).jpg', '20 MONTHS (5).jpg', '20 MONTHS (6).jpg', '20 MONTHS (7).jpg', '20 MONTHS (8).jpg', '20 MONTHS (9).jpg', '20 MONTHS (10).jpg', '20 MONTHS (11).jpg', '20months.jpg', '20months (2).jpg'],
  },
  {
    key: '20monthsWet',
    images: ['20 MONTHS ıslak (2).jpg', '20 MONTHSıslak.jpg'],
  },
  {
    key: '27months',
    images: ['27 MONTHS.jpg', '27 MONTHS (2).jpg', '27 MONTHS (3).jpg'],
  },
]

const EXAMPLE_PATIENT_GALLERY_LABEL: Record<Lang, string> = {
  tr: 'Örnek hasta – 1950 greft FUE, Norwood 2',
  en: 'Example patient – 1950 grafts FUE, Norwood 2',
  ar: 'مريض نموذجي – 1950 طعم FUE، Norwood 2',
  de: 'Beispielpatient – 1950 Grafts FUE, Norwood 2',
  ru: 'Пример пациента – 1950 графтов FUE, Норвуд 2',
}

const EXAMPLE_CATEGORY_LABELS: Record<string, Record<Lang, string>> = {
  before: { tr: 'Ameliyat öncesi', en: 'Before the operation', ar: 'قبل العملية', de: 'Vor der Operation', ru: 'Перед операцией' },
  operation: { tr: 'Operasyon', en: 'Operation', ar: 'العملية', de: 'Operation', ru: 'Операция' },
  '20months': { tr: '20 ay sonrası', en: '20 months', ar: 'بعد 20 شهراً', de: '20 Monate', ru: '20 месяцев' },
  '20monthsWet': { tr: '20 ay (ıslak)', en: '20 months (wet)', ar: '20 شهراً (مبلل)', de: '20 Monate (nass)', ru: '20 месяцев (мокрый)' },
  '27months': { tr: '27 ay sonrası', en: '27 months', ar: 'بعد 27 شهراً', de: '27 Monate', ru: '27 месяцев' },
}

/** Sonuç görselleri: 13 ay, 1 yıl, 14 ay – tıklayınca büyütme */
const RESULTS_ITEMS: { path: string; labels: Record<Lang, string> }[] = [
  { path: '/images/results/results-3349-13months.webp', labels: { tr: '13 aylık süreç', en: '13 months', ar: '13 شهراً', de: '13 Monate', ru: '13 месяцев' } },
  { path: '/images/results/results-3801-1yearresult.webp', labels: { tr: '1 yıllık süreç', en: '1 year', ar: 'سنة واحدة', de: '1 Jahr', ru: '1 год' } },
  { path: '/images/results/results-7617-14monthsresult.webp', labels: { tr: '14 aylık süreç', en: '14 months', ar: '14 شهراً', de: '14 Monate', ru: '14 месяцев' } },
]

function ResultsGallery({ lang }: { lang: Lang }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  return (
    <div className="mt-3 w-full max-w-[85%]">
      <p className="text-xs font-medium text-slate-500 mb-2">
        {lang === 'tr' ? 'Örnek sonuçlar – tıklayınca büyüt' : lang === 'en' ? 'Example results – click to enlarge' : lang === 'ar' ? 'نتائج مثالية – انقر للتكبير' : lang === 'de' ? 'Beispielergebnisse – klicken zum Vergrößern' : 'Примеры результатов – нажмите для увеличения'}
      </p>
      <div className="flex flex-wrap gap-3">
        {RESULTS_ITEMS.map((item, i) => (
          <div key={i} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setLightbox(item.path)}
              className="w-28 h-28 sm:w-36 sm:h-36 rounded-lg overflow-hidden border-2 border-slate-200 hover:border-asmed-primary hover:ring-2 hover:ring-asmed-primary/30 transition-all cursor-pointer"
            >
              <img src={item.path} alt="" className="w-full h-full object-cover" />
            </button>
            <span className="text-[11px] font-medium text-slate-600 mt-1.5">{item.labels[lang] ?? item.labels.en}</span>
          </div>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30"
            aria-label="Kapat"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function ExamplePatientGallery({ lang }: { lang: Lang }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [lightbox, setLightbox] = useState<string | null>(null)
  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }))

  return (
    <div className="mt-3 w-full max-w-[85%]">
      <p className="text-xs font-medium text-slate-500 mb-2">{EXAMPLE_PATIENT_GALLERY_LABEL[lang]}</p>
      <p className="text-[11px] text-slate-400 mb-2">{lang === 'tr' ? 'Tıklayarak açın' : lang === 'en' ? 'Click to expand' : lang === 'ar' ? 'انقر للتوسيع' : lang === 'de' ? 'Klicken zum Öffnen' : 'Нажмите, чтобы развернуть'}</p>
      <div className="space-y-2">
        {EXAMPLE_PATIENT_CATEGORIES.map((cat) => {
          const isOpen = expanded[cat.key] ?? (cat.key === 'before')
          const labels = EXAMPLE_CATEGORY_LABELS[cat.key] ?? EXAMPLE_CATEGORY_LABELS.before
          return (
            <div key={cat.key} className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50/80">
              <button
                type="button"
                onClick={() => toggle(cat.key)}
                className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <span>{labels[lang] ?? labels.en}</span>
                <span className="text-slate-400 text-xs">({cat.images.length})</span>
                <svg className={`w-5 h-5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="flex gap-2 overflow-x-auto pb-2 px-2 pt-1 scroll-smooth snap-x snap-mandatory border-t border-slate-100">
                  {cat.images.map((name, i) => (
                    <div key={i} className="flex-shrink-0 w-36 h-36 snap-center rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer hover:ring-2 hover:ring-asmed-primary/50 transition-shadow">
                      <img
                        src={`/images/${encodeURIComponent(name)}`}
                        alt=""
                        className="w-full h-full object-cover"
                        onClick={() => setLightbox(`/images/${encodeURIComponent(name)}`)}
                        role="button"
                        tabIndex={0}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30" aria-label="Kapat">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

const PHOTO_STRINGS: Record<Lang, { photoTitle: string; photoInstruction: string; exampleLabel: string; dryLabel: string; wetLabel: string; submitButton: string; submittedTitle: string; submittedDesc: string }> = {
  tr: {
    photoTitle: 'Saç fotoğrafları (Dr. Erdoğan değerlendirmesi)',
    photoInstruction: 'Aşağıdaki örnekteki gibi 6 kuru + 6 ıslak (farklı açılar) yükleyin. Her kutucuğa + ile fotoğraf ekleyin.',
    exampleLabel: 'Örnek: Kafanızın bu açılardan çekilmiş kuru ve ıslak fotoğraflar',
    dryLabel: 'Kuru (6 adet)',
    wetLabel: 'Islak (6 adet)',
    submitButton: 'Uzman ekibimize gönder',
    submittedTitle: 'Saç fotoğrafları başarıyla gönderildi',
    submittedDesc: 'Fotoğraflarınız Dr. Koray Erdoğan ekibine iletildi.',
  },
  en: {
    photoTitle: 'Hair photos (Dr. Erdogan evaluation)',
    photoInstruction: 'Upload 6 dry + 6 wet (different angles) as in the example below. Add a photo to each box with +.',
    exampleLabel: 'Example: Dry and wet photos of your head from these angles',
    dryLabel: 'Dry (6)',
    wetLabel: 'Wet (6)',
    submitButton: 'Submit to expert team',
    submittedTitle: 'Hair photos successfully submitted',
    submittedDesc: 'Your photos have been sent to Dr. Koray Erdogan\'s team.',
  },
  ar: {
    photoTitle: 'صور الشعر (تقييم د. كوراي أردوغان)',
    photoInstruction: 'ارفع 6 صور جاف + 6 صور مبلل (زوايا مختلفة) كما في المثال. أضف صورة لكل مربع باستخدام +.',
    exampleLabel: 'مثال: صور جافة ومبللة لرأسك من هذه الزوايا',
    dryLabel: 'جاف (6)',
    wetLabel: 'مبلل (6)',
    submitButton: 'إرسال للفريق الخبير',
    submittedTitle: 'تم إرسال صور الشعر بنجاح',
    submittedDesc: 'تم إرسال صورك إلى فريق د. كوراي أردوغان.',
  },
  de: {
    photoTitle: 'Haarfotos (Bewertung Dr. Erdogan)',
    photoInstruction: 'Laden Sie 6 trockene + 6 nasse (verschiedene Winkel) wie im Beispiel hoch. Pro Kästchen mit + ein Foto hinzufügen.',
    exampleLabel: 'Beispiel: Trockene und nasse Fotos Ihres Kopfes aus diesen Winkeln',
    dryLabel: 'Trocken (6)',
    wetLabel: 'Nass (6)',
    submitButton: 'An Expertenteam senden',
    submittedTitle: 'Haarfotos erfolgreich übermittelt',
    submittedDesc: 'Ihre Fotos wurden an Dr. Koray Erdogan\'s Team gesendet.',
  },
  ru: {
    photoTitle: 'Фото волос (оценка д-ра Эрдогана)',
    photoInstruction: 'Загрузите 6 сухих + 6 мокрых (разные ракурсы), как в примере. В каждую ячейку добавьте фото через +.',
    exampleLabel: 'Пример: сухие и мокрые фото головы в таких ракурсах',
    dryLabel: 'Сухие (6)',
    wetLabel: 'Мокрые (6)',
    submitButton: 'Отправить команде экспертов',
    submittedTitle: 'Фото волос успешно отправлены',
    submittedDesc: 'Ваши фото отправлены команде д-ра Корая Эрдогана.',
  },
}

const FAQ_QUESTIONS: Record<Lang, string[]> = {
  tr: [
    'Saç ekimi nedir ve nasıl yapılır?',
    'FUE yöntemi nedir? ASMED\'de nasıl uygulanıyor?',
    'Konsültasyon süreci nasıl işler?',
    'İşlem süreci nasıl ilerler, adımlar nelerdir?',
    'Saç ekimi işlemi acıtıyor mu?',
    'İşlem ortalama ne kadar sürer?',
    'Long Hair FUE ile Normal FUE farkı nedir?',
    'Manuel FUE neden tercih ediliyor?',
    'Ameliyat öncesi ve sonrası nelere dikkat etmeliyim?',
    'Sonuçlar ne zaman görülür, iyileşme süreci nasıl?',
    'Greft saklama ve kalite nasıl sağlanıyor?',
    'Klinik ve tesisler hakkında bilgi alabilir miyim?',
    'KE-Rest, KE-Bot, K.E.E.P. nedir?',
    'Coverage Value ve Graft Calculator nedir?',
    'YouTube\'da hasta röportajları ve önce-sonra videoları var mı?',
    '1950 greft FUE örnek hasta süreci – önce/sonra görselleri gösterir misiniz?',
    'Sonuç galerisi – 13 ay, 1 yıl, 14 ay örnekleri',
  ],
  en: [
    'What is hair transplant and how is it performed?',
    'What is the FUE method and how is it applied at ASMED?',
    'How does the consultation process work?',
    'How does the procedure progress, what are the steps?',
    'Does the hair transplant procedure hurt?',
    'How long does the procedure take on average?',
    'What is the difference between Long Hair FUE and Normal FUE?',
    'Why is manual FUE preferred?',
    'What should I pay attention to before and after surgery?',
    'When will I see results and what is the recovery process?',
    'How is graft storage and quality ensured?',
    'Can I see information about the clinic and facilities?',
    'What are KE-Rest, KE-Bot and K.E.E.P.?',
    'What are Coverage Value and Graft Calculator?',
    'Are there patient interviews and before/after videos on YouTube?',
    'Can you show 1950 graft FUE example patient process – before/after images?',
    'Results gallery – 13 months, 1 year, 14 months examples',
  ],
  ar: [
    'ما هي زراعة الشعر وكيف تتم؟',
    'ما هو أسلوب FUE وكيف يُطبق في ASMED؟',
    'كيف تعمل عملية الاستشارة؟',
    'كيف تتقدم العملية وما هي الخطوات؟',
    'هل عملية زراعة الشعر مؤلمة؟',
    'كم تستغرق العملية في المتوسط؟',
    'ما الفرق بين Long Hair FUE وFUE العادي؟',
    'لماذا يُفضل Manuel FUE؟',
    'ما الذي يجب أن أنتبه له قبل وبعد الجراحة؟',
    'متى ستظهر النتائج وكيف تتم عملية الشفاء؟',
    'كيف يُضمن حفظ الطعوم وجودتها؟',
    'هل يمكنني الحصول على معلومات عن العيادة والمرافق؟',
    'ما هي KE-Rest وKE-Bot وK.E.E.P؟',
    'ما هما Coverage Value وGraft Calculator؟',
    'هل توجد مقابلات مع مرضى وفيديوهات قبل وبعد على YouTube؟',
    'هل يمكنك إظهار عملية المريض النموذجي 1950 طعم FUE – صور قبل وبعد؟',
    'معرض النتائج – أمثلة 13 شهراً، سنة، 14 شهراً',
  ],
  de: [
    'Was ist eine Haartransplantation und wie wird sie durchgeführt?',
    'Was ist die FUE-Methode und wie wird sie bei ASMED angewendet?',
    'Wie funktioniert der Beratungsprozess?',
    'Wie verläuft die Behandlung, welche Schritte gibt es?',
    'Tut die Haartransplantation weh?',
    'Wie lange dauert die Behandlung durchschnittlich?',
    'Was ist der Unterschied zwischen Long Hair FUE und Normaler FUE?',
    'Warum wird manuelle FUE bevorzugt?',
    'Worauf muss ich vor und nach der Operation achten?',
    'Wann sind Ergebnisse sichtbar, wie verläuft die Heilung?',
    'Wie wird die Graft-Lagerung und -Qualität sichergestellt?',
    'Kann ich Informationen über Klinik und Einrichtungen erhalten?',
    'Was sind KE-Rest, KE-Bot und K.E.E.P.?',
    'Was sind Coverage Value und Graft Calculator?',
    'Gibt es Patientengespräche und Vorher-Nachher-Videos auf YouTube?',
    'Können Sie den 1950-Grafts-FUE-Beispielpatienten – Vorher/Nachher-Bilder zeigen?',
    'Ergebnissgalerie – 13 Monate, 1 Jahr, 14 Monate',
  ],
  ru: [
    'Что такое пересадка волос и как она выполняется?',
    'Что такое метод FUE и как он применяется в ASMED?',
    'Как проходит консультационный процесс?',
    'Как проходит процедура, какие этапы?',
    'Болезненна ли процедура пересадки волос?',
    'Сколько в среднем длится процедура?',
    'В чём разница между Long Hair FUE и обычной FUE?',
    'Почему предпочитают мануальную FUE?',
    'На что обращать внимание до и после операции?',
    'Когда видны результаты и как проходит восстановление?',
    'Как обеспечивается хранение и качество графтов?',
    'Могу ли я получить информацию о клинике и удобствах?',
    'Что такое KE-Rest, KE-Bot и K.E.E.P.?',
    'Что такое Coverage Value и Graft Calculator?',
    'Есть ли интервью с пациентами и видео до/после на YouTube?',
    'Покажите пример пациента 1950 графтов FUE – до/после?',
    'Галерея результатов – 13 мес., 1 год, 14 мес.',
  ],
}

const SUGGESTION_TOPICS: Record<Lang, { label: string; question: string }[]> = {
  tr: [
    { label: 'Hakkımızda', question: 'ASMED ve Dr. Koray Erdoğan hakkında bilgi verir misiniz?' },
    { label: 'Saç ekimi nedir?', question: 'Saç ekimi nedir ve süreç nasıl ilerler?' },
    { label: 'FUE nedir?', question: 'FUE yöntemi nedir? ASMED\'de nasıl uygulanıyor?' },
    { label: 'Konsültasyon', question: 'Konsültasyon süreci nasıl işler, ilk adım ne?' },
    { label: 'İşlem süreci', question: 'Saç ekimi işlemi adım adım nasıl ilerliyor?' },
    { label: 'Tarihçe', question: 'Saç ekimi ve FUE tarihçesi hakkında bilgi var mı?' },
    { label: 'Klinik', question: 'Klinik ve tesisler hakkında bilgi ve görseller paylaşır mısınız?' },
    { label: 'Sonuçlar', question: 'Önce-sonra sonuç örnekleri ve ilgili videoları paylaşır mısınız?' },
    { label: 'Long Hair FUE', question: 'Long Hair FUE ile Normal FUE farkı ve avantajları nelerdir?' },
    { label: 'Manuel FUE', question: 'Manuel FUE neden tercih ediliyor, avantajları neler?' },
    { label: 'Ameliyat öncesi/sonrası', question: 'Ameliyat öncesi ve sonrası nelere dikkat etmeliyim?' },
    { label: 'İyileşme süreci', question: 'Sonuçlar ne zaman görülür, iyileşme süreci nasıl ilerler?' },
    { label: 'KE-Rest / KE-Bot / K.E.E.P.', question: 'KE-Rest, KE-Bot ve K.E.E.P. nedir, ne işe yarar?' },
    { label: 'YouTube', question: 'ASMED YouTube kanalında hasta röportajları ve videolar var mı?' },
    { label: 'Örnek süreç görselleri', question: '1950 greft FUE örnek hasta sürecini (öncesi, operasyon, 20 ay, 27 ay) gösterebilir misiniz?' },
    { label: 'Sonuç galerisi', question: 'Sonuç galerisini aç – 13 ay, 1 yıl, 14 ay örnekleri gösterebilir misiniz?' },
    { label: 'Sık sorulan sorular', question: 'Sık sorulan sorulardan birkaçını yanıtlar mısınız?' },
  ],
  en: [
    { label: 'About us', question: 'Tell me about ASMED and Dr. Koray Erdogan.' },
    { label: 'What is hair transplant?', question: 'What is hair transplant and how does the process work?' },
    { label: 'What is FUE?', question: 'What is the FUE method and how is it applied at ASMED?' },
    { label: 'Consultation', question: 'How does the consultation process work, what is the first step?' },
    { label: 'Procedure steps', question: 'How does the hair transplant procedure progress step by step?' },
    { label: 'History', question: 'Is there information about the history of hair transplant and FUE?' },
    { label: 'Clinic', question: 'Share information and images about the clinic and facilities?' },
    { label: 'Results', question: 'Share before-after result examples and related videos?' },
    { label: 'Long Hair FUE', question: 'What is the difference and advantages of Long Hair FUE vs Normal FUE?' },
    { label: 'Manual FUE', question: 'Why is manual FUE preferred and what are its advantages?' },
    { label: 'Before/after surgery', question: 'What should I pay attention to before and after surgery?' },
    { label: 'Recovery', question: 'When will I see results and how does the recovery process work?' },
    { label: 'KE-Rest / KE-Bot / K.E.E.P.', question: 'What are KE-Rest, KE-Bot and K.E.E.P. and what do they do?' },
    { label: 'YouTube', question: 'Are there patient interviews and videos on ASMED YouTube channel?' },
    { label: 'Example process images', question: 'Can you show the 1950 graft FUE example patient process (before, operation, 20 months, 27 months)?' },
    { label: 'Results gallery', question: 'Can you open the results gallery – 13 months, 1 year, 14 months examples?' },
    { label: 'FAQ', question: 'Answer a few frequently asked questions?' },
  ],
  ar: [
    { label: 'من نحن', question: 'أخبرني عن ASMED ود. كوراي أردوغان.' },
    { label: 'ما هي زراعة الشعر؟', question: 'ما هي زراعة الشعر وكيف يعمل الإجراء؟' },
    { label: 'ما هو FUE؟', question: 'ما هو أسلوب FUE وكيف يُطبق في ASMED؟' },
    { label: 'الاستشارة', question: 'كيف تعمل عملية الاستشارة وما هي الخطوة الأولى؟' },
    { label: 'خطوات الإجراء', question: 'كيف تتقدم عملية زراعة الشعر خطوة بخطوة؟' },
    { label: 'التاريخ', question: 'هل توجد معلومات عن تاريخ زراعة الشعر وFUE؟' },
    { label: 'العيادة', question: 'شاركني معلومات وصور عن العيادة والمرافق؟' },
    { label: 'النتائج', question: 'شاركني أمثلة قبل وبعد والفيديوهات ذات الصلة؟' },
    { label: 'Long Hair FUE', question: 'ما الفرق ومزايا Long Hair FUE مقابل FUE العادي؟' },
    { label: 'Manuel FUE', question: 'لماذا يُفضل Manuel FUE وما مزاياه؟' },
    { label: 'قبل/بعد الجراحة', question: 'ما الذي يجب أن أنتبه له قبل وبعد الجراحة؟' },
    { label: 'الشفاء', question: 'متى ستظهر النتائج وكيف تتم عملية الشفاء؟' },
    { label: 'KE-Rest / KE-Bot / K.E.E.P.', question: 'ما هي KE-Rest وKE-Bot وK.E.E.P وما وظائفها؟' },
    { label: 'YouTube', question: 'هل توجد مقابلات مع مرضى وفيديوهات على قناة ASMED في YouTube؟' },
    { label: 'صور عملية مثالية', question: 'هل يمكنك إظهار عملية المريض النموذجي 1950 طعم FUE (قبل، العملية، 20 شهراً، 27 شهراً)؟' },
    { label: 'معرض النتائج', question: 'هل يمكنك فتح معرض النتائج – أمثلة 13 شهراً، سنة، 14 شهراً؟' },
    { label: 'الأسئلة الشائعة', question: 'أجب عن بعض الأسئلة الشائعة؟' },
  ],
  de: [
    { label: 'Über uns', question: 'Erzählen Sie mir über ASMED und Dr. Koray Erdogan.' },
    { label: 'Was ist Haartransplantation?', question: 'Was ist eine Haartransplantation und wie funktioniert der Ablauf?' },
    { label: 'Was ist FUE?', question: 'Was ist die FUE-Methode und wie wird sie bei ASMED angewendet?' },
    { label: 'Beratung', question: 'Wie funktioniert der Beratungsprozess, was ist der erste Schritt?' },
    { label: 'Behandlungsablauf', question: 'Wie verläuft die Haartransplantation Schritt für Schritt?' },
    { label: 'Geschichte', question: 'Gibt es Informationen zur Geschichte von Haartransplantation und FUE?' },
    { label: 'Klinik', question: 'Teilen Sie Informationen und Bilder über Klinik und Einrichtungen?' },
    { label: 'Ergebnisse', question: 'Teilen Sie Vorher-Nachher-Beispiele und verwandte Videos?' },
    { label: 'Long Hair FUE', question: 'Was ist der Unterschied und die Vorteile von Long Hair FUE vs. Normaler FUE?' },
    { label: 'Manuelle FUE', question: 'Warum wird manuelle FUE bevorzugt und was sind ihre Vorteile?' },
    { label: 'Vor/Nach der Operation', question: 'Worauf muss ich vor und nach der Operation achten?' },
    { label: 'Heilung', question: 'Wann sind Ergebnisse sichtbar und wie verläuft die Heilung?' },
    { label: 'KE-Rest / KE-Bot / K.E.E.P.', question: 'Was sind KE-Rest, KE-Bot und K.E.E.P. und wofür stehen sie?' },
    { label: 'YouTube', question: 'Gibt es Patientengespräche und Videos auf dem ASMED-YouTube-Kanal?' },
    { label: 'Beispielablauf-Bilder', question: 'Können Sie den 1950-Grafts-FUE-Beispielpatienten (Vorher, Operation, 20 Monate, 27 Monate) zeigen?' },
    { label: 'Ergebnissgalerie', question: 'Können Sie die Ergebnissgalerie öffnen – 13 Monate, 1 Jahr, 14 Monate?' },
    { label: 'FAQ', question: 'Beantworten Sie einige häufig gestellte Fragen?' },
  ],
  ru: [
    { label: 'О нас', question: 'Расскажите об ASMED и докторе Корае Эрдогане.' },
    { label: 'Что такое пересадка волос?', question: 'Что такое пересадка волос и как проходит процесс?' },
    { label: 'Что такое FUE?', question: 'Что такое метод FUE и как его применяют в ASMED?' },
    { label: 'Консультация', question: 'Как проходит консультационный процесс, какой первый шаг?' },
    { label: 'Этапы процедуры', question: 'Как проходит процедура пересадки волос пошагово?' },
    { label: 'История', question: 'Есть ли информация об истории пересадки волос и FUE?' },
    { label: 'Клиника', question: 'Расскажите о клинике и удобствах, поделитесь изображениями?' },
    { label: 'Результаты', question: 'Покажите примеры до и после и связанные видео?' },
    { label: 'Long Hair FUE', question: 'В чём разница и преимущества Long Hair FUE по сравнению с обычной FUE?' },
    { label: 'Мануальная FUE', question: 'Почему предпочитают мануальную FUE и каковы её преимущества?' },
    { label: 'До/после операции', question: 'На что обращать внимание до и после операции?' },
    { label: 'Восстановление', question: 'Когда видны результаты и как проходит восстановление?' },
    { label: 'KE-Rest / KE-Bot / K.E.E.P.', question: 'Что такое KE-Rest, KE-Bot и K.E.E.P. и для чего они?' },
    { label: 'YouTube', question: 'Есть ли интервью с пациентами и видео на канале ASMED в YouTube?' },
    { label: 'Пример процесса', question: 'Покажите пример пациента 1950 графтов FUE (до, операция, 20 месяцев, 27 месяцев)?' },
    { label: 'Галерея результатов', question: 'Откройте галерею результатов – 13 мес., 1 год, 14 мес.?' },
    { label: 'Частые вопросы', question: 'Ответьте на несколько часто задаваемых вопросов?' },
  ],
}

export default function Home() {
  const [language, setLanguage] = useState<Lang | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [collectedData, setCollectedData] = useState<Partial<ConsultationFormData>>({})
  const [formData, setFormData] = useState<ConsultationFormData | null>(null)
  const [suggestedNextField, setSuggestedNextField] = useState<string | null>(null)
  const [photosDry, setPhotosDry] = useState<string[]>(Array(6).fill(''))
  const [photosWet, setPhotosWet] = useState<string[]>(Array(6).fill(''))
  const [submitted, setSubmitted] = useState(false)
  const [topicsExpanded, setTopicsExpanded] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [streamingGallery, setStreamingGallery] = useState(false)
  const [advocacyDismissed, setAdvocacyDismissed] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      }
    })
  }, [])

  useEffect(() => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      scrollToBottom(!streamingContent)
      scrollTimeoutRef.current = null
    }, streamingContent ? 100 : 50)
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [messages, streamingContent, scrollToBottom])

  function startChat(lang: Lang) {
    setLanguage(lang)
    setMessages([{ role: 'assistant', content: WELCOME[lang] }])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading || !language) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)
    setSuggestedNextField(null)

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const lastAskedForPhotos =
      lastAssistant?.content &&
      /6.*(Kuru|Dry|Islak|Wet|kuru|ıslak)/i.test(lastAssistant.content) &&
      /yükleyebilirsiniz|yükleyin|upload|fotoğraf/i.test(lastAssistant.content)

    const useStream = submitted || !!formData
    const payload = {
      language,
      messages: [...messages, { role: 'user', content: text }].map((m) => ({ role: m.role, content: m.content })),
      collectedData: Object.keys(collectedData).length > 0 ? collectedData : undefined,
      photoUploadRequested: !formData && !!lastAskedForPhotos,
      consultationComplete: submitted,
      formDataPresent: !!formData,
      stream: useStream,
    }

    try {
      if (useStream) {
        setStreamingContent('')
        setStreamingGallery(false)
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setMessages((prev) => [...prev, { role: 'assistant', content: data.message || 'Bir hata oluştu.' }])
          return
        }
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let fullContent = ''
        let showGallery = false
        let showResGallery = false
        if (reader) {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const obj = JSON.parse(line)
                if (obj.c != null) {
                  fullContent += obj.c
                  setStreamingContent(fullContent)
                }
                if (obj.d) {
                  showGallery = !!obj.g
                  showResGallery = !!obj.r
                  break
                }
                if (obj.e) throw new Error(obj.e)
              } catch (e) {
                if (e instanceof SyntaxError) continue
                throw e
              }
            }
          }
        }
        const fd = extractFormDataFromText(fullContent)
        if (fd) setFormData(fd)
        const suggested = fullContent.match(/\[FIELD:(\w+)\]/)?.[1]
        if (suggested) setSuggestedNextField(suggested)
        let clean = fullContent.replace(/\[FORM_DATA\][\s\S]*?\[\/FORM_DATA\]/g, '').replace(/\[FIELD:\w+\]/g, '').replace(/\[EXAMPLE_PATIENT_GALLERY\]/g, '').replace(/\[RESULTS_GALLERY\]/g, '').trim()
        clean = stripGalleryRedundantText(clean, { resultsGallery: showResGallery, examplePatientGallery: showGallery })
        setMessages((prev) => [...prev, { role: 'assistant', content: clean, showExamplePatientGallery: showGallery, showResultsGallery: showResGallery }])
        setStreamingContent(null)
        setStreamingGallery(false)
        setTimeout(() => scrollToBottom(), 50)
      } else {
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }, CHAT_TIMEOUT_MS)
        const data = await res.json()
        if (!res.ok) {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.message || 'Bir hata oluştu.' }])
          return
        }
        setMessages((prev) => [...prev, { role: 'assistant', content: data.message, showExamplePatientGallery: !!data.showExamplePatientGallery, showResultsGallery: !!data.showResultsGallery }])
        if (data.formData) setFormData(data.formData)
        if (data.suggestedNextField) setSuggestedNextField(data.suggestedNextField)
      }
    } catch (err) {
      setStreamingContent(null)
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: isTimeout
            ? 'Yanıt gecikti. Lütfen kısa bir mesajla tekrar deneyin.'
            : 'Bağlantı hatası. Lütfen tekrar deneyin.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage(content: string, dataOverride?: Partial<ConsultationFormData>) {
    if (!language || loading) return
    const dataToSend = dataOverride ?? collectedData
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content }])
    setLoading(true)
    setSuggestedNextField(null)
    const useStream = submitted || !!formData
    const payload = {
      language,
      messages: [...messages, { role: 'user', content }].map((m) => ({ role: m.role, content: m.content })),
      collectedData: Object.keys(dataToSend).length > 0 ? dataToSend : undefined,
      consultationComplete: submitted,
      formDataPresent: !!formData,
      stream: useStream,
    }
    try {
      if (useStream) {
        setStreamingContent('')
        setStreamingGallery(false)
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setMessages((prev) => [...prev, { role: 'assistant', content: data.message || 'Bir hata oluştu.' }])
          return
        }
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let fullContent = ''
        let showGallery = false
        let showResGallery = false
        if (reader) {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const obj = JSON.parse(line)
                if (obj.c != null) {
                  fullContent += obj.c
                  setStreamingContent(fullContent)
                }
                if (obj.d) {
                  showGallery = !!obj.g
                  showResGallery = !!obj.r
                  break
                }
                if (obj.e) throw new Error(obj.e)
              } catch (e) {
                if (e instanceof SyntaxError) continue
                throw e
              }
            }
          }
        }
        let clean = fullContent.replace(/\[FORM_DATA\][\s\S]*?\[\/FORM_DATA\]/g, '').replace(/\[FIELD:\w+\]/g, '').replace(/\[EXAMPLE_PATIENT_GALLERY\]/g, '').replace(/\[RESULTS_GALLERY\]/g, '').trim()
        clean = stripGalleryRedundantText(clean, { resultsGallery: showResGallery, examplePatientGallery: showGallery })
        setMessages((prev) => [...prev, { role: 'assistant', content: clean, showExamplePatientGallery: showGallery, showResultsGallery: showResGallery }])
        setStreamingContent(null)
        setTimeout(() => scrollToBottom(), 50)
      } else {
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }, CHAT_TIMEOUT_MS)
        const data = await res.json()
        if (!res.ok) {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.message || 'Bir hata oluştu.' }])
          return
        }
        setMessages((prev) => [...prev, { role: 'assistant', content: data.message, showExamplePatientGallery: !!data.showExamplePatientGallery, showResultsGallery: !!data.showResultsGallery }])
        if (data.formData) setFormData(data.formData)
        if (data.suggestedNextField) setSuggestedNextField(data.suggestedNextField)
      }
    } catch (err) {
      setStreamingContent(null)
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: isTimeout
            ? 'Yanıt gecikti. Lütfen kısa bir mesajla tekrar deneyin.'
            : 'Bağlantı hatası. Lütfen tekrar deneyin.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleFieldSubmit(field: string, value: string) {
    const next: Partial<ConsultationFormData> = {
      ...collectedData,
      personal: {
        ...(collectedData.personal || {}),
        [field]: value,
      } as ConsultationFormData['personal'],
    }
    setCollectedData(next)
    sendMessage(value, next)
  }

  function handlePhotoChange(type: 'dry' | 'wet', index: number, base64: string) {
    if (type === 'dry') {
      setPhotosDry((prev) => {
        const next = [...prev]
        next[index] = base64
        return next
      })
    } else {
      setPhotosWet((prev) => {
        const next = [...prev]
        next[index] = base64
        return next
      })
    }
  }

  function handleFinalSubmit() {
    if (!formData || !language) return
    const full: ConsultationData = {
      language: formData.language,
      personal: formData.personal,
      questionnaire: formData.questionnaire as ConsultationData['questionnaire'],
      photosDry: photosDry.filter(Boolean),
      photosWet: photosWet.filter(Boolean),
    }
    console.log('Konsültasyon verisi (tamamı):', JSON.stringify(full, null, 2))
    const ps = PHOTO_STRINGS[language] ?? PHOTO_STRINGS.en
    const successText = `${ps.submittedTitle}\n\n${ps.submittedDesc}`
    setMessages((prev) => [...prev, { role: 'assistant', content: successText }])
    setSubmitted(true)
  }

  if (!language) {
    return (
      <div className="min-h-screen flex flex-col ai-bg">
        <AppHeader lang={null} />
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 flex flex-col items-center justify-center">
          <div className="w-full max-w-md rounded-2xl bg-white/90 backdrop-blur-sm border border-slate-200/80 shadow-xl shadow-slate-900/5 px-6 py-8">
            <p className="text-slate-700 mb-4 text-center font-semibold text-base">
              {SELECT_LANGUAGE_PROMPT.tr}
            </p>
            <p className="text-slate-500 mb-2 text-center text-sm">{SELECT_LANGUAGE_PROMPT.en}</p>
            <p className="text-slate-500 mb-2 text-center text-sm" dir="rtl">{SELECT_LANGUAGE_PROMPT.ar}</p>
            <p className="text-slate-500 mb-4 text-center text-sm">{SELECT_LANGUAGE_PROMPT.de}</p>
            <p className="text-slate-500 mb-6 text-center text-sm">{SELECT_LANGUAGE_PROMPT.ru}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {LANG_OPTIONS.map((lang, i) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => startChat(lang)}
                  className="rounded-xl bg-white border-2 border-asmed-primary px-6 py-3 text-asmed-primary font-semibold hover:bg-asmed-primary hover:text-white hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-md hover:shadow-lg"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col ai-bg">
      <AppHeader lang={language} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 flex flex-col">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-anchor-none space-y-4 pb-4" style={{ overflowAnchor: 'none' }}>
          {submitted && (
            <>
              <div className="flex justify-center">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 max-w-md w-full animate-fade-in-up ai-card-glow">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-800">{SUCCESS_MSG[language]}</h3>
                      <p className="text-sm text-green-700">
                        {(CONTINUE_AFTER_SUBMIT[language] ?? CONTINUE_AFTER_SUBMIT.en)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
              style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ai-card-glow ${
                  msg.role === 'user'
                    ? 'bg-asmed-primary text-white rounded-br-md shadow-md'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <>
                    <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-a:text-asmed-primary prose-img:rounded-lg prose-img:max-h-48">
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => {
                            if (!href) return null
                            const safeHref = normalizeUrl(href)
                            if (isYouTubeVideoUrl(safeHref))
                              return <YouTubePreview url={safeHref} title={typeof children === 'string' ? children : undefined} />
                            if (isYouTubeChannelUrl(safeHref))
                              return <YouTubeChannelPreview url={safeHref} title={typeof children === 'string' ? children : undefined} />
                            return <ExternalLinkCard href={safeHref}>{children}</ExternalLinkCard>
                          },
                          img: ({ src, alt }) => {
                            if (!src) return null
                            const normalizedSrc = src.startsWith('/') || src.startsWith('http') ? src : `/${src}`
                            return (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={normalizedSrc}
                                alt={alt ?? 'Görsel'}
                                className="rounded-lg max-h-48 w-auto my-2 object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            )
                          },
                        }}
                      >
                        {ensureYouTubeLinksAsMarkdown(msg.content)}
                      </ReactMarkdown>
                    </div>
                    {msg.showExamplePatientGallery && language && (
                      <ExamplePatientGallery lang={language} />
                    )}
                    {msg.showResultsGallery && language && (
                      <ResultsGallery lang={language} />
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {formData && !advocacyDismissed && (
            <div className="flex justify-center">
              <AdvocacyLogos lang={language} big onClose={() => setAdvocacyDismissed(true)} />
            </div>
          )}

          {suggestedNextField === 'dateOfBirth' && (
            <div className="flex justify-start animate-fade-in-up">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md p-4 shadow-sm max-w-xs w-full sm:max-w-xs ai-card-glow">
                <label className="block text-xs font-medium text-slate-500 mb-2">
                  {(UI_STRINGS[language] ?? UI_STRINGS.en).dateOfBirth}
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-asmed-primary"
                  onChange={(e) => {
                    handleFieldSubmit('dateOfBirth', e.target.value)
                  }}
                />
              </div>
            </div>
          )}

          {suggestedNextField === 'country' && (
            <div className="flex justify-start animate-fade-in-up">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md p-4 shadow-sm w-full max-w-xs ai-card-glow">
                <label className="block text-xs font-medium text-slate-500 mb-2">
                  {(UI_STRINGS[language] ?? UI_STRINGS.en).country}
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-asmed-primary"
                  onChange={(e) => {
                    const v = e.target.value
                    if (v) handleFieldSubmit('country', v)
                  }}
                >
                  <option value="">{(UI_STRINGS[language] ?? UI_STRINGS.en).select}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {formData && (
            <>
              {!submitted && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4 ai-card-glow">
                <h3 className="text-base font-semibold text-slate-800">
                  {(PHOTO_STRINGS[language] ?? PHOTO_STRINGS.en).photoTitle}
                </h3>
                <p className="text-xs text-slate-600">
                  {(PHOTO_STRINGS[language] ?? PHOTO_STRINGS.en).photoInstruction}
                </p>
                <p className="text-[11px] font-medium text-slate-500 mt-1">
                  {(PHOTO_STRINGS[language] ?? PHOTO_STRINGS.en).exampleLabel}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {CONSULTATION_EXAMPLE_IMAGES.map((src, i) => (
                    <img key={i} src={src} alt="" className="w-20 h-20 rounded-lg border border-slate-200 object-cover flex-shrink-0" />
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Sol: Kuru (6) */}
                  <div>
                    <p className="text-xs font-semibold text-asmed-primary mb-2">{(PHOTO_STRINGS[language] ?? PHOTO_STRINGS.en).dryLabel}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={`dry-${i}`} className="relative aspect-square">
                          <input
                            id={`photo-dry-${i}`}
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              const r = new FileReader()
                              r.onload = () => handlePhotoChange('dry', i, r.result as string)
                              r.readAsDataURL(f)
                            }}
                          />
                          <div className="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg bg-slate-50/80 pointer-events-none">
                            {photosDry[i] ? (
                              <img src={photosDry[i]} alt="" className="w-full h-full object-cover rounded-lg pointer-events-none" />
                            ) : (
                              <>
                                <span className="text-2xl font-light text-slate-400 leading-none">+</span>
                                <span className="text-[10px] text-slate-500 mt-1">{i + 1}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Sağ: Islak (6) */}
                  <div>
                    <p className="text-xs font-semibold text-asmed-primary mb-2">{(PHOTO_STRINGS[language] ?? PHOTO_STRINGS.en).wetLabel}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={`wet-${i}`} className="relative aspect-square">
                          <input
                            id={`photo-wet-${i}`}
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              const r = new FileReader()
                              r.onload = () => handlePhotoChange('wet', i, r.result as string)
                              r.readAsDataURL(f)
                            }}
                          />
                          <div className="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg bg-slate-50/80 pointer-events-none">
                            {photosWet[i] ? (
                              <img src={photosWet[i]} alt="" className="w-full h-full object-cover rounded-lg pointer-events-none" />
                            ) : (
                              <>
                                <span className="text-2xl font-light text-slate-400 leading-none">+</span>
                                <span className="text-[10px] text-slate-500 mt-1">{i + 1}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  className="w-full rounded-xl bg-asmed-primary py-3 text-white font-medium hover:bg-asmed-dark transition-colors"
                >
                  {(PHOTO_STRINGS[language] ?? PHOTO_STRINGS.en).submitButton}
                </button>
              </div>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm ai-card-glow mt-4">
                <button
                  type="button"
                  onClick={() => setTopicsExpanded((p) => !p)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50/80 transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-800">
                    {(UI_STRINGS[language] ?? UI_STRINGS.en).topicsToggle}
                  </span>
                  <svg className={`w-5 h-5 text-slate-500 transition-transform ${topicsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {topicsExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
                    <h4 className="text-xs font-semibold text-slate-600 pt-2">
                      {(UI_STRINGS[language] ?? UI_STRINGS.en).topicsTitle}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(SUGGESTION_TOPICS[language] ?? SUGGESTION_TOPICS.en).map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => sendMessage(item.question)}
                          disabled={loading}
                          className="rounded-full px-3 py-1.5 text-xs font-semibold bg-asmed-primary/10 text-asmed-primary border border-asmed-primary/30 hover:bg-asmed-primary hover:text-white transition-all duration-200 disabled:opacity-50 cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <h4 className="text-xs font-semibold text-slate-600 pt-1">
                      {(UI_STRINGS[language] ?? UI_STRINGS.en).faqTitle}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(FAQ_QUESTIONS[language] ?? FAQ_QUESTIONS.en).map((q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => sendMessage(q)}
                          disabled={loading}
                          className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-slate-100 text-slate-700 hover:bg-asmed-primary hover:text-white transition-all duration-200 disabled:opacity-50 cursor-pointer"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {streamingContent != null && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 ai-card-glow bg-white text-slate-800 border border-slate-200">
                <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-a:text-asmed-primary prose-img:rounded-lg prose-img:max-h-48">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => {
                        if (!href) return null
                        const safeHref = normalizeUrl(href)
                        if (isYouTubeVideoUrl(safeHref))
                          return <YouTubePreview url={safeHref} title={typeof children === 'string' ? children : undefined} />
                        if (isYouTubeChannelUrl(safeHref))
                          return <YouTubeChannelPreview url={safeHref} title={typeof children === 'string' ? children : undefined} />
                        return <ExternalLinkCard href={safeHref}>{children}</ExternalLinkCard>
                      },
                      img: ({ src, alt }) =>
                        src ? <img src={src} alt={alt ?? ''} className="rounded-lg max-h-48 w-auto my-2" /> : null,
                    }}
                  >
                    {ensureYouTubeLinksAsMarkdown(streamingContent)}
                  </ReactMarkdown>
                </div>
                <span className="inline-block w-0.5 h-4 ml-1 bg-asmed-primary animate-pulse align-middle" aria-hidden />
              </div>
            </div>
          )}
          {loading && !streamingContent && (
            <div className="flex justify-start animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm ai-card-glow">
                <span className="inline-flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-asmed-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-asmed-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-asmed-primary animate-bounce" />
                </span>
              </div>
            </div>
          )}
          <div />

        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 pt-2 border-t border-slate-200 bg-white/60 rounded-xl p-2 ai-card-glow">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={(UI_STRINGS[language] ?? UI_STRINGS.en).messagePlaceholder}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-asmed-primary focus:border-transparent font-medium"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-asmed-primary px-5 py-3 text-white font-semibold hover:bg-asmed-dark hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-asmed-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {(UI_STRINGS[language] ?? UI_STRINGS.en).send}
          </button>
        </form>
      </main>
    </div>
  )
}
