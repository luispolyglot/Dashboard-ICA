import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DASHBOARD_ROUTES } from '../routes/paths'

export function LeaderboardMenu() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='outline' size='icon' asChild>
          <Link to={DASHBOARD_ROUTES.leaderboard} aria-label='Abrir leaderboard'>
            <span aria-hidden='true' className='text-base'>
              🏆
            </span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Leaderboard</TooltipContent>
    </Tooltip>
  )
}
