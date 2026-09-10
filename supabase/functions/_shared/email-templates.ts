/**
 * HTML de los emails que mandan las Edge Functions. Estilos inline a
 * propósito: la mayoría de clientes de correo ignoran o recortan el
 * `<style>` en el `<head>`.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Email genérico para automatizaciones (enviar_email, solicitar_resena) que
 * no traen su propia plantilla — `action.config` llega vacío en todos los
 * blueprints del catálogo. Mejor un email real con texto sencillo que
 * seguir sin enviar nada.
 */
export function automationEmailHtml(input: { businessName: string; heading: string; bodyText: string }): string {
  return `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#4f46e5;padding:24px 28px;">
                <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${escapeHtml(input.businessName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 12px;color:#111827;font-size:17px;font-weight:700;">${escapeHtml(input.heading)}</p>
                <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(input.bodyText)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #f0f0f2;">
                <p style="margin:0;color:#9ca3af;font-size:12px;">Enviado automáticamente por tu asistente de Sinaptiks.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()
}

export interface AppointmentEmailInput {
  businessName: string
  nombre: string
  servicio: string
  fechaHora: string
  telefono: string | null
  email: string | null
  canal: string
}

export function appointmentRequestEmailHtml(input: AppointmentEmailInput): string {
  const row = (label: string, value: string | null) =>
    value
      ? `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#111827;font-size:15px;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`
      : ''

  return `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#4f46e5;padding:24px 28px;">
                <p style="margin:0;color:#e0e7ff;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">Nueva solicitud de cita</p>
                <p style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:700;">${escapeHtml(input.businessName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.5;">
                  Un contacto acaba de pedir cita a través del bot. Aquí tienes los datos que dio:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${row('Nombre', input.nombre)}
                  ${row('Servicio', input.servicio)}
                  ${row('Fecha/hora preferida', input.fechaHora)}
                  ${row('Teléfono', input.telefono)}
                  ${row('Email', input.email)}
                  ${row('Canal', input.canal)}
                </table>
                <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;line-height:1.5;">
                  Confírmalo directamente con el contacto — este aviso es informativo, la cita no queda reservada en ningún calendario todavía.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #f0f0f2;">
                <p style="margin:0;color:#9ca3af;font-size:12px;">Enviado automáticamente por tu asistente de Sinaptiks.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()
}
