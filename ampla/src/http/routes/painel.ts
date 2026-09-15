/**
 * Rotas do painel: login, chaves, auditoria, consumo e consulta manual.
 */
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.ts';
import { consultarSql, umaLinha } from '../../db/pool.ts';
import {
  conferirSenha,
  criarSessao,
  encerrarSessao,
  gerarChaveApi,
  gerarHashSenha,
} from '../../core/auth.ts';
import { exigirSessao, exigirPapel } from '../auth.ts';
import { erros, ErroApi } from '../../core/errors.ts';
import { inventario } from '../../core/registry.ts';
import { registrarConsulta } from '../../core/audit.ts';
import { consultarCnpj } from '../../products/cnpj.ts';
import { consultarCpf } from '../../products/cpf.ts';
import { consultarCompliance } from '../../products/compliance.ts';
import { consultarCep, consultarProcessos } from '../../products/simples.ts';
import type { Produto } from '../../core/types.ts';

/**
 * Quanto custaria cada consulta comprando pronto de um agregador ou bureau,
 * em centavos. Serve só para o painel mostrar quanto a plataforma própria
 * economizou — ajuste para os preços que a Ampla pagava de fato.
 */
const PRECO_REFERENCIA_MERCADO: Record<Produto, number> = {
  cnpj: 10,
  cpf: 24,
  compliance: 30,
  processos: 50,
  cep: 2,
  'divida-ativa': 15,
};

function cookieSeguro() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.producao,
    path: '/',
    maxAge: 60 * 60 * 12,
  };
}

