# DBX — Playlists M3U e API

Este repositório reúne as playlists públicas de [Ramys/Iptv-Brasil-2026](https://github.com/Ramys/Iptv-Brasil-2026).

## M3U

A playlist completa mantém o mesmo endereço público:

https://github.com/duduxweb/dbx/releases/download/playlist-latest/playlist.m3u

O fluxo também gera um arquivo M3U para cada valor de `group-title` encontrado nas fontes. O índice lista nomes, IDs, tamanhos e nomes dos arquivos:

https://github.com/duduxweb/dbx/releases/download/playlist-latest/categories-index.json

Os arquivos individuais ficam na mesma Release com o nome `category-<slug>.m3u`. A lista completa continua sendo publicada junto deles.

## API compatível com Xtream

O código do endpoint está em `api/worker.js`, preparado para Cloudflare Workers. Ele oferece uma parte da API Xtream, incluindo consulta de categorias e canais, além de uma rota M3U. A compatibilidade depende do aplicativo aceitar essa API; aplicativos que aceitam apenas URL M3U devem usar os links acima.

O GitHub publica arquivos estáticos, mas não executa os endpoints dinâmicos da API. Para obter um endereço de API, é necessário implantar o Worker em um serviço de execução, como Cloudflare Workers. O código está preparado, mas ainda não foi implantado nem testado em uma conta Cloudflare.

Na implantação, configure `API_USERNAME` e `API_PASSWORD` como segredos do Worker. Não coloque esses valores no repositório. Configure também a autenticação de deploy do Cloudflare somente no ambiente de implantação.

## Atualização

O GitHub Actions busca as fontes e publica a playlist completa, os arquivos por categoria e o índice diariamente às 08:17 UTC (05:17 em Recife), além de executar após alterações no repositório ou manualmente.
