import { useCallback, useEffect, useMemo, useState } from 'react'

export const SCREENS = {
  SM: 640, // 640px
  MD: 768, // 768px
  LG: 1024, // 1024px
  XL: 1280, // 1280px
  '2XL': 1536, // 1536px
}
type ScreenSize = {
  width: number
  height: number
}

const getWindowSize = (): ScreenSize => ({
  width: window.innerWidth,
  height: window.innerHeight,
})

const useBreakpoints = () => {
  const [windowSize, setWindowSize] = useState<ScreenSize>(getWindowSize)

  const isSm = useMemo(() => windowSize.width >= SCREENS.SM, [windowSize])
  const isMd = useMemo(() => windowSize.width >= SCREENS.MD, [windowSize])
  const isLg = useMemo(() => windowSize.width >= SCREENS.LG, [windowSize])
  const isXl = useMemo(() => windowSize.width >= SCREENS.XL, [windowSize])

  const handleResize = useCallback(() => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    })
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize)
      handleResize()
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [handleResize])

  return { windowSize, isSm, isMd, isLg, isXl }
}

export default useBreakpoints