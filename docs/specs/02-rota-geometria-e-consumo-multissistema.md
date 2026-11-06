# Spec: Geometria de Rota e Consumo Multissistema

> **Microsserviço:** `Squamata-cep`
> **Arquitetura:** ESM (ECMAScript Modules) nativo · **Comportamento:** *stateless* (sem estado de negócio)
> **Padrão de pastas:** MSC (Model-Service-Controller)
> **Base:** estende [01-endpoints-distancia.md](./01-endpoints-distancia.md) — esta spec é **incremental** e não substitui a 01.

---

## 1. Contexto e Objetivo

A [spec 01](./01-endpoints-distancia.md) entregou o serviço como validador de CEP e calculadora de distância entre dois pontos. Esta spec eleva o `Squamata-cep` ao papel de **capacidade geográfica compartilhada do ecossistema**: qualquer sistema (Calango Food, Calango Bot, Marianos Meat, Squamata Headless ou integrações futuras) consome o **mesmo contrato** e recebe endereço, coordenadas, distância e **geometria da rota** — sem reimplementar geocoding, Haversine ou chamadas ao Mapbox.

**Regra central:** o `Squamata-cep` **fornece dados; quem desenha é o consumidor.** Nenhuma página, HTML, asset visual ou chave de mapa exposta sai deste serviço.

Motivação imediata: hoje é **impossível desenhar a rota** (ver §3). O Calango Food é o **primeiro consumidor de referência** (§9), não o dono do serviço — o requisito de mapa é do consumidor, a capacidade é do Squamata-cep.

---

## 2. Princípios de Reutilização (multi-consumidor)

Toda decisão de implementação deve respeitar os princípios abaixo. Eles existem para que o serviço continue reutilizável quando o segundo, terceiro e décimo consumidor aparecerem.

| # | Princípio | Consequência prática |
| --- | --- | --- |
| 1 | **Contrato versionado** | Tudo em `/api/v1`; `/api` fica como alias legado por um ciclo |
| 2 | **Payload neutro (domínio geo, não delivery)** | Nada de `taxaMotoboy`, `pedidoId` ou nomes de app no contrato |
| 3 | **Evolução aditiva** | Campos novos nunca removem nem renomeiam campos existentes |
| 4 | **Zero estado de negócio** | Cache apenas derivado, com TTL, descartável a qualquer momento (§6.3) |
| 5 | **Zero UI** | O serviço não serve HTML, imagem ou asset de mapa |
| 6 | **Localização parametrizável** | `country` (default `br`) e `language` (default `pt`) por requisição |
| 7 | **Rastreabilidade por consumidor** | Header opcional `X-Consumer-ID` para log e, futuramente, rate limit |
| 8 | **Falha isolada (satélite)** | Erro externo retorna JSON rastreável (HTTP 502/500); nunca derruba o chamador |

> **Por que `X-Consumer-ID` importa:** com vários sistemas consumindo a mesma cota do Mapbox, sem identificação não há como diagnosticar abuso, medir custo por app ou aplicar limites diferenciados. O header é **opcional** (ausente = `unknown`) e nunca altera a resposta.

---

## 3. Estado Atual e Lacunas

| Lacuna | Evidência | Impacto |
| --- | --- | --- |
| **Sem geometria de rota** | [`fetchDrivingRoute`](../../src/services/MapboxService.js) usa a **Matrix API** e extrai apenas `distances`/`durations` | Não existe linha para desenhar em nenhum consumidor |
| **Coordenadas descartadas** | [`calculateDistance`](../../src/controllers/CepController.js) geocodifica e não devolve `coordenadasOrigem`/`coordenadasDestino` | Nem um deep link do Google Maps é possível hoje |
| **Sem versão de API** | [server.js](../../server.js) monta `/api` puro; health é `/` | Contradiz a [ADR 002](../../../Calango-docs/docs/ADRs/002-versionamento-de-api.md) |
| **Sem cache** | Toda chamada repete ViaCEP + Geocoding | Cota do Mapbox e latência desperdiçadas a cada request |
| **Sem fallback de CEP** | [`fetchAddressByCep`](../../src/services/ViaCepService.js) depende só do ViaCEP | Indisponibilidade do ViaCEP derruba `/distancia` para 502 |
| **Sem testes** | `npm test` é stub (`exit 1`) | Nenhuma garantia de regressão ao evoluir o contrato |

---

## 4. Contrato Alvo (v1)

### 4.1. `GET /api/v1/cep/:cep`

