import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSoftLoading } from '../../../../src/modules/hooks/useSoftLoading'

describe('useSoftLoading', () => {
  it('solo enseña «cargando» la primera vez; las recargas son silenciosas', () => {
    const { result } = renderHook(() => useSoftLoading(true))
    expect(result.current[0]).toBe(true)

    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)

    // Recarga (después de guardar, borrar, «Recargar»…): el contenido se queda.
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(false)
    expect(result.current[2]).toBe(true)

    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
    expect(result.current[2]).toBe(false)
  })

  it('vuelve a enseñar el esqueleto si cambia la clave (otro mes, otro alumno…)', () => {
    const { result, rerender } = renderHook(({ key }) => useSoftLoading(true, key), {
      initialProps: { key: 'enero' },
    })
    act(() => result.current[1](false))

    rerender({ key: 'febrero' })
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
    expect(result.current[2]).toBe(false)

    act(() => result.current[1](false))
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(false)
    expect(result.current[2]).toBe(true)
  })

  it('funciona también empezando sin cargar (listas que se piden después)', () => {
    const { result } = renderHook(() => useSoftLoading(false))
    expect(result.current[0]).toBe(false)

    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)

    act(() => result.current[1](false))
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(false)
    expect(result.current[2]).toBe(true)
  })
})
