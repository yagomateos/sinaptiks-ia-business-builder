// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from './password-input'

describe('PasswordInput', () => {
  it('oculta la contraseña por defecto', () => {
    render(<PasswordInput aria-label="contraseña" defaultValue="secreto123" />)
    expect(screen.getByLabelText('contraseña')).toHaveAttribute('type', 'password')
  })

  it('el botón de mostrar/ocultar revela y vuelve a ocultar el valor', async () => {
    const user = userEvent.setup()
    render(<PasswordInput aria-label="contraseña" defaultValue="secreto123" />)

    const input = screen.getByLabelText('contraseña')
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' })

    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('el botón de mostrar/ocultar no roba el foco por tabulación (tabIndex -1)', () => {
    render(<PasswordInput aria-label="contraseña" />)
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '-1')
  })
})
