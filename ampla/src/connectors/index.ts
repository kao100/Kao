/**
 * Importar este módulo registra todos os conectores.
 * A ordem dos imports não importa: cada conector declara sua posição na
 * cascata pelo campo `ordem`.
 */
import './cnpj-local.ts';
import './cnpj-brasilapi.ts';
import './cep.ts';
import './cpf-local.ts';
import './compliance-transparencia.ts';
import './divida-pgfn-local.ts';
import './processos-datajud.ts';
import './paid/serpro-cpf.ts';
import './paid/bureau-cpf.ts';
