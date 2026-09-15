import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarAlertas } from '../src/products/compliance.ts';
import { mesclarCpf } from '../src/products/cpf.ts';
import type { DadosCompliance, DadosCpf } from '../src/core/types.ts';

function complianceVazio(): DadosCompliance {
  return { documento: '19131243000197', nome: null, pep: null, sancoes: [], dividaAtiva: null, alertas: [] };
}

test('sem achado, o resumo diz isso explicitamente', () => {
  const alertas = montarAlertas(complianceVazio());
  assert.equal(alertas.length, 1);
  assert.match(alertas[0]!, /Nada encontrado/);
});

test('separa sanção vigente de sanção já encerrada', () => {
  const dados = complianceVazio();
  dados.sancoes = [
    { lista: 'CEIS', tipo: null, orgao: null, descricao: null, inicio: '2024-01-01', fim: null, documento: null, nome: null },
    { lista: 'CNEP', tipo: null, orgao: null, descricao: null, inicio: '2015-01-01', fim: '2016-01-01', documento: null, nome: null },
  ];
  const alertas = montarAlertas(dados);

  assert.ok(alertas.some((a) => /1 sanção\(ões\) vigente/.test(a)), alertas.join(' | '));
  assert.ok(alertas.some((a) => /1 sanção\(ões\) já encerrada/.test(a)), alertas.join(' | '));
});

test('PEP e dívida ativa aparecem no resumo', () => {
  const dados = complianceVazio();
  dados.pep = { exposta: true, funcao: 'Prefeito', orgao: null, inicioExercicio: null, fimCarencia: null };
  dados.dividaAtiva = { inscrito: true, quantidade: 3, valorTotal: 12345.67, atualizadoEm: '2026T2' };

  const alertas = montarAlertas(dados);
  assert.ok(alertas.some((a) => a.includes('Prefeito')));
  assert.ok(alertas.some((a) => a.includes('3 inscrição(ões)')));
  assert.ok(alertas.some((a) => a.includes('12.345,67')));
});

function cpfBase(): DadosCpf {
  return {
    cpf: '529.982.247-25', valido: true, nome: null, situacaoCadastral: null, nascimento: null,
    nomeMae: null, telefones: [], emails: [], endereco: null, faixaRenda: null, obito: null,
    participacoesSocietarias: [], camposIndisponiveis: [],
  };
}

test('mesclagem de CPF não deixa fonte posterior sobrescrever dado já obtido', () => {
  const gratis = { ...cpfBase(), nome: 'NOME DA BASE LOCAL' };
  const paga = { ...cpfBase(), nome: 'NOME DO BUREAU', faixaRenda: 'ate 5 salarios' };

  const r = mesclarCpf([{ fonte: 'cpf-local', dados: gratis }, { fonte: 'bureau-cpf', dados: paga }])!;

  assert.equal(r.nome, 'NOME DA BASE LOCAL', 'a primeira fonte tem precedência');
  assert.equal(r.faixaRenda, 'ate 5 salarios', 'lacuna é preenchida pela fonte seguinte');
});

test('camposIndisponiveis é recalculado sobre o resultado final', () => {
  const so_valido = cpfBase();
  const r = mesclarCpf([{ fonte: 'cpf-local', dados: so_valido }])!;

  assert.ok(r.camposIndisponiveis.includes('nome'));
  assert.ok(r.camposIndisponiveis.includes('faixaRenda'));

  const completo = {
    ...cpfBase(),
    nome: 'X', situacaoCadastral: 'REGULAR', nascimento: '1990-01-01', nomeMae: 'Y',
    telefones: ['11 99999-9999'], emails: ['x@y.com'], faixaRenda: 'a', obito: false,
    endereco: { logradouro: null, numero: null, complemento: null, bairro: null, municipio: null, uf: null, cep: null },
  };
  const r2 = mesclarCpf([{ fonte: 'bureau-cpf', dados: completo }])!;
  assert.deepEqual(r2.camposIndisponiveis, []);
});
