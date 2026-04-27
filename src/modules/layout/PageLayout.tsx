import { Button } from '@/components/ui/button'
import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

export function PageLayout({
  children,
  withBackButton = true,
  backTo = '..',
}: PropsWithChildren & { withBackButton?: boolean; backTo?: string }) {
  return (
    <div className='container mx-auto flex flex-1 flex-col gap-4 p-6 pb-0 lg:px-14 lg:pb-6'>
      {withBackButton && (
        <div className='pl-4'>
          <Button variant='outline' size='sm' asChild>
            <Link to={backTo}> Volver </Link>
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}
