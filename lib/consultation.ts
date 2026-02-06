export type Lang = 'tr' | 'en' | 'ar' | 'de' | 'ru'

export interface ConsultationPersonal {
  name: string
  phone: string
  email: string
  dateOfBirth: string
  country: string
  city: string
  profession: string
}

export interface ConsultationQuestionnaire {
  q1: string // Which part/parts of hair to improve, expected result
  q2: string // FUE type: Normal FUE vs Long Hair FUE
  q3: string // Medication for hair loss (Finasteride, etc.)
  q4: string // Previous hair transplant (date, type, doctor, grafts)
  q5: string // Any past surgery
  q6: string // Health issues (arrhythmia, diabetes, etc.)
  q7: string // Medication for chronic issues
  q8: string // Allergy to local anesthesia or medication
  q9: string // Side effects from past medication
  q10: string // Skin pathologies
  q11: string // Family baldness level, maternal/paternal
  q12: string // How introduced to ASMED (Google, forum, recommendation, etc.)
  q13: string // Origin/Nationality
}

export interface ConsultationFormData {
  language: Lang
  personal: ConsultationPersonal
  questionnaire: ConsultationQuestionnaire
}

export interface ConsultationData {
  language: Lang
  personal: ConsultationPersonal
  questionnaire: ConsultationQuestionnaire
  photosDry: string[] // base64 or filenames
  photosWet: string[]
}

export const QUESTION_KEYS = [
  'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13',
] as const

