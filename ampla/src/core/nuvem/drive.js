/**
 * GOOGLE DRIVE — o transporte. A base dela mora na conta Google dela.
 *
 * Por que o Drive, e não um serviço novo: "no seu Google Drive" foi a escolha
 * dela, e ela tem razão num ponto que vale mais que conveniência — nunca vai
 * existir fatura, nunca vai existir empresa intermediária, e no dia em que ela
 * quiser parar, é apagar um arquivo da própria conta.
 *
 * O ESCOPO É O MAIS ESTREITO QUE EXISTE: drive.file. Com ele este app enxerga
 * SÓ os arquivos que ele mesmo criou. Fotos, planilhas, contratos, o Drive
 * inteiro dela continua invisível para o app — e isso não é promessa minha, é o
 * Google que garante. É também o que dispensa revisão do Google, porque drive.file
 * não é escopo sensível.
 *
 * NÃO HÁ SEGREDO NESTE ARQUIVO. O Client ID é público por natureza (ele aparece
 * na barra de endereço durante o login); quem protege a conta é a tela de
 * consentimento do Google e a origem autorizada. Mesmo assim ele não vai para o
 * código: ela cola o dela em Ajustes, e fica guardado no aparelho — este
 * repositório é público e nada da empresa dela entra aqui.
 *
 * O QUE ESTA CAMADA FAZ, e só: achar o arquivo, subir, baixar. Toda a decisão de
 * quando sincronizar e quem ganha num conflito mora em logic/nuvem.js, longe
 * daqui, onde dá para testar sem rede.
 */

const GIS = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ESCOPO = 'https://www.googleapis.com/auth/drive.file';
const NOME_ARQUIVO = 'ampla-base.json.gz';

let token = null;        // { valor, expiraEm }
let clienteToken = null;
let clientIdAtual = null;

function agora() { return Date.now(); }

/** Carrega o script do Google uma vez só, e só quando ela liga a sincronização. */
function carregarGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  const jaEsta = document.querySelector(`script[src="${GIS}"]`);
  if (jaEsta && jaEsta.dataset.pronto === 'sim') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = jaEsta || document.createElement('script');
    script.src = GIS;
    script.async = true;
    script.onload = () => { script.dataset.pronto = 'sim'; resolve(); };
    script.onerror = () => reject(new Error('Não consegui carregar o login do Google. Veja a conexão.'));
    if (!jaEsta) document.head.appendChild(script);
  });
}

/**
 * O TOKEN VIVE UMA HORA E NÃO É GUARDADO EM DISCO.
 *
 * Guardar token de acesso no aparelho seria deixar uma chave da conta Google
 * dela escrita no navegador. Ele fica só na memória desta aba: fechou, acabou,
 * e o Google devolve outro sem perguntar nada quando ela já consentiu uma vez.
 */
function pedirToken(clientId, { interativo }) {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('O login do Google não carregou.'));
      return;
    }
    if (!clienteToken || clientIdAtual !== clientId) {
      clientIdAtual = clientId;
      clienteToken = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: ESCOPO,
        callback: () => {},
      });
    }
    clienteToken.callback = (resposta) => {
      if (resposta.error) {
        reject(new Error(resposta.error === 'access_denied'
          ? 'Você não autorizou o acesso ao Drive.'
          : `Google recusou o acesso: ${resposta.error}`));
        return;
      }
      token = {
        valor: resposta.access_token,
        expiraEm: agora() + ((Number(resposta.expires_in) || 3600) - 60) * 1000,
      };
      resolve(token.valor);
    };
    clienteToken.error_callback = (e) => reject(new Error(e?.message || 'Login do Google cancelado.'));
    // '' = sem perguntar nada quando ela já autorizou; 'consent' = a primeira vez
    clienteToken.requestAccessToken({ prompt: interativo ? 'consent' : '' });
  });
}

async function tokenValido(clientId, { interativo = false } = {}) {
  if (token && token.expiraEm > agora()) return token.valor;
  await carregarGis();
  return pedirToken(clientId, { interativo });
}

async function chamar(clientId, url, opcoes = {}) {
  const acesso = await tokenValido(clientId);
  const r = await fetch(url, {
    ...opcoes,
    headers: { Authorization: `Bearer ${acesso}`, ...(opcoes.headers || {}) },
  });
  if (r.status === 401) {
    // token morreu antes da hora: pede outro e tenta uma vez
    token = null;
    const novo = await tokenValido(clientId, { interativo: true });
    const r2 = await fetch(url, {
      ...opcoes,
      headers: { Authorization: `Bearer ${novo}`, ...(opcoes.headers || {}) },
    });
    if (!r2.ok) throw new Error(await mensagemDeErro(r2));
    return r2;
  }
  if (!r.ok) throw new Error(await mensagemDeErro(r));
  return r;
}

