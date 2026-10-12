// Raio médio da Terra em quilômetros.
const EARTH_RADIUS_KM = 6371;

/**
 * Converte um ângulo de graus para radianos.
 * @param {number} degrees - Ângulo em graus.
 * @returns {number} Ângulo em radianos.
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calcula a distância em linha reta (ortodrômica) entre duas coordenadas
 * utilizando a Fórmula de Haversine.
 * @param {number} lat1 - Latitude do ponto de origem.
 * @param {number} lon1 - Longitude do ponto de origem.
 * @param {number} lat2 - Latitude do ponto de destino.
 * @param {number} lon2 - Longitude do ponto de destino.
 * @returns {number} Distância em quilômetros (arredondada para 2 casas decimais).
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceKm = EARTH_RADIUS_KM * c;

  return Math.round(distanceKm * 100) / 100;
}