Idêntico ao contrato da spec 01, com dois acréscimos:

| Campo novo | Descrição |
| --- | --- |
| `coordenadas` | `{ latitude, longitude }` obtidas por geocoding (aproveita o cache) |
| `fonte` | `"viacep"` ou `"brasilapi"` — origem do dado (§6.2) |

### 4.2. `POST /api/v1/distancia`

**Request:**

```json
{
  "cepOrigem": "06000000",
  "cepDestino": "06100000",
  "calcularRota": true,
  "incluirGeometria": true,
  "perfil": "driving",
  "pais": "br",
  "idioma": "pt"
}
```

| Campo | Obrigatório? | Default | Descrição |
| --- | --- | --- | --- |
| `cepOrigem` / `cepDestino` | Sim | — | CEPs no formato livre (o serviço normaliza) |
| `calcularRota` | Não | `false` | Se `true`, calcula rota por ruas |
| `incluirGeometria` | Não | `true` quando `calcularRota: true` | `false` → resposta sem `rota.geometria` (menor payload) |
| `perfil` | Não | `driving` | `driving`, `driving-traffic`, `walking`, `cycling` |
| `pais` / `idioma` | Não | `br` / `pt` | Restringe geocoding e idioma dos endereços |

**Response `200`:**

```json
{
  "cepOrigem": "06000000",
  "cepDestino": "06100000",
  "enderecoOrigem": { "cep": "06000-000", "logradouro": "...", "bairro": "...", "localidade": "...", "uf": "SP", "fonte": "viacep" },
  "enderecoDestino": { "...": "..." },
  "coordenadasOrigem": { "latitude": -23.5321, "longitude": -46.7912 },
  "coordenadasDestino": { "latitude": -23.5011, "longitude": -46.7654 },
  "distanciaLinhaRetaKm": 12.34,
  "rota": {
    "perfil": "driving",
    "distanciaKm": 15.2,
    "duracaoMin": 27,
    "bbox": [-46.8010, -23.5402, -46.7600, -23.4950],
    "geometria": {
      "type": "LineString",
      "coordinates": [[-46.7912, -23.5321], [-46.7801, -23.5201], [-46.7654, -23.5011]]
    }
  },
  "distanciaRotaKm": 15.2,
  "duracaoEstimadaMin": 27
}
```

> `distanciaRotaKm` e `duracaoEstimadaMin` no topo permanecem **deprecated** por um ciclo para não quebrar consumidores da spec 01. O objeto `rota` é o formato definitivo.

### 4.3. `POST /api/v1/raio`

Verificação de área de cobertura — custo zero de Directions (Haversine puro).

```json
// request
{ "cepReferencia": "06000000", "cepAlvo": "06100000", "raioKm": 5 }

// response 200
{
  "cepReferencia": "06000000",
  "cepAlvo": "06100000",
  "coordenadasReferencia": { "latitude": -23.5321, "longitude": -46.7912 },
  "coordenadasAlvo": { "latitude": -23.5011, "longitude": -46.7654 },
  "distanciaLinhaRetaKm": 7.8,
  "raioKm": 5,
  "dentroDoRaio": false
}
```

### 4.4. `POST /api/v1/matriz`

Matriz N×N para vários pontos (ex.: vários entregadores contra vários clientes). É o **único** caso em que a Matrix API faz sentido.

```json
// request
{ "ceps": ["06000000", "06100000", "06200000"], "perfil": "driving" }

// response 200
{
  "coordenadas": [
    { "cep": "06000000", "latitude": -23.5321, "longitude": -46.7912 },
    { "cep": "06100000", "latitude": -23.5011, "longitude": -46.7654 },
    { "cep": "06200000", "latitude": -23.4900, "longitude": -46.7500 }
  ],
  "distancias": [[0, 3.1, 5.4], [3.1, 0, 2.4], [5.4, 2.4, 0]],
  "duracoesMin": [[0, 9, 14], [9, 0, 7], [14, 7, 0]]
}
```

**Limites:** mínimo 2 e máximo 25 pontos (teto do free tier do Mapbox); acima disso → `400`.

### 4.5. `GET /api/v1/health`

```json
{
  "status": "ok",
  "service": "squamata-cep",
  "version": "1.0.0",
  "uptimeS": 1234,
  "deps": { "mapbox": "ok", "viacep": "ok", "brasilapi": "ok" }
}
```

`status` é `ok` desde que o processo esteja de pé; `deps.mapbox` é `"missing"` quando `MAPBOX_API_KEY` não está configurada — o health **não** retorna 500 por falta de chave (regra herdada da spec 01 §5).

