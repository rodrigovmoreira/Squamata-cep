# Squamata-CEP

> **Microsserviço de validação de CEP e cálculo de distância geográfica** do ecossistema **Calango Inc.** (suítes Calango e Squamata).

O `Squamata-cep` atua como o **motor de logística e validação geográfica**: valida CEPs brasileiros e calcula a distância entre dois pontos — em linha reta (Haversine) e, opcionalmente, por ruas (rota de carro/moto).

---

## ✨ Funcionalidades

- **Validação de CEP único** via [ViaCEP](https://viacep.com.br/) (gratuito e sem limites).
- **Cálculo de distância entre dois CEPs:**
  - **Linha reta (Haversine)** — calculada nativamente no Node.js, sem custo.
  - **Rota de carro/moto (Mapbox Matrix API)** — opcional, via flag `calcularRota`.
- **Multiuso:** aceita **1 CEP** (apenas valida) ou **2 CEPs** (valida ambos + calcula distância).

---

## 🚀 Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Runtime | Node.js (ESM nativo — `"type": "module"`) |
| Framework | Express |
| HTTP Client | Axios |
| Validação de CEP | ViaCEP |
| Geocoding / Rotas | Mapbox Geocoding API + Mapbox Matrix API |
| Dev | Nodemon |

---

## 📦 Instalação

```bash
# 1. Instale as dependências
npm install

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env e insira a sua MAPBOX_API_KEY

# 3. Inicie o servidor em modo desenvolvimento
npm run dev
```

O servidor sobe em `http://localhost:3000`.

---

## 🔧 Variáveis de Ambiente

| Variável | Obrigatória? | Default | Descrição |
| --- | --- | --- | --- |
| `PORT` | Não | `3000` | Porta do servidor. |
| `MAPBOX_API_KEY` | Sim (apenas para `/api/distancia`) | — | Chave pública do Mapbox. |

> ⚠️ Nunca versione o `.env` — ele já está listado no `.gitignore`.

---

## 🌐 Endpoints

### `GET /api/cep/:cep`

Valida um único CEP e retorna o endereço correspondente.

```http
GET /api/cep/01001000
```

**Resposta `200`:**

```json
{
  "cep": "01001-000",
  "logradouro": "Praça da Sé",
  "complemento": "lado ímpar",
  "bairro": "Sé",
  "localidade": "São Paulo",
  "uf": "SP"
}
```

| Status | Significado |
| --- | --- |
| `200` | CEP válido. |
| `400` | CEP em formato inválido. |
| `404` | CEP não encontrado. |

---

### `POST /api/distancia`

Valida dois CEPs e calcula a distância entre eles.

```http
POST /api/distancia
Content-Type: application/json

{
  "cepOrigem": "01001000",
  "cepDestino": "01310930",
  "calcularRota": true
}
```

| Campo | Obrigatório? | Descrição |
| --- | --- | --- |
| `cepOrigem` | Sim | CEP de origem. |
| `cepDestino` | Sim | CEP de destino. |
| `calcularRota` | Não (default `false`) | Se `true`, calcula também a rota de carro/moto (Matrix API). |

**Resposta `200` (com rota):**

```json
{
  "cepOrigem": "01001000",
  "cepDestino": "01310930",
  "enderecoOrigem": {
    "cep": "01001-000",
    "logradouro": "Praça da Sé",
    "complemento": "lado ímpar",
    "bairro": "Sé",
    "localidade": "São Paulo",
    "uf": "SP"
  },
  "enderecoDestino": {
    "cep": "01310-930",
    "logradouro": "Avenida Paulista",
    "complemento": "2100",
    "bairro": "Bela Vista",
    "localidade": "São Paulo",
    "uf": "SP"
  },
  "distanciaLinhaRetaKm": 2.52,
  "distanciaRotaKm": 3.32,
  "duracaoEstimadaMin": 11
}
```

> Quando `calcularRota` é `false` (ou ausente), os campos `distanciaRotaKm` e `duracaoEstimadaMin` **não** são retornados.

| Status | Significado |
| --- | --- |
| `200` | Distância calculada. |
| `400` | `cepOrigem`/`cepDestino` ausentes ou CEP inválido. |
| `404` | CEP/endereço não encontrado. |
| `500` | `MAPBOX_API_KEY` não configurada. |
| `502` | Falha na comunicação com ViaCEP ou Mapbox. |

---

## 🏗️ Estrutura do Projeto

```text
squamata-cep/
├── src/
│   ├── controllers/
│   │   └── CepController.js      # Lida com req/res — sem regra de negócio
│   ├── services/
│   │   ├── ViaCepService.js      # Consulta e normalização de CEP (ViaCEP)
│   │   └── MapboxService.js      # Geocoding e Matrix API (Mapbox)
│   ├── utils/
│   │   └── geoUtils.js           # Fórmula de Haversine (função pura)
│   └── routes/
│       └── cepRoutes.js          # Roteador do Express
├── server.js                     # Bootstrap do servidor (health check + rotas)
├── .env.example                  # Modelo de variáveis de ambiente
└── package.json
```

---

## 📐 Como funciona o cálculo de distância

1. **CEP → Endereço:** o `ViaCepService` consulta o ViaCEP e valida o CEP.
2. **Endereço → Coordenadas:** o `MapboxService` converte o endereço em Latitude/Longitude (Geocoding).
3. **Cálculo:**
   - **Linha reta:** `geoUtils.haversineDistance()` — raio da Terra de **6371 km**.
   - **Rota (opcional):** `MapboxService.fetchDrivingRoute()` via Matrix API.

---

## 🧭 Governança

Este projeto segue a **Constituição de Engenharia** da Calango Inc., disponível no repositório `Calango-docs`:

- `constitution.md` — princípios fundamentais, stack e regras ("Dos" e "Don'ts").
- `Architecture.md` — topologia de infraestrutura e padrões de microsserviços.

A especificação desta feature está em [`docs/specs/01-endpoints-distancia.md`](./docs/specs/01-endpoints-distancia.md).
