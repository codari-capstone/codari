import { Button } from '@/components/ui/button'
import { pageItems } from './problemListParams'

interface ProblemPaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

/**
 * 페이지 이동 (LIST-05).
 *
 * 링크가 아니라 버튼이다. 이동은 주소를 바꾸는 일이지만, 그 주소를 만드는 규칙은
 * 필터·검색어·정렬을 모두 들고 있는 ProblemListPage에 있다. 여기서 href를 만들려면
 * 그 규칙이 둘로 나뉜다.
 */
export function ProblemPagination({ page, pageCount, onPageChange }: ProblemPaginationProps) {
  return (
    <nav aria-label="페이지" className="flex flex-wrap items-center justify-center gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        이전
      </Button>

      {pageItems(page, pageCount).map((item, index) =>
        item === null ? (
          // 접힌 자리. 눌 수 없는 장식이라 보조기기에서 숨긴다.
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="text-muted-foreground px-1 text-sm"
          >
            …
          </span>
        ) : (
          <Button
            key={item}
            type="button"
            variant={item === page ? 'default' : 'ghost'}
            // 번호만으로는 무엇의 번호인지 읽히지 않는다. 지금 페이지는 aria-current로 알린다.
            aria-label={`${item}페이지`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ),
      )}

      <Button
        type="button"
        variant="outline"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        다음
      </Button>
    </nav>
  )
}
