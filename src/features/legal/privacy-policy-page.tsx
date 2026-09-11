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

export function PrivacyPolicyPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Política de Privacidad</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última actualización: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8">
          <Section title="Quién trata tus datos">
            <p>
              Sinaptkis es un proyecto en desarrollo activo, todavía sin una sociedad o autónomo
              registrado a su nombre. Su responsable es el titular del proyecto, contactable en{' '}
              <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . Cuando el proyecto se constituya como empresa, esta política se actualizará con esos
              datos.
            </p>
          </Section>

          <Section title="Qué datos tratamos">
            <p>Según cómo uses Sinaptkis, tratamos:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Datos de tu cuenta: nombre, email y contraseña (gestionada por Supabase Auth).</li>
              <li>
                Datos del negocio que registras: nombre, sector, objetivos, servicios y precios que
                introduces durante el onboarding.
              </li>
              <li>
                Datos de tus propios contactos (leads): nombre, email, teléfono, canal de origen y el
                contenido de las conversaciones que mantienen con tus agentes de IA o tu equipo.
              </li>
              <li>
                Documentos que subas a la base de Conocimiento (PDF, TXT, DOCX, URLs, preguntas
                frecuentes) para que el agente los use como contexto.
              </li>
              <li>Registros técnicos de uso: ejecuciones de automatizaciones y actividad del negocio.</li>
            </ul>
          </Section>

          <Section title="Para qué los usamos">
            <p>
              Para prestar el servicio: generar y ejecutar tus automatizaciones, dar contexto real a
              tus agentes de IA, gestionar tu CRM y tus canales de mensajería, calcular métricas de tu
              negocio y, si activas la facturación, gestionar tu suscripción. No usamos tus datos para
              entrenar modelos de IA de terceros ni los vendemos.
            </p>
          </Section>

          <Section title="Con quién los compartimos">
            <p>
              Sinaptkis funciona conectando varios proveedores externos. Solo reciben los datos
              necesarios para hacer su parte, y solo si tú (o el negocio) los conecta o los usa:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Supabase</strong> — base de datos, autenticación y alojamiento del backend.
              </li>
              <li>
                <strong>n8n</strong> — motor que ejecuta tus automatizaciones.
              </li>
              <li>
                <strong>Anthropic, OpenAI u Ollama</strong> — el proveedor de IA que elijas procesa el
                texto de las conversaciones para generar respuestas. Ollama, si lo usas, corre en tu
                propia infraestructura.
              </li>
              <li>
                <strong>Resend</strong> — envío de emails transaccionales y de automatizaciones.
              </li>
              <li>
                <strong>Stripe</strong> — procesa pagos y gestiona tu suscripción, si activas la
                facturación.
              </li>
              <li>
                <strong>Google Calendar</strong> — si conectas tu calendario, para comprobar
                disponibilidad y crear citas.
              </li>
              <li>
                <strong>Telegram y WhatsApp (Meta)</strong> — si conectas alguno de estos canales, para
                enviar y recibir mensajes en nombre de tu negocio.
              </li>
              <li>
                <strong>Qdrant</strong> — si está configurado, almacena representaciones vectoriales de
                tus documentos de Conocimiento para la búsqueda semántica.
              </li>
            </ul>
          </Section>

          <Section title="Cuánto tiempo los conservamos">
            <p>
              Mientras tu cuenta y tu negocio existan en Sinaptkis. Si eliminas un negocio, sus datos
              asociados (contactos, conversaciones, documentos, automatizaciones) se eliminan también.
              Puedes pedir la eliminación completa de tu cuenta escribiendo a{' '}
              <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="Tus derechos">
            <p>
              Puedes pedir acceso, rectificación, eliminación o portabilidad de tus datos, u oponerte
              a su tratamiento, escribiendo a{' '}
              <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . Responderemos en un plazo razonable.
            </p>
          </Section>

          <Section title="Aislamiento entre negocios">
            <p>
              Sinaptkis es una plataforma multiempresa: los datos de cada negocio están aislados a
              nivel de base de datos (Row Level Security de PostgreSQL), de forma que ningún negocio
              puede acceder a los datos de otro.
            </p>
          </Section>

          <Section title="Transferencias internacionales">
            <p>
              Algunos de los proveedores anteriores (por ejemplo, Anthropic, OpenAI, Stripe o Google)
              procesan datos fuera del Espacio Económico Europeo. Cuando esto ocurre, dependemos de las
              garantías que esos proveedores ofrecen para transferencias internacionales.
            </p>
          </Section>

          <Section title="Cookies y almacenamiento local">
            <p>
              Sinaptkis no usa cookies de publicidad ni analítica de terceros. Usa el almacenamiento
              local del navegador únicamente para mantener tu sesión iniciada (gestionado por Supabase
              Auth).
            </p>
          </Section>

          <Section title="Menores de edad">
            <p>Sinaptkis está dirigido a negocios y profesionales, no a menores de edad.</p>
          </Section>

          <Section title="Cambios en esta política">
            <p>
              Si actualizamos esta política, cambiaremos la fecha de "última actualización" al
              principio de esta página.
            </p>
          </Section>

          <Section title="Contacto">
            <p>
              Para cualquier duda sobre esta política o tus datos:{' '}
              <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
    </div>
  )
}
