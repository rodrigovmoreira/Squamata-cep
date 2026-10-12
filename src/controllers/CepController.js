import * as ViaCepService from '../services/ViaCepService.js';
import * as MapboxService from '../services/MapboxService.js';
import { haversineDistance } from '../utils/geoUtils.js';

/**
 * GET /api/cep/:cep
 * Valida um único CEP e retorna o endereço correspondente.
 */
export async function getCep(req, res) {
  const { cep } = req.params;

  try {
    const endereco = await ViaCepService.fetchAddressByCep(cep);
    return res.status(200).json(endereco);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * POST /api/distancia
 * Valida dois CEPs e calcula a distância em linha reta (Haversine)
 * e, opcionalmente, a distância de carro/moto (Matrix API).
 */
export async function calculateDistance(req, res) {
  const { cepOrigem, cepDestino } = req.body || {};
  const calcularRota = Boolean(req.body?.calcularRota);

  // Fail Fast: valida a presença dos dois CEPs antes de qualquer chamada externa.
  if (!cepOrigem || !cepDestino) {
    return res.status(400).json({
      erro: 'Os campos cepOrigem e cepDestino são obrigatórios.',
    });
  }

  try {
    // Etapa 1: valida e obtém o endereço dos dois CEPs (ViaCEP).
    const [enderecoOrigem, enderecoDestino] = await Promise.all([
      ViaCepService.fetchAddressByCep(cepOrigem),
      ViaCepService.fetchAddressByCep(cepDestino),
    ]);

    // Etapa 2: converte os endereços em coordenadas (Mapbox Geocoding).
    const [coordenadasOrigem, coordenadasDestino] = await Promise.all([
      MapboxService.geocodeAddress(enderecoOrigem),
      MapboxService.geocodeAddress(enderecoDestino),
    ]);

    // Etapa 3: calcula a distância em linha reta (Haversine).
    const distanciaLinhaReta = haversineDistance(
      coordenadasOrigem.latitude,
      coordenadasOrigem.longitude,
      coordenadasDestino.latitude,
      coordenadasDestino.longitude,
    );

    const resultado = {
      cepOrigem: ViaCepService.normalizeCep(cepOrigem),
      cepDestino: ViaCepService.normalizeCep(cepDestino),
      enderecoOrigem,
      enderecoDestino,
      distanciaLinhaRetaKm: distanciaLinhaReta,
    };

    // Etapa 4 (opcional): calcula a distância de carro/moto (Matrix API).
    if (calcularRota) {
      const rota = await MapboxService.fetchDrivingRoute(coordenadasOrigem, coordenadasDestino);
      resultado.distanciaRotaKm = rota.distanceKm;
      resultado.duracaoEstimadaMin = rota.durationMin;
    }

    return res.status(200).json(resultado);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * Converte um erro em uma resposta HTTP adequada e registra um log rastreável.
 * @param {object} res - Objeto de resposta do Express.
 * @param {Error} error - Erro capturado (pode conter .status e .operation).
 */
function handleError(res, error) {
  const status = error.status || 500;

  console.error({
    service: 'squamata-cep',
    operation: error.operation || 'cep:controller',
    status,
    message: error.message,
  });

  return res.status(status).json({ erro: error.message });
}
