import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Logo from '../components/Logo'

/**
 * Shared shell for Terms and Privacy.
 *
 * The two pages were near-identical copies before; keeping one layout means a
 * change to the legal chrome cannot land on one page and miss the other.
 */
const LegalPage = ({ title, updated, sections }) => (
  <div className="min-h-screen bg-canvas">
    <header className="border-b border-hairline">
      <div className="app-gutter h-topbar flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="w-8 h-8" />
          <span className="text-h3 font-semibold tracking-tight">SciPark</span>
        </Link>

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-small text-content-muted hover:text-content transition-colors duration-fast"
        >
          <ArrowLeft className="w-4 h-4" />
          กลับหน้าแรก
        </Link>
      </div>
    </header>

    <main className="app-gutter max-w-2xl py-10 sm:py-14">
      <h1 className="text-h1 text-content">{title}</h1>
      <p className="mt-2 text-small text-content-subtle">ปรับปรุงล่าสุด {updated}</p>

      <div className="mt-8 space-y-8">
        {sections.map((section, index) => (
          <section key={section.heading}>
            <h2 className="text-h2 text-content">
              <span className="font-mono text-content-subtle mr-2 tabular">
                {String(index + 1).padStart(2, '0')}
              </span>
              {section.heading}
            </h2>

            {section.body && (
              <p className="mt-3 text-content-muted leading-relaxed">{section.body}</p>
            )}

            {section.items && (
              <ul className="mt-3 space-y-2">
                {section.items.map((item, i) => (
                  <li key={item} className="flex gap-3 text-content-muted leading-relaxed">
                    <span className="w-5 shrink-0 text-right font-mono text-small text-brand-600 tabular" aria-hidden="true">
                      {i + 1}.
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-12 pt-6 border-t border-hairline text-small text-content-subtle">
        มีคำถาม? ติดต่อทีมงาน SciPark คณะวิทยาศาสตร์ สจล.
      </footer>
    </main>
  </div>
)

export default LegalPage
