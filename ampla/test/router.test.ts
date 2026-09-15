import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, type Conector } from '../src/core/registry.ts';
import { rotear } from '../src/core/router.ts';

// 'divida-ativa' não tem conector real registrado: serve de produto de teste.
const PRODUTO = 'divida-ativa' as const;

let chamadasPaga = 0;
let chamadasGratis = 0;

const gratis: Conector<{ de: string; campos: string[] }> = {
  id: 'teste-gratis',
  produto: PRODUTO,
  descricao: 'fonte gratuita de teste',
  tipoFonte: 'local',
  custoCentavos: 0,
  ordem: 10,
  disponivel: () => ({ ok: true }),
  async consultar(entrada) {
    chamadasGratis++;
    return entrada === 'vazio' ? null : { de: 'gratis', campos: ['basico'] };
  },
};

const paga: Conector<{ de: string; campos: string[] }> = {
  id: 'teste-paga',
  produto: PRODUTO,
  descricao: 'fonte paga de teste',
  tipoFonte: 'paga',
  custoCentavos: 50,
  ordem: 100,
  disponivel: () => ({ ok: true }),
  async consultar() {
    chamadasPaga++;
    return { de: 'paga', campos: ['basico', 'caro'] };
  },
};

const quebrada: Conector<never> = {
  id: 'teste-quebrada',
  produto: PRODUTO,
  descricao: 'fonte que falha',
  tipoFonte: 'publica',
  custoCentavos: 0,
  ordem: 20,
  disponivel: () => ({ ok: true }),
  async consultar() {
    throw new Error('fonte fora do ar');
  },
};

registrar(gratis);
registrar(quebrada);
registrar(paga);

const opcoesBase = { produto: PRODUTO, finalidade: 'teste', usarCache: false } as const;

test('modo "primeira" para na fonte mais barata e não toca na paga', async () => {
  chamadasPaga = 0;
  const r = await rotear<{ de: string }>({ ...opcoesBase, consulta: 'x', modo: 'primeira' });

  assert.equal(r.encontrado, true);
  assert.equal(r.dados?.de, 'gratis');
  assert.equal(r.custoTotalCentavos, 0);
  assert.equal(chamadasPaga, 0, 'a fonte paga não deve ser chamada');
});

test('falha de uma fonte não derruba a cascata', async () => {
  const r = await rotear<{ de: string }>({ ...opcoesBase, consulta: 'vazio', modo: 'agregar' });

  const relatorioQuebrada = r.fontes.find((f) => f.fonte === 'teste-quebrada');
  assert.equal(relatorioQuebrada?.ok, false);
  assert.equal(relatorioQuebrada?.motivo, 'fonte_indisponivel');
  // A gratuita devolveu null e a quebrada explodiu, então sobrou a paga.
  assert.equal(r.encontrado, true);
  assert.equal(r.dados?.de, 'paga');
  assert.equal(r.custoTotalCentavos, 50);
});

test('"suficiente" interrompe antes da fonte paga', async () => {
  chamadasPaga = 0;
  const r = await rotear<{ de: string; campos: string[] }>({
    ...opcoesBase,
    consulta: 'y',
    modo: 'agregar',
    mesclar: (parciais) => parciais[parciais.length - 1]!.dados,
    suficiente: (dados) => dados.campos.includes('basico'),
  });

  assert.equal(chamadasPaga, 0, 'gratuita já bastou');
  assert.equal(r.custoTotalCentavos, 0);
});

test('fonte indisponível vira degrau pulado, não erro', async () => {
  registrar({
    id: 'teste-desligada',
    produto: PRODUTO,
    descricao: 'desligada',
    tipoFonte: 'paga',
    custoCentavos: 99,
    ordem: 5,
    disponivel: () => ({ ok: false, motivo: 'fonte_desabilitada', detalhe: 'sem contrato' }),
    consultar: async () => ({ de: 'nunca' }),
  } as Conector<{ de: string }>);

  const r = await rotear<{ de: string }>({ ...opcoesBase, consulta: 'z', modo: 'primeira' });
  const desligada = r.fontes.find((f) => f.fonte === 'teste-desligada');

  assert.equal(desligada?.ok, false);
  assert.equal(desligada?.motivo, 'fonte_desabilitada');
  assert.equal(desligada?.custoCentavos, 0);
  assert.equal(r.dados?.de, 'gratis');
});

test('registrar o mesmo conector duas vezes é erro', () => {
  assert.throws(() => registrar(gratis), /duplicado/);
  assert.ok(chamadasGratis > 0);
});
