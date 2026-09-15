/**
 * Cria o primeiro usuário do painel.
 *   node --experimental-strip-types ingest/criar-admin.ts "Nome" email@ampla senha
 */
import { consultarSql, pool } from '../src/db/pool.ts';
import { gerarHashSenha } from '../src/core/auth.ts';
import { migrar } from '../src/db/migrate.ts';

const [, , nome, email, senha] = process.argv;

if (!nome || !email || !senha) {
  console.error('Uso: criar-admin.ts "Nome Completo" email@ampla.com.br senha-forte');
  process.exit(1);
}
if (senha.length < 10) {
  console.error('A senha precisa de pelo menos 10 caracteres.');
  process.exit(1);
}

await migrar();
await consultarSql(
  `INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1, $2, $3, 'admin')
   ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, papel = 'admin', ativo = TRUE`,
  [nome, email.toLowerCase(), await gerarHashSenha(senha)],
);
console.log(`Admin pronto: ${email}`);
await pool.end();
