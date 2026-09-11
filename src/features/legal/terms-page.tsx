import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/layout/logo'

const LAST_UPDATED = '11 de septiembre de 2026'
const CONTACT_EMAIL = 'yagomateoslerma@gmail.com'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between px-6">
        <Link to="/">
          <Wordmark />
        </Link>
        <Link to="/entrar" className="text-sm text-muted-foreground hover:text-foreground">
          Volver
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Términos de Servicio</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última actualización: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8">
          <Section title="Sobre Sinaptkis">
            <p>
              Sinaptkis es un proyecto en desarrollo activo, todavía sin una sociedad o autónomo
              registrado a su nombre. Al usarlo aceptas estos términos. Si no estás de acuerdo, no uses
              el servicio. Cualquier duda:{' '}
              <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="Qué es el servicio">
            <p>
              Sinaptkis genera y gestiona un sistema digital para tu negocio: CRM, automatizaciones,
              agentes de IA, base de conocimiento y canales de mensajería, usando n8n como motor de
              ejecución. El servicio se apoya en proveedores externos (IA, email, calendario, pagos,
              mensajería) que pueden requerir que los conectes con tus propias credenciales.
            </p>
          </Section>

          <Section title="Tu cuenta y tu negocio">
            <p>
              Eres responsable de la veracidad de los datos que introduces, de los contactos y
              contenidos que subes, y de mantener segura tu contraseña. Como responsable de tu propio
              negocio, también eres responsable de cumplir con la normativa aplicable a los datos de
              tus clientes (por ejemplo, RGPD) cuando los gestionas dentro de Sinaptkis.
            </p>
          </Section>

          <Section title="Uso aceptable">
            <p>No puedes usar Sinaptkis para:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Enviar spam o comunicaciones no solicitadas a través de email, Telegram o WhatsApp.</li>
              <li>
                Incumplir las políticas de uso de los proveedores conectados (Meta/WhatsApp, Google,
                Stripe, Telegram, Anthropic, OpenAI).
              </li>
              <li>Actividad ilegal, fraudulenta o que suplante a terceros.</li>
              <li>Intentar acceder a datos de otro negocio o vulnerar el aislamiento entre cuentas.</li>
            </ul>
          </Section>

          <Section title="Planes y facturación">
            <p>
              Si activas un plan de pago, el cobro y la gestión de tu suscripción los procesa Stripe.
              Puedes cancelar tu suscripción en cualquier momento desde Ajustes → Facturación.
            </p>
          </Section>

          <Section title="Disponibilidad del servicio">
            <p>
              Sinaptkis está en fase de desarrollo activo. No garantizamos disponibilidad continua ni
              ausencia de errores. Algunas funciones dependen de que tú conectes credenciales propias
              (Google, WhatsApp, Stripe, proveedores de IA) — sin ellas, esas funciones no estarán
              activas y la aplicación te lo indicará honestamente en vez de simular que funcionan.
            </p>
          </Section>

          <Section title="Propiedad intelectual">
            <p>
              El software de Sinaptkis es propiedad de su titular. Los datos que introduces (tu
              negocio, tus contactos, tus documentos) siguen siendo tuyos.
            </p>
          </Section>

          <Section title="Limitación de responsabilidad">
            <p>
              Sinaptkis se ofrece "tal cual", sin garantías de ningún tipo. En la medida permitida por
              la ley, no somos responsables de daños indirectos derivados del uso del servicio o de sus
              proveedores externos (por ejemplo, una respuesta incorrecta de un modelo de IA, un fallo
              en un proveedor de mensajería, o la interrupción de un servicio de terceros).
            </p>
          </Section>

          <Section title="Cancelación">
            <p>
              Puedes eliminar tu negocio o tu cuenta cuando quieras. También podemos suspender una
              cuenta que incumpla estos términos, avisando cuando sea razonablemente posible.
            </p>
          </Section>

          <Section title="Ley aplicable">
            <p>Estos términos se rigen por la legislación española.</p>
          </Section>

          <Section title="Cambios en estos términos">
            <p>
              Si actualizamos estos términos, cambiaremos la fecha de "última actualización" al
              principio de esta página.
            </p>
          </Section>
        </div>
      </main>
    </div>
  )
}