export function rotasPainel(app: FastifyInstance): void {
  // --- Sessão ---------------------------------------------------------------

  app.post<{ Body: { email?: string; senha?: string } }>('/login', async (req, res) => {
    const { email = '', senha = '' } = req.body ?? {};
    const usuario = await umaLinha<{
      id: number;
      nome: string;
      email: string;
      papel: string;
      senha_hash: string;
    }>('SELECT id, nome, email, papel, senha_hash FROM usuarios WHERE email = $1 AND ativo = TRUE', [
      email.toLowerCase().trim(),
    ]);

    // Mesma resposta para e-mail inexistente e senha errada: não confirmamos
    // quem tem conta.
    if (!usuario || !(await conferirSenha(senha, usuario.senha_hash))) {
      throw erros.naoAutenticado('E-mail ou senha incorretos.');
    }

    const token = await criarSessao(usuario.id);
    await consultarSql('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [usuario.id]);
    res.setCookie('ampla_sessao', token, cookieSeguro());
    return { usuario: { nome: usuario.nome, email: usuario.email, papel: usuario.papel } };
  });

  app.post('/logout', async (req, res) => {
    const token = req.cookies?.['ampla_sessao'];
    if (token) await encerrarSessao(token);
    res.clearCookie('ampla_sessao', { path: '/' });
    return { ok: true };
  });

  app.get('/eu', { preHandler: exigirSessao }, async (req) => ({ usuario: req.usuario }));

  // --- Painel ---------------------------------------------------------------

  app.get('/resumo', { preHandler: exigirSessao }, async () => {
    const [porProduto, porOrigem, totais, serie] = await Promise.all([
      consultarSql<{ produto: Produto; total: number; custo: number }>(
        `SELECT produto, COUNT(*)::bigint AS total, SUM(custo_centavos)::bigint AS custo
           FROM consultas WHERE criado_em > now() - interval '30 days'
          GROUP BY produto ORDER BY total DESC`,
      ),
      consultarSql<{ origem: string; total: number }>(
        `SELECT origem, COUNT(*)::bigint AS total
           FROM consultas WHERE criado_em > now() - interval '30 days'
          GROUP BY origem`,
      ),
      umaLinha<{ hoje: number; mes: number; custo_mes: number; latencia: number }>(
        `SELECT
            COUNT(*) FILTER (WHERE criado_em >= date_trunc('day', now()))::bigint AS hoje,
            COUNT(*)::bigint AS mes,
            COALESCE(SUM(custo_centavos), 0)::bigint AS custo_mes,
            COALESCE(ROUND(AVG(latencia_ms)), 0)::bigint AS latencia
           FROM consultas WHERE criado_em > now() - interval '30 days'`,
      ),
      consultarSql<{ dia: string; total: number }>(
        `SELECT to_char(date_trunc('day', criado_em), 'YYYY-MM-DD') AS dia,
                COUNT(*)::bigint AS total
           FROM consultas WHERE criado_em > now() - interval '30 days'
          GROUP BY 1 ORDER BY 1`,
      ),
    ]);

    // Quanto essas mesmas consultas custariam compradas prontas.
    const custoSeComprado = porProduto.reduce(
      (soma, linha) => soma + linha.total * (PRECO_REFERENCIA_MERCADO[linha.produto] ?? 0),
      0,
    );
    const custoReal = totais?.custo_mes ?? 0;

    return {
      periodo: '30 dias',
      hoje: totais?.hoje ?? 0,
      mes: totais?.mes ?? 0,
      latenciaMediaMs: totais?.latencia ?? 0,
      custoRealCentavos: custoReal,
      custoSeCompradoCentavos: custoSeComprado,
      economiaCentavos: Math.max(0, custoSeComprado - custoReal),
      porProduto,
      porOrigem,
      serie,
    };
  });

  app.get<{ Querystring: { pagina?: string; produto?: string; documento?: string } }>(
    '/consultas',
    { preHandler: exigirSessao },
    async (req) => {
      const pagina = Math.max(1, Number(req.query.pagina ?? '1') || 1);
      const porPagina = 50;
      const filtros: string[] = [];
      const valores: unknown[] = [];

      if (req.query.produto) {
        valores.push(req.query.produto);
        filtros.push(`produto = $${valores.length}`);
      }
      if (req.query.documento) {
        valores.push(`%${req.query.documento.replace(/\D/g, '')}%`);
        filtros.push(`documento LIKE $${valores.length}`);
      }
      const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
      valores.push(porPagina, (pagina - 1) * porPagina);

      const linhas = await consultarSql(
        `SELECT c.consulta_id, c.produto, c.documento, c.finalidade, c.origem,
                c.encontrado, c.custo_centavos, c.latencia_ms, c.criado_em,
                c.fontes, k.nome AS chave_nome, u.nome AS usuario_nome
           FROM consultas c
           LEFT JOIN chaves_api k ON k.id = c.chave_id
           LEFT JOIN usuarios u ON u.id = c.usuario_id
           ${onde}
          ORDER BY c.criado_em DESC
          LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores,
      );
      return { pagina, porPagina, consultas: linhas };
    },
  );

  app.get('/fontes', { preHandler: exigirSessao }, async () => ({ fontes: inventario() }));

  // --- Chaves de API --------------------------------------------------------

  app.get('/chaves', { preHandler: exigirSessao }, async () => ({
    chaves: await consultarSql(
      `SELECT id, nome, prefixo, ambiente, ativo, limite_diario, produtos,
              criado_em, ultimo_uso_em, revogado_em
         FROM chaves_api ORDER BY criado_em DESC`,
    ),
  }));

  app.post<{
    Body: { nome?: string; ambiente?: 'producao' | 'sandbox'; limiteDiario?: number; produtos?: string[] };
  }>('/chaves', { preHandler: exigirPapel('admin') }, async (req) => {
    const { nome, ambiente = 'producao', limiteDiario = 10_000, produtos = [] } = req.body ?? {};
    if (!nome?.trim()) throw new ErroApi(400, 'nome_ausente', 'Informe o nome da chave.');

    const { chave, prefixo, hash } = gerarChaveApi(ambiente);
    const criada = await umaLinha<{ id: number }>(
      `INSERT INTO chaves_api (nome, prefixo, hash, ambiente, limite_diario, produtos, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [nome.trim(), prefixo, hash, ambiente, limiteDiario, produtos, req.usuario!.id],
    );

    // Única vez em que a chave completa existe fora do cliente.
    return { id: criada!.id, nome, prefixo, chave, aviso: 'Guarde agora: a chave não será exibida de novo.' };
  });

  app.delete<{ Params: { id: string } }>(
    '/chaves/:id',
    { preHandler: exigirPapel('admin') },
    async (req) => {
      await consultarSql(
        'UPDATE chaves_api SET ativo = FALSE, revogado_em = now() WHERE id = $1',
        [Number(req.params.id)],
      );
      return { ok: true };
    },
  );

  // --- Consulta manual pelo painel -----------------------------------------

  app.post<{
    Body: { produto?: Produto; valor?: string; nome?: string; finalidade?: string; semFontePaga?: boolean };
  }>('/consultar', { preHandler: exigirSessao }, async (req) => {
    const { produto, valor = '', nome, finalidade, semFontePaga } = req.body ?? {};
    if (!finalidade?.trim()) throw erros.finalidadeAusente();
    if (!valor.trim()) throw erros.documentoInvalido(valor);

    const resposta = await (async () => {
      switch (produto) {
        case 'cnpj':
          return consultarCnpj(valor, finalidade);
        case 'cpf':
          return consultarCpf(valor, finalidade, { nome, semFontePaga });
        case 'compliance':
          return consultarCompliance(valor, finalidade, { nome });
        case 'cep':
          return consultarCep(valor, finalidade);
        case 'processos':
          return consultarProcessos(/^\d{15,25}$/.test(valor.replace(/\D/g, '')) ? 'numero' : 'nome', valor, finalidade);
        default:
          throw erros.documentoInvalido(String(produto));
      }
    })();

    await registrarConsulta({
      resposta,
      finalidade,
      usuarioId: req.usuario!.id,
      ip: req.ip || null,
    });
    return resposta;
  });

  // --- Usuários -------------------------------------------------------------

  app.get('/usuarios', { preHandler: exigirPapel('admin') }, async () => ({
    usuarios: await consultarSql(
      'SELECT id, nome, email, papel, ativo, criado_em, ultimo_acesso FROM usuarios ORDER BY nome',
    ),
  }));

  app.post<{ Body: { nome?: string; email?: string; senha?: string; papel?: string } }>(
    '/usuarios',
    { preHandler: exigirPapel('admin') },
    async (req) => {
      const { nome = '', email = '', senha = '', papel = 'operador' } = req.body ?? {};
      if (!nome.trim() || !email.trim()) throw new ErroApi(400, 'dados_incompletos', 'Nome e e-mail são obrigatórios.');
      if (senha.length < 10) throw new ErroApi(400, 'senha_fraca', 'A senha precisa de pelo menos 10 caracteres.');

      const criado = await umaLinha<{ id: number }>(
        `INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [nome.trim(), email.toLowerCase().trim(), await gerarHashSenha(senha), papel],
      );
      if (!criado) throw new ErroApi(409, 'email_em_uso', 'Já existe usuário com este e-mail.');
      return { id: criado.id };
    },
  );
}