### 4.6. Contrato de erro (todos os endpoints)

| Situação | HTTP | Corpo |
| --- | --- | --- |
| Campo obrigatório ausente | `400` | `{ "erro": "..." }` |
| CEP com formato inválido (≠ 8 dígitos) | `400` | `{ "erro": "CEP inválido: ..." }` |
| CEP inexistente (`erro: true`) | `404` | `{ "erro": "CEP não encontrado: ..." }` |
| Endereço não geocodificável | `404` | `{ "erro": "Endereço não encontrado pelo Mapbox Geocoding" }` |
| Dependência externa falhou/timeout | `502` | `{ "erro": "Falha ao consultar <dependência>", "operacao": "..." }` |
| `MAPBOX_API_KEY` ausente em rota que a exige | `500` | `{ "erro": "MAPBOX_API_KEY não configurada no .env" }` |

O log estruturado (`service`, `operation`, `status`, `message` + `consumerId` quando houver header) é obrigatório em todas as falhas.

---

## 5. Geometria: Directions x Matrix

| Aspecto | Mapbox **Matrix** API (atual) | Mapbox **Directions** API (proposta) |
| --- | --- | --- |
| Distância / duração | ✅ | ✅ |
| **Geometria da rota** | ❌ | ✅ `routes[0].geometry` (GeoJSON) |
| Melhor caso de uso | N×N (muitos para muitos) | 1×1 (origem→destino) |
| Custo por request | 1 | 1 |
| Uso nesta spec | Apenas `/api/v1/matriz` | `/api/v1/distancia` com `calcularRota: true` |

**Chamada alvo:**

```text
GET https://api.mapbox.com/directions/v5/mapbox/{perfil}/{lng1},{lat1};{lng2},{lat2}
    ?geometries=geojson&overview=full&steps=false&access_token={MAPBOX_API_KEY}
```

- `geometries=geojson` evita decodificar polyline no consumidor (qualquer lib de mapa lê GeoJSON).
- `overview=full` mantém a forma da via; quando o consumidor passar `incluirGeometria: false`, usar `overview=simplified` ou omitir.
- `bbox` vem no payload de `routes[0]` e evita cálculo de enquadramento no frontend.

> **Alternativa sem cota (desenvolvimento):** OSRM público (`https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson`) devolve o mesmo formato de geometria, sem token e sem SLA. Útil para testes e para ambientes sem `MAPBOX_API_KEY`.

---

## 6. Cache e Fallback

### 6.1. Cache (best-effort)

| Alvo | TTL sugerido | Chave |
| --- | --- | --- |
| ViaCEP / BrasilAPI | 30 dias | CEP normalizado |
| Mapbox Geocoding | 30 dias | `query` normalizada + `pais` + `idioma` |
| Mapbox Directions | 60–300 s | coords com 5 casas decimais + `perfil` |

Regras:

1. O cache **nunca** pode causar erro: `get`/`set` são tolerantes a falha e o fluxo segue para a chamada externa.
2. Implementação inicial sem dependência nova: `Map` + `timestamp` com poda simples. `lru-cache` só se o volume justificar.
3. O cache é **descartável**: reiniciar o processo deve devolver o serviço ao comportamento original sem qualquer perda funcional.

### 6.2. Fallback de CEP

| Situação | Ação |
| --- | --- |
| ViaCEP `404` / `erro: true` | **Não** usar fallback → `404` (CEP não existe) |
| ViaCEP timeout / `5xx` / conexão recusada | Tentar BrasilAPI (`https://brasilapi.com.br/api/cep/v1/{cep}`) |
| BrasilAPI também falha | `502` com log das duas tentativas |

As duas fontes devem ser **normalizadas para o mesmo shape** (`cep`, `logradouro`, `bairro`, `localidade`, `uf`) e a origem exposta em `fonte`.

### 6.3. Governança: tensão com o "stateless"

A spec 01 afirma que "nenhuma informação pode ser armazenada em memória local entre requisições". Cache derivado com TTL **não é estado de negócio**, mas a decisão precisa ser formalizada antes da implementação:

- **ADR nova** em `Calango-docs/docs/ADRs` (ex.: `006-cache-geografico-e-geometria-de-rota.md`) declarando o cache como *best-effort* e derivado;
- **ajuste no §1 da spec 01** explicitando a exceção.

Sem isso, a Fase 2 nasce fora do contrato declarado.

---

## 7. Versionamento e Compatibilidade

