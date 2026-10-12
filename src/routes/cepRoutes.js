import { Router } from 'express';
import { getCep, calculateDistance } from '../controllers/CepController.js';

const router = Router();

// Validação de um único CEP.
router.get('/cep/:cep', getCep);

// Cálculo de distância entre dois CEPs.
router.post('/distancia', calculateDistance);

export default router;
