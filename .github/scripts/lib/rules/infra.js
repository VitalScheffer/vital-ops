// Regras de infraestrutura como código (docker-compose, Dockerfile, broker MQTT).
// Ancoradas no mk-configuracao, que é a stack de Redis e Mosquitto.

const COMPOSE = /docker-compose.*\.ya?ml$/i;

const REGRAS_LINHA = [
  {
    id: 'mqtt-anonimo',
    severidade: 'PERIGO',
    categoria: 'Auth',
    regex: /^\s*allow_anonymous\s+true\b/,
    soArquivo: /mosquitto\.conf$/,
    problema: 'Broker MQTT aceitando conexão sem autenticação.',
    recomendacao: 'Mantenha allow_anonymous false com password_file.',
  },
  {
    id: 'redis-sem-senha',
    severidade: 'PERIGO',
    categoria: 'Auth',
    regex: /^\s*command:\s*["']?redis-server(?!.*requirepass)/i,
    soArquivo: COMPOSE,
    problema: 'Redis sem requirepass: quem alcança a porta executa qualquer comando.',
    recomendacao: 'Adicione --requirepass ${REDIS_PASSWORD} ao command.',
  },
  {
    id: 'compose-docker-socket',
    severidade: 'PERIGO',
    categoria: 'Segurança',
    regex: /-\s*["']?\/var\/run\/docker\.sock/,
    soArquivo: COMPOSE,
    problema: 'Montar /var/run/docker.sock dá ao container controle total do host.',
    recomendacao: 'Evite; se for inevitável, use um proxy de socket com escopo restrito.',
  },
  {
    id: 'compose-imagem-sem-tag',
    severidade: 'MODERADO',
    categoria: 'Config',
    // `image: redis:7-alpine` não casa: a classe não aceita `:`, e o `$` exige que a
    // linha termine logo após o nome.
    regex: /^\s*image:\s*[A-Za-z0-9][\w.\-/]*\s*$|^\s*FROM\s+\S+:latest\b/i,
    problema: 'Imagem sem tag fixa (latest implícito ou explícito). Build deixa de ser reprodutível.',
    recomendacao: 'Fixe a versão da imagem.',
  },
];

const REGRAS_CAMINHO = [
  {
    id: 'infra-compose-tocado',
    severidade: 'MODERADO',
    categoria: 'Config',
    teste: (p) => COMPOSE.test(p) || /(^|\/)Dockerfile$/i.test(p),
    problema: 'Definição de infraestrutura alterada.',
    recomendacao: 'Cheque porta publicada, volume, credencial e tag de imagem.',
  },
  {
    id: 'infra-arquivo-de-senha',
    severidade: 'MODERADO',
    categoria: 'Segredo',
    teste: (p) => /(^|\/)(passwd|htpasswd|\.htpasswd)$/.test(p.replace(/\\/g, '/')),
    problema: 'Arquivo de senha do broker rastreado pelo git.',
    recomendacao: 'Gere em runtime e mantenha fora do versionamento.',
  },
];

module.exports = { REGRAS_LINHA, REGRAS_CAMINHO };
