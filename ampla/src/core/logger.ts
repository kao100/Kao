/** Log estruturado em JSON, sem dependência externa. */
type Nivel = 'debug' | 'info' | 'warn' | 'error';

const ordem: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minimo = ordem[(process.env['LOG_LEVEL'] as Nivel) || 'info'] ?? 20;

function escrever(nivel: Nivel, mensagem: string, extra?: Record<string, unknown>) {
  if (ordem[nivel] < minimo) return;
  const linha = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    mensagem,
    ...extra,
  });
  if (nivel === 'error' || nivel === 'warn') process.stderr.write(linha + '\n');
  else process.stdout.write(linha + '\n');
}

export const log = {
  debug: (m: string, e?: Record<string, unknown>) => escrever('debug', m, e),
  info: (m: string, e?: Record<string, unknown>) => escrever('info', m, e),
  warn: (m: string, e?: Record<string, unknown>) => escrever('warn', m, e),
  error: (m: string, e?: Record<string, unknown>) => escrever('error', m, e),
};
