import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ASMED Saç Ekimi Asistanı',
  description: 'ASMED ve Dr. Koray Erdoğan yöntemleri hakkında bilgi alın.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr" className={poppins.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
