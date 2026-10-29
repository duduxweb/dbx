# DBX — Playlists M3U e API

Este repositório reúne playlists públicas geradas a partir de [Ramys/Iptv-Brasil-2026](https://github.com/Ramys/Iptv-Brasil-2026).

## M3U

Playlist completa:
https://github.com/duduxweb/dbx/releases/download/playlist-latest/playlist.m3u

Índice de categorias:
https://github.com/duduxweb/dbx/releases/download/playlist-latest/categories-index.json

Cada categoria também é publicada como um M3U separado, com o nome `category-<slug>.m3u`, na Release `playlist-latest`. Os links diretos ficam no índice. A playlist completa permanece disponível no mesmo endereço.

## API compatível com Xtream

A API tem rotas preparadas para implantação na Vercel:

- `/player_api.php`: autenticação, categorias e canais filtrados por categoria.
- `/get.php`: redireciona para a playlist completa ou para uma categoria usando `category_id`.
- `/live/<username>/<password>/<stream_id>.ts`: redireciona para o endereço do canal.

`get_live_streams` aceita `category_id` para consultar uma categoria ou, sem esse parâmetro, retorna todos os canais ao vivo com seus `direct_source` originais. A lista completa é transmitida em blocos JSON. Categorias cujo asset M3U não existe são ignoradas na resposta agregada. `get_vod_streams` continua exigindo `category_id`. A rota M3U redireciona para o arquivo hospedado no GitHub, sem passar os 337 MB pela função da Vercel. A compatibilidade depende de o aplicativo aceitar esse subconjunto Xtream e redirecionamentos HTTP.

### Implantação

1. Importe este repositório na Vercel.
2. Em **Project Settings → Environment Variables**, configure `API_USERNAME` e `API_PASSWORD` como valores privados.
3. Faça o deploy e use o domínio gerado pela Vercel como servidor.

Exemplos, substituindo o domínio e as credenciais pelos seus:

- Servidor Xtream: `https://SEU-PROJETO.vercel.app`
- Player API: `https://SEU-PROJETO.vercel.app/player_api.php?username=USUARIO&password=SENHA`
- M3U completa: `https://SEU-PROJETO.vercel.app/get.php?username=USUARIO&password=SENHA`

Não grave credenciais no repositório. A API só ficará acessível depois que o projeto for importado, as variáveis forem configuradas e o deploy terminar.

## Atualização

O GitHub Actions busca as fontes e publica a playlist completa, os arquivos por categoria e o índice diariamente às 08:17 UTC (05:17 em Recife).
