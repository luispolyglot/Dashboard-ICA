import { Button } from '@/components/ui/button'
import type { PropsWithChildren } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function PageLayout({
  children,
  withBackButton = true,
  backTo,
}: PropsWithChildren & { withBackButton?: boolean; backTo?: string }) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className='relative container mx-auto flex flex-1 flex-col p-4 pb-0 lg:pb-4'>
      {withBackButton && (
        <div className='pl-4'>
          {backTo ? (
            <Button variant='outline' size='sm' asChild>
              <Link to={backTo}> Volver </Link>
            </Button>
          ) : (
            <Button type='button' variant='outline' size='sm' onClick={handleBack}>
              Volver
            </Button>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