async function mensagemDeErro(r) {
  let detalhe = '';
  try {
    const corpo = await r.json();
    detalhe = corpo?.error?.message || '';
  } catch { /* resposta sem JSON: fica só o status */ }
  if (r.status === 403) {
    return `O Google recusou (403). ${detalhe || 'Confira se a Google Drive API está ativada no projeto.'}`;
  }
  if (r.status === 404) return 'O arquivo da base não existe mais no Drive.';
  return `Google Drive respondeu ${r.status}. ${detalhe}`;
}

/** Acha o arquivo da base. Com drive.file, só o que este app criou aparece. */
async function acharArquivo(clientId) {
  const q = encodeURIComponent(`name='${NOME_ARQUIVO}' and trashed=false`);
  const campos = encodeURIComponent('files(id,name,modifiedTime,size,appProperties)');
  const r = await chamar(clientId, `${API}/files?q=${q}&spaces=drive&fields=${campos}&pageSize=10`);
  const { files = [] } = await r.json();
  if (!files.length) return null;
  // o mais recente manda, se por acidente existir mais de um
  return files.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0];
}

function carimboDe(arquivo) {
  const marcado = Number(arquivo?.appProperties?.atualizadoEm);
  if (Number.isFinite(marcado) && marcado > 0) return marcado;
  const modificado = Date.parse(arquivo?.modifiedTime || '');
  return Number.isFinite(modificado) ? modificado : 0;
}

/** O transporte que logic/nuvem.js consome. */
export function transporteDrive(clientId) {
  if (!clientId) throw new Error('Falta o Client ID do Google.');

  return {
    nome: 'Google Drive',

    async conectado() {
      return !!(token && token.expiraEm > agora());
    },

    async conectar() {
      await carregarGis();
      await pedirToken(clientId, { interativo: true });
      return true;
    },

    async desconectar() {
      if (token?.valor && window.google?.accounts?.oauth2?.revoke) {
        try { window.google.accounts.oauth2.revoke(token.valor); } catch { /* já caiu */ }
      }
      token = null;
      clienteToken = null;
    },

    async metadados() {
      const arquivo = await acharArquivo(clientId);
      if (!arquivo) return null;
      return {
        arquivoId: arquivo.id,
        atualizadoEm: carimboDe(arquivo),
        tamanho: Number(arquivo.size) || null,
        dispositivo: arquivo.appProperties?.dispositivo || null,
        registros: Number(arquivo.appProperties?.registros) || null,
      };
    },

    async enviar(blob, props) {
      const existente = await acharArquivo(clientId);
      const metadados = {
        name: NOME_ARQUIVO,
        mimeType: 'application/gzip',
        description: 'Base do aplicativo AMPLA — gerado pelo app, não edite à mão.',
        appProperties: {
          atualizadoEm: String(props.atualizadoEm),
          dispositivo: String(props.dispositivo || ''),
          registros: String(props.registros ?? ''),
        },
      };

      /**
       * Upload multipart: metadados e bytes no mesmo envio. Com um arquivo de
       * algumas centenas de KB não vale a complicação do upload retomável —
       * se cair no meio, a próxima tentativa manda tudo de novo e pronto.
       */
      const limite = `ampla${Math.random().toString(36).slice(2)}`;
      const corpo = new Blob([
        `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify(existente ? { appProperties: metadados.appProperties } : metadados),
        `\r\n--${limite}\r\nContent-Type: application/gzip\r\n\r\n`,
        blob,
        `\r\n--${limite}--`,
      ]);

      const url = existente
        ? `${UPLOAD}/files/${existente.id}?uploadType=multipart&fields=id,modifiedTime`
        : `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`;
      const r = await chamar(clientId, url, {
        method: existente ? 'PATCH' : 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
        body: corpo,
      });
      const salvo = await r.json();
      return { arquivoId: salvo.id, atualizadoEm: props.atualizadoEm };
    },

    async baixar() {
      const arquivo = await acharArquivo(clientId);
      if (!arquivo) throw new Error('Ainda não existe base na nuvem. Envie primeiro, do aparelho que tem os dados.');
      const r = await chamar(clientId, `${API}/files/${arquivo.id}?alt=media`);
      return {
        blob: await r.blob(),
        arquivoId: arquivo.id,
        atualizadoEm: carimboDe(arquivo),
      };
    },
  };
}