| Rota | Status |
| --- | --- |
| `/api/v1/...` | **Canônica** |
| `/api/...` | Alias legado (mesmos handlers), removido após um ciclo |
| `/` | Landing de smoke test (mantida — o smoke do Calango-docs depende dela) |

- Montar o mesmo router em `/api/v1` e `/api` (`src/routes/index.js`), evitando duplicação de código.
- Toda mudança desta spec é **aditiva**: nenhum campo existente é removido ou renomeado.

---

## 8. Estrutura de Pastas Desejada

```text
src/
├── controllers/
│   └── CepController.js       # + handlers de raio e matriz
├── services/
│   ├── ViaCepService.js       # + fallback BrasilAPI
│   ├── MapboxService.js       # + fetchDirections (geometria) | Matrix só em matriz
│   └── CacheService.js        # NOVO — cache TTL best-effort
├── utils/
│   └── geoUtils.js            # Haversine (inalterado)
├── routes/
│   ├── cepRoutes.js           # rotas (sem prefixo)
│   └── index.js               # NOVO — monta /api/v1 + alias /api
server.js                      # importa o router único
```

---

## 9. Consumidor de Referência: Calango Food

O Calango Food é o **cliente de exemplo** desta capacidade. O que ele faz aqui não deve vazar para o contrato do serviço — é apenas o primeiro consumidor.

### 9.1. Integração no frontend

| Arquivo | Papel |
| --- | --- |
| `packages/frontend/src/services/cepApi.js` **(novo)** | Instância axios com `normalizeApiBase(VITE_SQUAMATA_CEP_URL ?? 'http://localhost:3011')`; funções `getCep`, `calcularDistancia`, `verificarRaio`. Reaproveita o helper `normalizeApiBase` de `src/services/apiBase.js` (ADR 002). Sem interceptor de JWT. |
| `packages/frontend/src/components/RouteMap.jsx` **(novo)** | Mapa Leaflet: `MapContainer` + `TileLayer` OSM + `Polyline` da `rota.geometria` + `Marker` origem/destino + `fitBounds(rota.bbox)`. Estados de loading/erro/sem rota. |
| `packages/frontend/src/pages/Entregadores.jsx` | Consumo principal: rota restaurante → entregador. |
| `packages/frontend/src/pages/CheckoutPage.jsx` | Bloqueio por área de cobertura via `/api/v1/raio`. |
| `packages/frontend/.env` | `VITE_SQUAMATA_CEP_URL=http://localhost:3011` |

**Dependências:** `leaflet` + `react-leaflet@^5` (compatível com React 19, usado pelo projeto) + CSS do Leaflet. Tiles do OpenStreetMap → **sem token no browser**.

### 9.2. Fluxo ponta a ponta

```text
Cliente informa CEP no checkout
   → POST /api/v1/raio  (área de cobertura?)        → bloqueia ou libera pedido
   → POST /api/v1/distancia { calcularRota: true }
   → resposta com rota.geometria (GeoJSON) + bbox
   → RouteMap desenha Polyline + Markers e enquadra com fitBounds
```

### 9.3. Diretriz

- O Calango Food **não** fala com ViaCEP nem com Mapbox. Só com o Squamata-cep.
- `RouteMap` mora no frontend do produto; o Squamata-cep **não** ganha página de debug, `public/` ou dependência de renderização.
- CORS já liberado no serviço ([server.js](../../server.js)); porta local **3011**.

---

## 10. Outros Consumidores Previstos

| Sistema | Caso de uso | Precisa de mapa? |
| --- | --- | --- |
| **Calango Food** | Área de cobertura, rota restaurante→cliente/entregador, matriz de entregadores | ✅ (frontend) |
| **Calango Bot (WhatsApp)** | Validar CEP do cliente, decidir se entrega, informar prazo | ❌ (só km/min) |
| **Marianos Meat** | Mesma lógica de entrega própria, reutilizando o contrato | ✅ (quando houver painel) |
| **Squamata Headless (Payload)** | Endereço/coordenadas de lojas e pontos de retirada | ✅ |
| **Squamata Login** | Endereço do usuário/tenant no cadastro | ❌ |
| **Squamata Gateway** | Não consome geodados | — |

> O contrato de §4 é suficiente para todos: quem precisa de números usa `distanciaLinhaRetaKm`/`rota.distanciaKm`; quem precisa desenhar usa `rota.geometria` + `rota.bbox`.

---

## 11. Fases de Implementação

