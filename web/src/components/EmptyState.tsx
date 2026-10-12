import { Inbox, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  /** 기본값은 받은 편지함 모양. 화면에 맞는 아이콘이 있으면 넘긴다. */
  icon?: LucideIcon
  title: string
  description: string
  /** 다음에 할 행동. 빈 상태는 안내로 끝내지 않고 길을 알려 준다 (UX-03). */
  action?: { label: string; to: string; state?: unknown }
  /**
   * 화면 전체가 빈 상태일 때만 1. 그 화면의 h1이 이 제목이어야 한다.
   * 기본값 2는 화면 일부(표 영역 등)가 비었을 때를 가정한다. ErrorState와 같은 규약이다.
   */
  headingLevel?: 1 | 2
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <div className="bg-muted/40 flex flex-col items-center rounded-xl px-6 py-12 text-center">
      <Icon className="text-muted-foreground/60 mb-4 size-8" aria-hidden="true" />
      <Heading className={headingLevel === 1 ? 'text-xl font-semibold' : 'text-base font-medium'}>
        {title}
      </Heading>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">{description}</p>
      {action ? (
        <Button asChild className="mt-5 min-h-11">
          <Link to={action.to} state={action.state}>
            {action.label}
          </Link>
        </Button>
      ) : null}
    </div>
  )
}
