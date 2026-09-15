import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarCpf, validarCnpj, formatarCpf, formatarCnpj,
  identificarDocumento, cpfParaMascaraReceita, mascararCpf, raizCnpj,
} from '../src/core/documents.ts';

test('valida CPF pelo dígito verificador', () => {
  assert.equal(validarCpf('529.982.247-25'), true);
  assert.equal(validarCpf('52998224725'), true);
  assert.equal(validarCpf('529.982.247-26'), false, 'dígito errado');
  assert.equal(validarCpf('111.111.111-11'), false, 'dígitos repetidos não existem');
  assert.equal(validarCpf('123'), false);
  assert.equal(validarCpf(''), false);
});

test('valida CNPJ pelo dígito verificador', () => {
  assert.equal(validarCnpj('19.131.243/0001-97'), true);
  assert.equal(validarCnpj('19131243000197'), true);
  assert.equal(validarCnpj('19131243000198'), false);
  assert.equal(validarCnpj('00.000.000/0000-00'), false);
});

test('formata documentos', () => {
  assert.equal(formatarCpf('52998224725'), '529.982.247-25');
  assert.equal(formatarCnpj('19131243000197'), '19.131.243/0001-97');
});

test('identifica o tipo do documento', () => {
  assert.equal(identificarDocumento('529.982.247-25'), 'cpf');
  assert.equal(identificarDocumento('19131243000197'), 'cnpj');
  assert.equal(identificarDocumento('12345'), 'invalido');
});

test('máscara de CPF esconde os mesmos dígitos que a Receita esconde', () => {
  // A Receita publica ***982247** para o CPF 529.982.247-25.
  assert.equal(cpfParaMascaraReceita('52998224725'), '***982247**');
  assert.equal(mascararCpf('52998224725'), '***.982.247-**');
});

test('raiz do CNPJ são os 8 primeiros dígitos', () => {
  assert.equal(raizCnpj('19.131.243/0001-97'), '19131243');
});