const questionnaireTexts: Record<Lang, Record<string, string>> = {
  tr: {
    q1: 'Saçınızın hangi bölgesini/bölgelerini FUE saç ekimi ile iyileştirmek istiyorsunuz? Ne tür bir sonuç bekliyorsunuz?',
    q2: 'Hangi FUE yöntemi ilginizi çekiyor? Normal FUE (donör ve alıcı bölge tıraş edilir) / Long Hair FUE (saçlar tıraş edilmeden)',
    q3: 'Şu an saç dökülmesini önlemek için ilaç kullanıyor musunuz? Kullanmıyorsanız, doktorun önereceği ilaca başlamaya istekli misiniz? (Finasteride, Dutasteride, Minoksidil vb.)',
    q4: 'Daha önce saç ekimi ameliyatı geçirdiniz mi? (Evetse: tarih, FUE/FUT, doktor/klinik adı, greft sayısı, sonuç)',
    q5: 'Geçmişte herhangi bir ameliyat geçirdiniz mi? (Örn: apandisit, artroskopi vb.)',
    q6: 'Şu an veya geçmişte sağlık sorununuz var mı? (Kalp ritim, tansiyon, diyabet, anemi, epilepsi, hepatit B-C, HIV vb. - varsa belirtin)',
    q7: 'Ciddi/kronik sağlık sorunları için ilaç kullanıyor musunuz veya kullandınız mı? (Tansiyon, diyabet, kan sulandırıcı, hormon vb.)',
    q8: 'Lokal anesteziye (Lidokain, Artikain, Prilokain vb.) veya herhangi bir ilaca alerjiniz var mı?',
    q9: 'Geçmişte kullandığınız bir ilacın yan etkisini yaşadınız mı? (Evetse hangi ilaç)',
    q10: 'Cilt hastalığınız var mı? (Dermatit, folikülit, keloid eğilimi vb.)',
    q11: 'Ailenizde erkeklerde kellik düzeyi nasıl? Anne veya baba tarafından mı?',
    q12: 'ASMED ve Dr. Koray Erdoğan\'a nasıl ulaştınız? (Arkadaş/forum/web sitesi/YouTube/öneri vb.)',
    q13: 'Uyruk/Milliyet',
  },
  en: {
    q1: 'Which part/parts of your hair do you wish to improve through FUE hair transplant? What type of result do you expect?',
    q2: 'Which type of FUE procedure is of interest to you? Normal FUE (hair shaved) or Long Hair FUE (hair left unshaven)?',
    q3: 'Are you currently using any medication to prevent hair loss? If not, are you willing to begin medication recommended by the doctor? (Finasteride, Dutasteride, Minoxidil, etc.)',
    q4: 'Have you ever undergone a hair transplant surgery? (If yes: date, type FUE/FUT, doctor/clinic name, number of grafts, result)',
    q5: 'Have you ever undergone any type of surgery in the past? (E.g. Appendectomy, Arthroscopy, etc.)',
    q6: 'Do you have any health issues at the moment or in the past? (E.g. Arrhythmia, high blood pressure, diabetes, anemia, epilepsy, hepatitis B-C, HIV etc.)',
    q7: 'Do you use any medication for serious and/or chronic health issues or have you ever needed to? (E.g. Hypertension, diabetes, blood thinners, hormonal treatments, etc.)',
    q8: 'Are you allergic to local anesthesia (Lidocaine, Articaine, Prilocaine, etc.) or any medication?',
    q9: 'Have you experienced any side effects from any medication that you have taken in the past? (If yes, which medication)',
    q10: 'Do you have any skin pathologies? (E.g. dermatitis, folliculitis, tendency towards keloid scarring)',
    q11: 'What is the level of baldness amongst the male members of your family and is it inherited from maternal or paternal relatives?',
    q12: 'How were you introduced to ASMED Clinic and Dr. Koray Erdogan? (E.g. recommendation, website, forum, YouTube, etc.)',
    q13: 'Origin/Nationality',
  },
  ar: {
    q1: 'أي جزء/أجزاء من شعرك ترغب في تحسينها من خلال زراعة الشعر FUE؟ ما نوع النتيجة المتوقعة؟',
    q2: 'أي نوع من إجراء FUE يهمك؟ FUE العادي (حلاقة الشعر) أم Long Hair FUE (بدون حلاقة)؟',
    q3: 'هل تستخدم حالياً أي دواء لمنع تساقط الشعر؟ إن لم يكن، هل أنت مستعد لبدء دواء يوصي به الطبيب؟',
    q4: 'هل خضعت سابقاً لعملية زراعة شعر؟ (إن نعم: التاريخ، النوع، اسم الطبيب/العيادة، عدد الطعوم)',
    q5: 'هل خضعت لأي عملية جراحية في الماضي؟',
    q6: 'هل لديك أي مشاكل صحية حالياً أو في الماضي؟',
    q7: 'هل تستخدم أدوية لمشاكل صحية مزمنة أو خطيرة؟',
    q8: 'هل لديك حساسية للتخدير الموضعي أو أي دواء؟',
    q9: 'هل عانيت من آثار جانبية لأي دواء سابقاً؟',
    q10: 'هل لديك أي أمراض جلدية؟',
    q11: 'ما مستوى الصلع بين الذكور في عائلتك؟ من طرف الأم أم الأب؟',
    q12: 'كيف تعرفت على عيادة ASMED والدكتور كوراي إردوغان؟',
    q13: 'الجنسية/الأصل',
  },
  de: {
    q1: 'Welche Teile Ihrer Haare möchten Sie durch eine FUE-Haartransplantation verbessern? Welches Ergebnis erwarten Sie?',
    q2: 'Welches FUE-Verfahren interessiert Sie? Normale FUE (Haare rasiert) oder Long Hair FUE (Haare unrasiert)?',
    q3: 'Nehmen Sie derzeit Medikamente gegen Haarausfall? Wenn nein, wären Sie bereit, vom Arzt empfohlene Medikamente zu nehmen?',
    q4: 'Haben Sie jemals eine Haartransplantation gehabt? (Wenn ja: Datum, Typ, Arzt/Klinik, Anzahl der Grafts)',
    q5: 'Haben Sie in der Vergangenheit irgendeine Operation gehabt?',
    q6: 'Haben Sie derzeit oder in der Vergangenheit Gesundheitsprobleme?',
    q7: 'Nehmen Sie Medikamente bei chronischen oder schweren Erkrankungen?',
    q8: 'Sind Sie allergisch gegen Lokalanästhesie oder Medikamente?',
    q9: 'Hatten Sie jemals Nebenwirkungen durch Medikamente?',
    q10: 'Haben Sie Hauterkrankungen?',
    q11: 'Wie stark ist der Haarausfall bei männlichen Familienmitgliedern? Maternal oder paternal?',
    q12: 'Wie haben Sie von der ASMED-Klinik und Dr. Koray Erdogan erfahren?',
    q13: 'Herkunft/Nationalität',
  },
  ru: {
    q1: 'Какую часть/части волос вы хотите улучшить с помощью пересадки FUE? Какой результат ожидаете?',
    q2: 'Какой тип FUE вас интересует? Обычный FUE (волосы сбриваются) или Long Hair FUE (без бритья)?',
    q3: 'Принимаете ли вы сейчас лекарства от выпадения волос? Если нет, готовы ли начать по рекомендации врача?',
    q4: 'Вам делали пересадку волос ранее? (Если да: дата, тип, врач/клиника, количество графтов)',
    q5: 'Были ли у вас операции в прошлом?',
    q6: 'Есть ли у вас проблемы со здоровьем сейчас или в прошлом?',
    q7: 'Принимаете ли вы лекарства при хронических или серьёзных заболеваниях?',
    q8: 'Есть ли у вас аллергия на местную анестезию или лекарства?',
    q9: 'Были ли побочные эффекты от лекарств в прошлом?',
    q10: 'Есть ли кожные заболевания?',
    q11: 'Какой уровень облысения у мужчин в семье? По материнской или отцовской линии?',
    q12: 'Как вы узнали об клинике ASMED и докторе Корае Эрдогане?',
    q13: 'Происхождение/Национальность',
  },
}

export function getQuestionText(lang: Lang, key: string): string {
  return questionnaireTexts[lang]?.[key] ?? questionnaireTexts.en[key] ?? key
}

export const PERSONAL_FIELDS = [
  'name', 'phone', 'email', 'dateOfBirth', 'country', 'city', 'profession',
] as const

export const LANG_LABELS: Record<Lang, string> = {
  tr: 'Türkçe',
  en: 'English',
  ar: 'العربية',
  de: 'Deutsch',
  ru: 'Русский',
}
