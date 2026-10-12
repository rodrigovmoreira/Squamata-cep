# Spec: Endpoints de Consulta de CEP e Distância Geográfica

> **Microsserviço:** `Squamata-cep`
> **Arquitetura:** ESM (ECMAScript Modules) nativo · **Comportamento:** *stateless* (sem estado)
> **Padrão de pastas:** MSC (Model-Service-Controller)

---

## 1. Contexto e Objetivo

O `Squamata-cep` atua como o **motor de logística e validação geográfica** do ecossistema Calango Inc.

Esta tarefa consiste em construir dois endpoints principais:

1. **Validação de CEP** (ViaCEP);
2. **Cálculo de distância entre dois CEPs** (ViaCEP + Mapbox Geocoding + Haversine).

O serviço deve permanecer **sem estado** (`stateless`): nenhuma informação pode ser armazenada em memória local entre requisições.

---

## 2. Endpoints a serem criados

### 2.1. `GET /api/cep/:cep`

| Propriedade | Descrição |
| --- | --- |
| **Objetivo** | Validar um CEP único e retornar o endereço. |
| **Fonte** | API pública do ViaCEP (`https://viacep.com.br/ws/{cep}/json/`). |
| **Sucesso** | `200` com os dados do endereço formatados. |
| **CEP inválido** | `404` com mensagem de erro. |

**Fluxo:**

1. Limpar a string recebida (remover hífens e espaços).
2. Consultar a API pública do ViaCEP.
3. Retornar os dados formatados ou erro `404` caso o CEP seja inválido.

### 2.2. `POST /api/distancia`

| Propriedade | Descrição |
| --- | --- |
| **Objetivo** | Calcular a distância em KM entre dois CEPs (Restaurante ↔ Cliente ou Restaurante ↔ Entregador). |
| **Fonte** | ViaCEP (endereço) + Mapbox Geocoding (coordenadas) + Haversine (cálculo). |

**Payload Esperado (Body):**

```json
{
  "cepOrigem": "06000000",
  "cepDestino": "06100000"
}
```

**Fluxo Lógico (Fail Fast):**

1. Validar se os dois CEPs foram enviados.
2. Consultar o ViaCEP para obter o Estado, Cidade e Logradouro de ambos.
3. Consultar a API de Geocoding do Mapbox para converter os dois endereços em coordenadas (Latitude e Longitude).
4. Utilizar a fórmula de Haversine (implementada nativamente no Node.js, sem dependências externas) para calcular a distância em linha reta (em KM) entre as duas coordenadas.
5. Retornar o resultado unificado.

---

## 3. O Cálculo de Distância (3 etapas)

Para calcular a distância entre dois CEPs, o fluxo lógico exige três etapas:

### 3.1. CEP → Endereço (ViaCEP)

Usamos o **ViaCEP** (100% gratuito e sem limites) para garantir que o CEP existe e obter a rua/cidade.

- **Endpoint:** `GET https://viacep.com.br/ws/{cep}/json/`
- **Campos úteis do retorno:** `cep`, `logradouro`, `bairro`, `localidade` (cidade), `uf` (estado) e `erro` (presente quando o CEP não existe).

### 3.2. Endereço → Coordenadas (Geocoding com Mapbox)

APIs de rota não entendem CEPs brasileiros diretamente — elas precisam de **Latitude** e **Longitude**. O **Mapbox** é a melhor escolha de mercado: o plano gratuito dá direito a **100.000 requisições por mês**.

- **Endpoint:** `GET https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json`

| Parâmetro | Descrição |
| --- | --- |
| `query` | Endereço montado (ex.: `Rua X, Bairro Y, Cidade Z, UF`). |
| `access_token` | Chave do Mapbox (`MAPBOX_API_KEY`). |
| `country=br` | Limita a busca ao Brasil (recomendado). |
| `limit=1` | Retorna apenas o resultado mais relevante. |

- **Coordenadas de retorno:** `features[0].center` → `[longitude, latitude]` (⚠️ **atenção à ordem invertida**).

### 3.3. Cálculo da Distância

#### Opção A — Raio de Entrega (Custo Zero): Fórmula de Haversine

Utiliza a **Fórmula de Haversine** nativamente no Node.js (sem dependências externas). Calcula a distância em "linha reta" (ortodrômica) — perfeita para bloquear clientes fora da área de cobertura (ex.: *"só entregamos num raio de 5 km"*).

**Fórmula:**

$$
a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1) \cdot \cos(\phi_2) \cdot \sin^2\left(\frac{\Delta\lambda}{2}\right)
$$

$$
d = 2R \cdot \arcsin\left(\sqrt{a}\right)
$$

Onde:

- $\phi_1$, $\phi_2$ → latitudes dos dois pontos (em **radianos**);
- $\Delta\phi$ → diferença de latitude;
- $\Delta\lambda$ → diferença de longitude;
- $R$ → raio médio da Terra = **6371 km**.

#### Opção B — Distância de Carro: Mapbox Matrix API

Utiliza a **Mapbox Matrix API** (também inclusa no pacote gratuito) para saber exatamente quantos km o motoboy vai rodar **considerando as ruas**.

- **Endpoint:** `GET https://api.mapbox.com/directions-matrix/v1/mapbox/driving/{coords}`
- **Parâmetros:** `coords` no formato `lng1,lat1;lng2,lat2` e `access_token`.
- **Retorno relevante:** `durations` (segundos) e `distances` (metros).

> **Escopo desta spec:** implementamos apenas a **Opção A (Haversine)**. A Opção B fica registrada como evolução futura.

---

## 4. Dependências

- **Nenhuma dependência externa adicional** para o cálculo matemático (utilizar o `Math` nativo do JS).
- **Axios** (já instalado) para as chamadas externas (ViaCEP e Mapbox).

---

## 5. Variáveis de Ambiente Necessárias

| Variável | Obrigatória? | Descrição |
| --- | --- | --- |
| `PORT` | Não (default `3000`) | Porta do servidor. |
| `MAPBOX_API_KEY` | Sim (apenas para `/api/distancia`) | Chave pública do Mapbox. |

```env
MAPBOX_API_KEY=sua_chave_publica_aqui
```

**Regra de falha:** se a `MAPBOX_API_KEY` não existir, o serviço **não deve falhar fatalmente** na inicialização — mas a rota `/api/distancia` deve retornar **HTTP 500** informando a ausência da chave.

---

## 6. Arquivos Afetados / Estrutura Desejada

Sugere-se a criação da seguinte estrutura de pastas (MSC) para isolar responsabilidades:

```text
src/
├── controllers/
│   └── CepController.js      # Lida com requisição/resposta (req, res)
├── services/
│   ├── ViaCepService.js      # Isola a lógica de consulta ao ViaCEP
│   └── MapboxService.js      # Isola a lógica de geocoding do Mapbox
├── utils/
│   └── geoUtils.js           # Função pura do cálculo de Haversine
└── routes/
    └── cepRoutes.js          # Roteador do Express
server.js                     # Apenas importa as rotas
```

---

## 7. Critérios de Aceite (Checklist)

- [ ] Rota `GET /api/cep/:cep` retorna os dados do endereço corretamente.
- [ ] Rota `POST /api/distancia` retorna a distância em KM entre os dois pontos.
- [ ] O código utiliza `import`/`export` (ESM) em todos os arquivos.
- [ ] Tratamento de erros *gracefully*: se o ViaCEP ou Mapbox cair, a API não "crasha" — retorna JSON com HTTP `502`/`500` contendo o log do erro rastreável (serviço de origem + operação).