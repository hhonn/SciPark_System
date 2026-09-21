import { Link } from 'react-router-dom'
import { Home, MapPinOff } from 'lucide-react'
import Button from '../components/ui/Button'
import Logo from '../components/Logo'
import { useAuthStore } from '../stores/authStore'

const NotFound = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-canvas">
      <Logo className="w-10 h-10 mb-8" />

      <span className="w-14 h-14 rounded-xl bg-surface-2 border border-hairline flex items-center justify-center mb-5">
        <MapPinOff className="w-7 h-7 text-content-subtle" />
      </span>

      <p className="font-mono text-h2 text-content-subtle tabular">404</p>
      <h1 className="mt-2 text-h1 text-content">ไม่พบหน้านี้</h1>
      <p className="mt-2 text-small text-content-muted max-w-sm">
        หน้าที่คุณค้นหาอาจถูกย้ายหรือไม่มีอยู่แล้ว
      </p>

      <Link to={isAuthenticated ? '/app' : '/'} className="mt-6">
        <Button icon={Home} size="lg">
          {isAuthenticated ? 'กลับหน้าหลัก' : 'กลับหน้าแรก'}
        </Button>
      </Link>
    </div>
  )
}

export default NotFound
