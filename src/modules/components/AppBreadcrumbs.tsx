import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { useDashboardBreadcrumbs } from '../hooks/useDashboardBreadcrumbs'

export function AppBreadcrumbs() {
  const items = useDashboardBreadcrumbs()

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => (
          <Fragment key={item.href}>
            <BreadcrumbItem>
              {item.current ? (
                <BreadcrumbPage
                  className={
                    item.href === '/'
                      ? 'text-[0.9rem] lg:text-[1rem] font-heading'
                      : undefined
                  }
                >
                  {item.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>

            {index < items.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