| Fase | Escopo | Critério de aceite |
| --- | --- | --- |
| **0 — Geometria** | `fetchDirections` (geojson + overview full + bbox), `coordenadasOrigem`/`Destino` no payload, objeto `rota` | `calcularRota: true` devolve `rota.geometria` com ≥ 2 coordenadas; `calcularRota` ausente mantém a resposta antiga |
| **1 — v1 + health** | `src/routes/index.js`, `/api/v1`, alias `/api`, `/api/v1/health`, `X-Consumer-ID` no log | `/api/v1/distancia` e `/api/distancia` com payload idêntico; health 200 sem chave |
| **2 — Cache + fallback** | `CacheService`, TTLs, fallback BrasilAPI + `fonte`; **ADR e ajuste da spec 01 antes** | 2ª chamada do mesmo CEP não bate no ViaCEP; ViaCEP `5xx` responde via BrasilAPI; `404` não usa fallback |
| **3 — Novos endpoints** | `/api/v1/raio`, `/api/v1/matriz` (2–25 pontos) | Raio responde `dentroDoRaio` sem chamar Directions; matriz devolve N×N e `400` acima de 25 |
| **4 — Mapas no consumidor** | `cepApi.js` + `RouteMap.jsx` + integração Entregadores/Checkout no Calango Food | Rota desenhada com origem, destino e enquadramento correto em `localhost` |
| **5 — Testes e docs** | `node:test` + `supertest`; atualizar spec 01, README, smoke manifest do Calango-docs | `npm test` cobre Haversine, 400/404/502, geometria, cache e fallback |

**Ordem recomendada:** 0 → 1 → 4 → 2 → 3 → 5 (mapa visível antes do investimento em cache e endpoints novos).

---

## 12. Riscos e Mitigações

| Risco | Mitigação |
| --- | --- |
| Consumo de cota Mapbox por múltiplos sistemas | Cache de geocoding por CEP + `incluirGeometria: false` quando não for desenhar + `X-Consumer-ID` para medir custo por app |
| Cache conflitando com o "stateless" da spec 01 | ADR + ajuste explícito do §1 antes da Fase 2 |
| Payload grande com `overview=full` | `overview=simplified` por default quando `incluirGeometria: false`; `bbox` para enquadrar |
| Chave Mapbox exposta no browser | O frontend nunca fala com o Mapbox; a chave fica apenas no `.env` do serviço |
| Acoplamento do serviço a um app | Payload neutro (§2.2); nenhuma referência a delivery, pedido ou tenant no contrato |
| `react-leaflet` incompatível com React 19 | Usar a v5; alternativa `mapbox-gl`/`maplibre-gl` fica fora de escopo |
| Rate limit ausente com vários consumidores | Fase 3+ adicionar limite por `X-Consumer-ID`; hoje documentar como risco aceito |

---

## 13. Critérios de Aceite (Checklist)

- [ ] `POST /api/v1/distancia` com `calcularRota: true` retorna `rota.geometria` GeoJSON (`LineString`) e `rota.bbox`.
- [ ] `POST /api/v1/distancia` devolve `coordenadasOrigem` e `coordenadasDestino`.
- [ ] `calcularRota` ausente/false **não** chama Directions nem Matrix.
- [ ] `/api/v1/*` e `/api/*` respondem o mesmo payload (alias funcional).
- [ ] `GET /api/v1/health` retorna `deps.mapbox: "missing"` sem `MAPBOX_API_KEY` e HTTP 200.
- [ ] `GET /api/v1/cep/:cep` inclui `coordenadas` e `fonte`.
- [ ] Fallback BrasilAPI atua **apenas** em falha do ViaCEP, nunca em CEP inexistente.
- [ ] `POST /api/v1/raio` e `POST /api/v1/matriz` respeitam os contratos de §4.3 e §4.4.
- [ ] `npm test` executa e cobre os cenários da Fase 5.
- [ ] Nenhum arquivo HTML/assets de mapa adicionados ao `Squamata-cep`.
- [ ] ADR de cache/geometria registrada em `Calango-docs/docs/ADRs`.

---

## 14. Fora de Escopo

- Roteirização com múltiplas paradas otimizadas (TSP) ou `optimization` API.
- Rastreamento em tempo real (posição do entregador) — pertence ao transport, não a este serviço.
- Geocoding reverso por coordenada (pode virar spec 03).
- Renderização de mapa, tiles, HTML ou página de debug dentro do `Squamata-cep`.
- Autenticação/autorização entre serviços (o serviço segue satélite e público na rede interna).
