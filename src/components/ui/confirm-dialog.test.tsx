// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './confirm-dialog'

/**
 * `ConfirmDialog` es controlado (`open`/`onOpenChange`), así que un wrapper
 * con estado real es más fiel que simular el cambio a mano — es justo lo que
 * hace cada pantalla que lo usa (borrar un servicio, cancelar una cita,
 * eliminar un negocio).
 */
function ControlledDialog(props: {
  onConfirm: () => void
  loading?: boolean
  initialOpen?: boolean
}) {
  const [open, setOpen] = useState(props.initialOpen ?? true)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Eliminar negocio"
      description="Esto no se puede deshacer."
      loading={props.loading}
      onConfirm={props.onConfirm}
    />
  )
}

describe('ConfirmDialog', () => {
  it('muestra el título y la descripción cuando está abierto', () => {
    render(<ControlledDialog onConfirm={() => {}} />)
    expect(screen.getByText('Eliminar negocio')).toBeInTheDocument()
    expect(screen.getByText('Esto no se puede deshacer.')).toBeInTheDocument()
  })

  it('no renderiza nada cuando está cerrado', () => {
    render(<ControlledDialog onConfirm={() => {}} initialOpen={false} />)
    expect(screen.queryByText('Eliminar negocio')).not.toBeInTheDocument()
  })

  it('pulsar "Eliminar" llama a onConfirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ControlledDialog onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('pulsar "Cancelar" cierra el diálogo sin llamar a onConfirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ControlledDialog onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByText('Eliminar negocio')).not.toBeInTheDocument()
  })

  it('con loading, "Cancelar" se deshabilita para no cerrar a mitad de la acción', () => {
    render(<ControlledDialog onConfirm={() => {}} loading />)
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })
})
