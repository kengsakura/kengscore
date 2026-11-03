import { SearchX } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="ไม่พบหน้านี้"
      description="ลิงก์อาจไม่ถูกต้อง หรือข้อมูลถูกลบไปแล้ว"
      action={<ButtonLink to="/" variant="primary">กลับหน้าหลัก</ButtonLink>}
    />
  )
}
