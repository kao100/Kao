/**
 * CEP — BrasilAPI primeiro, ViaCEP como reserva. Ambas gratuitas.
 * Duas fontes para o mesmo dado porque CEP é consulta de alto volume e a
 * indisponibilidade de uma não pode derrubar o produto.
 */
import { buscarJson, ErroHttp } from '../core/http.ts';
import { registrar, type Conector } from '../core/registry.ts';
import type { DadosCep } from '../core/types.ts';
import { somenteDigitos } from '../core/documents.ts';

interface CepBrasilApi {
  cep: string;
  state: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
}

interface CepViaCep {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean | string;
}

export const conectorCepBrasilApi: Conector<DadosCep> = {
  id: 'brasilapi-cep',
  produto: 'cep',
  descricao: 'BrasilAPI — CEP',
  tipoFonte: 'publica',
  custoCentavos: 0,
  ordem: 20,
  disponivel: () => ({ ok: true }),
  async consultar(entrada) {
    const cep = somenteDigitos(entrada);
    try {
      const r = await buscarJson<CepBrasilApi>(
        `https://brasilapi.com.br/api/cep/v2/${cep}`,
        { tempoLimiteMs: 6_000, tentativas: 2 },
      );
      return {
        cep,
        logradouro: r.street || null,
        bairro: r.neighborhood || null,
        municipio: r.city || null,
        uf: r.state || null,
        ibge: null,
      };
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.status === 404) return null;
      throw erro;
    }
  },
};

export const conectorCepViaCep: Conector<DadosCep> = {
  id: 'viacep',
  produto: 'cep',
  descricao: 'ViaCEP (reserva)',
  tipoFonte: 'publica',
  custoCentavos: 0,
  ordem: 30,
  disponivel: () => ({ ok: true }),
  async consultar(entrada) {
    const cep = somenteDigitos(entrada);
    const r = await buscarJson<CepViaCep>(`https://viacep.com.br/ws/${cep}/json/`, {
      tempoLimiteMs: 6_000,
      tentativas: 2,
    });
    // O ViaCEP responde 200 com {"erro": true} quando o CEP não existe.
    if (r.erro) return null;
    return {
      cep,
      logradouro: r.logradouro || null,
      bairro: r.bairro || null,
      municipio: r.localidade || null,
      uf: r.uf || null,
      ibge: r.ibge || null,
    };
  },
};

registrar(conectorCepBrasilApi);
registrar(conectorCepViaCep);
