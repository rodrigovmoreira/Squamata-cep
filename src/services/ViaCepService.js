import axios from 'axios';

const VIACEP_BASE_URL = 'https://viacep.com.br/ws';

/**
 * Remove tudo que não for dígito de um CEP.
 * @param {string} cep - CEP informado (pode conter hífen, pontos ou espaços).
 * @returns {string} CEP contendo apenas dígitos.
 */
export function normalizeCep(cep) {
  return String(cep).replace(/\D/g, '');
}

/**
 * Consulta um CEP na API pública do ViaCEP e retorna os dados do endereço.
 * @param {string} cep - CEP a ser consultado.
 * @returns {Promise<object>} Dados do endereço (cep, logradouro, bairro, localidade, uf).
 * @throws {Error} Lança erro com `.status` (400, 404 ou 502) quando a consulta falha.
 */
export async function fetchAddressByCep(cep) {
  const cleanedCep = normalizeCep(cep);

  if (cleanedCep.length !== 8) {
    const error = new Error(`CEP inválido: ${cep}`);
    error.status = 400;
    throw error;
  }

  let response;
  try {
    response = await axios.get(`${VIACEP_BASE_URL}/${cleanedCep}/json/`, { timeout: 5000 });
  } catch (requestError) {
    const error = new Error('Falha ao consultar o ViaCEP');
    error.status = 502;
    error.cause = requestError;
    error.operation = 'viacep:fetchAddressByCep';
    throw error;
  }

  const data = response.data;

  if (!data || data.erro === true) {
    const error = new Error(`CEP não encontrado: ${cleanedCep}`);
    error.status = 404;
    throw error;
  }

  return {
    cep: data.cep,
    logradouro: data.logradouro,
    complemento: data.complemento,
    bairro: data.bairro,
    localidade: data.localidade,
    uf: data.uf,
  };
}
