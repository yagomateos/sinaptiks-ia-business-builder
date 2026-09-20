// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './login-page'

const signIn = vi.fn()
const navigate = vi.fn()

vi.mock('./auth-context', () => ({
  useAuth: () => ({ signIn }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    signIn.mockReset()
    navigate.mockReset()
  })

  it('no llama a signIn si el email y la contraseña están vacíos — muestra los errores de validación', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Escribe tu email.')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('un email con formato inválido no llega a llamar a signIn', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Email'), 'esto-no-es-un-email')
    await user.type(screen.getByLabelText('Contraseña'), 'algo')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Escribe un email válido.')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('con datos válidos, llama a signIn y navega a /app', async () => {
    signIn.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Email'), 'demo@sinaptkis.io')
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-real')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('demo@sinaptkis.io', 'contraseña-real'))
    expect(navigate).toHaveBeenCalledWith('/app', { replace: true })
  })

  it('si signIn falla (credenciales incorrectas), muestra el error y no navega', async () => {
    signIn.mockRejectedValueOnce(new Error('Email o contraseña incorrectos.'))
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Email'), 'demo@sinaptkis.io')
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-mala')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Email o contraseña incorrectos.')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })
})
