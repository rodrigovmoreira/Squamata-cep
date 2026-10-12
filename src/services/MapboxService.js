import axios from 'axios';

const MAPBOX_GEOCODING_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const MAPBOX_MATRIX_URL = 'https://api.mapbox.com/directions-matrix/v1/mapbox/driving';

/**
 * Obtém a chave do Mapbox a partir das variáveis de ambiente.
 * @returns {string} Chave de acesso do Mapbox.
 * @throws {Error} Lança erro com `.status = 500` se a chave não estiver configurada.
 */
function getApiKey() {
  const apiKey = process.env.MAPBOX_API_KEY;

  if (!apiKey || apiKey === 'map_box_api_key') {
    const error = new Error('MAPBOX_API_KEY não configurada no .env');
    error.status = 500;
    throw error;
  }

  return apiKey;
}

/**
 * Monta a query de endereço usada no geocoding.
 * @param {object} address - Endereço retornado pelo ViaCEP.
 * @returns {string} Query formatada (ex.: "Rua X, Bairro Y, Cidade Z, UF").
 */
function buildAddressQuery(address) {
  const parts = [address.logradouro, address.bairro, address.localidade, address.uf].filter(Boolean);
  return parts.join(', ');
}

/**
 * Converte um endereço em coordenadas (latitude e longitude) via Mapbox Geocoding.
 * @param {object} address - Endereço retornado pelo ViaCEP.
 * @returns {Promise<{ latitude: number, longitude: number }>} Coordenadas geográficas.
 * @throws {Error} Lança erro com `.status` quando o geocoding falha.
 */
export async function geocodeAddress(address) {
  const apiKey = getApiKey();
  const query = buildAddressQuery(address);

  let response;
  try {
    response = await axios.get(`${MAPBOX_GEOCODING_URL}/${encodeURIComponent(query)}.json`, {
      params: {
        access_token: apiKey,
        country: 'br',
        limit: 1,
      },
      timeout: 5000,
    });
  } catch (requestError) {
    const error = new Error('Falha ao consultar o Mapbox Geocoding');
    error.status = 502;
    error.cause = requestError;
    error.operation = 'mapbox:geocodeAddress';
    throw error;
  }

  const features = response.data?.features;

  if (!Array.isArray(features) || features.length === 0) {
    const error = new Error('Endereço não encontrado pelo Mapbox Geocoding');
    error.status = 404;
    throw error;
  }

  // O Mapbox retorna [longitude, latitude] — atenção à ordem invertida.
  const [longitude, latitude] = features[0].center;

  return { latitude, longitude };
}

/**
 * Calcula a distância (em km) e a duração (em minutos) de carro/moto entre
 * duas coordenadas via Mapbox Matrix API.
 * @param {object} origem - Coordenadas de origem { latitude, longitude }.
 * @param {object} destino - Coordenadas de destino { latitude, longitude }.
 * @returns {Promise<{ distanceKm: number, durationMin: number }>} Distância e duração estimadas.
 * @throws {Error} Lança erro com `.status` quando a Matrix API falha.
 */
export async function fetchDrivingRoute(origem, destino) {
  const apiKey = getApiKey();
  const coordinates = `${origem.longitude},${origem.latitude};${destino.longitude},${destino.latitude}`;

  let response;
  try {
    response = await axios.get(`${MAPBOX_MATRIX_URL}/${coordinates}`, {
      params: {
        access_token: apiKey,
        annotations: 'distance,duration',
      },
      timeout: 5000,
    });
  } catch (requestError) {
    const error = new Error('Falha ao consultar o Mapbox Matrix');
    error.status = 502;
    error.cause = requestError;
    error.operation = 'mapbox:fetchDrivingRoute';
    throw error;
  }

  const distances = response.data?.distances;
  const durations = response.data?.durations;

  if (!Array.isArray(distances) || !Array.isArray(distances[0])) {
    const error = new Error('Rota não encontrada pelo Mapbox Matrix');
    error.status = 404;
    throw error;
  }

  // Matrix API: distances[origem][destino] em metros e durations[origem][destino] em segundos.
  const distanceMeters = distances[0][1];
  const durationSeconds = durations?.[0]?.[1] ?? 0;

  return {
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    durationMin: Math.round(durationSeconds / 60),
  };
}
